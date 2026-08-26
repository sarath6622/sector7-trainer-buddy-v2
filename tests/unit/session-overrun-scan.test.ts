import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    sessionInstance: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    notificationLog: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
  },
}));

vi.mock('@/lib/audit', () => ({ auditLog: vi.fn() }));
vi.mock('@/lib/pusher', () => ({
  triggerSessionEvent: vi.fn(),
  triggerSessionPauseEvent: vi.fn(),
}));
vi.mock('@/services/badge.service', () => ({
  evaluateStreakBadges: vi.fn().mockResolvedValue([]),
  evaluateSessionMilestoneBadges: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/services/notification.service', () => ({
  notifySessionStarted: vi.fn(),
  notifyNoShow: vi.fn(),
  notifySessionBooked: vi.fn(),
  notifySessionOverrun: vi.fn(),
  notifySessionAutoClosed: vi.fn(),
  notifyAdminsSessionAutoClosed: vi.fn(),
}));

import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';
import {
  notifySessionOverrun,
  notifySessionAutoClosed,
  notifyAdminsSessionAutoClosed,
} from '@/services/notification.service';
import { processOverrunReminders, SYSTEM_ACTOR_ID } from '@/services/session.service';
import { AUTO_CLOSE_AFTER_MIN } from '@/lib/sessionOverrun';

const NOW = new Date('2026-07-16T10:00:00.000Z');
const BRANCH = 'branch-1';

const findMany = prisma.sessionInstance.findMany as ReturnType<typeof vi.fn>;
const update = prisma.sessionInstance.update as ReturnType<typeof vi.fn>;
const logFindMany = prisma.notificationLog.findMany as ReturnType<typeof vi.fn>;
const userFindMany = prisma.user.findMany as ReturnType<typeof vi.fn>;

/** An IN_PROGRESS row shaped like the scan's `select`. */
function openSession({
  id = 'sess-1',
  minutesAgo = 90,
  durationMin = 60,
  branchId = BRANCH,
}: { id?: string; minutesAgo?: number; durationMin?: number; branchId?: string } = {}) {
  return {
    id,
    branchId,
    durationMin,
    startedAt: new Date(NOW.getTime() - minutesAgo * 60_000),
    accumulatedPausedSec: 0,
    pausedAt: null,
    clientProfileId: 'cp-1',
    trainerProfileId: 'tp-1',
    client: { user: { firstName: 'Test', lastName: 'Client' } },
    trainer: { user: { id: 'trainer-user-1', firstName: 'Test', lastName: 'Trainer' } },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  logFindMany.mockResolvedValue([]);
  userFindMany.mockResolvedValue([]);
  update.mockResolvedValue({});
});

describe('processOverrunReminders — reminders', () => {
  it('does nothing when no session is open', async () => {
    findMany.mockResolvedValue([]);

    const result = await processOverrunReminders(NOW);

    expect(result).toEqual({ scanned: 0, remindersSent: 0, autoClosed: 0 });
    expect(notifySessionOverrun).not.toHaveBeenCalled();
    expect(logFindMany).not.toHaveBeenCalled();
  });

  it('does not nudge a session still inside its booked duration', async () => {
    findMany.mockResolvedValue([openSession({ minutesAgo: 30, durationMin: 60 })]);

    const result = await processOverrunReminders(NOW);

    expect(result).toEqual({ scanned: 1, remindersSent: 0, autoClosed: 0 });
    expect(notifySessionOverrun).not.toHaveBeenCalled();
  });

  it('sends a stage-1 nudge to the trainer at the booked end', async () => {
    findMany.mockResolvedValue([openSession({ minutesAgo: 61, durationMin: 60 })]);

    const result = await processOverrunReminders(NOW);

    expect(result.remindersSent).toBe(1);
    expect(notifySessionOverrun).toHaveBeenCalledTimes(1);
    expect(notifySessionOverrun).toHaveBeenCalledWith(
      expect.objectContaining({
        branchId: BRANCH,
        trainerUserId: 'trainer-user-1',
        clientName: 'Test Client',
        sessionInstanceId: 'sess-1',
        stage: 1,
      }),
    );
  });

  it('skips a stage whose notification was already logged', async () => {
    findMany.mockResolvedValue([openSession({ minutesAgo: 61, durationMin: 60 })]);
    logFindMany.mockResolvedValue([
      { metadata: { type: 'SESSION_OVERRUN', sessionInstanceId: 'sess-1', stage: 1 } },
    ]);

    const result = await processOverrunReminders(NOW);

    expect(result.remindersSent).toBe(0);
    expect(notifySessionOverrun).not.toHaveBeenCalled();
  });

  it('escalates to stage 2 once stage 1 has been sent', async () => {
    findMany.mockResolvedValue([openSession({ minutesAgo: 80, durationMin: 60 })]);
    logFindMany.mockResolvedValue([
      { metadata: { type: 'SESSION_OVERRUN', sessionInstanceId: 'sess-1', stage: 1 } },
    ]);

    await processOverrunReminders(NOW);

    expect(notifySessionOverrun).toHaveBeenCalledWith(expect.objectContaining({ stage: 2 }));
  });

  it('sends only the highest due stage, never a backlog of both', async () => {
    // First seen 20 minutes late — stage 1 and 2 are both "due", but the
    // trainer should get one notification, not two.
    findMany.mockResolvedValue([openSession({ minutesAgo: 80, durationMin: 60 })]);

    const result = await processOverrunReminders(NOW);

    expect(result.remindersSent).toBe(1);
    expect(notifySessionOverrun).toHaveBeenCalledTimes(1);
    expect(notifySessionOverrun).toHaveBeenCalledWith(expect.objectContaining({ stage: 2 }));
  });

  it('goes quiet permanently once stage 2 is logged', async () => {
    findMany.mockResolvedValue([openSession({ minutesAgo: 600, durationMin: 60 })]);
    logFindMany.mockResolvedValue([
      { metadata: { type: 'SESSION_OVERRUN', sessionInstanceId: 'sess-1', stage: 2 } },
    ]);

    const result = await processOverrunReminders(NOW);

    expect(result.remindersSent).toBe(0);
    expect(notifySessionOverrun).not.toHaveBeenCalled();
  });

  it('tracks stages per session, not globally', async () => {
    findMany.mockResolvedValue([
      openSession({ id: 'sess-1', minutesAgo: 61 }),
      openSession({ id: 'sess-2', minutesAgo: 61 }),
    ]);
    logFindMany.mockResolvedValue([
      { metadata: { type: 'SESSION_OVERRUN', sessionInstanceId: 'sess-1', stage: 1 } },
    ]);

    const result = await processOverrunReminders(NOW);

    expect(result.remindersSent).toBe(1);
    expect(notifySessionOverrun).toHaveBeenCalledWith(
      expect.objectContaining({ sessionInstanceId: 'sess-2', stage: 1 }),
    );
  });

  it('ignores malformed notification metadata rather than throwing', async () => {
    findMany.mockResolvedValue([openSession({ minutesAgo: 61, durationMin: 60 })]);
    logFindMany.mockResolvedValue([
      { metadata: null },
      { metadata: { sessionInstanceId: 'sess-1' } },
      { metadata: { sessionInstanceId: 'sess-1', stage: 'one' } },
    ]);

    const result = await processOverrunReminders(NOW);

    expect(result.remindersSent).toBe(1);
  });
});

describe('processOverrunReminders — 24h auto-close', () => {
  const stale = () => openSession({ minutesAgo: AUTO_CLOSE_AFTER_MIN + 60, durationMin: 60 });

  it('closes a session left open past 24h at its booked duration', async () => {
    const session = stale();
    findMany.mockResolvedValue([session]);

    const result = await processOverrunReminders(NOW);

    expect(result).toEqual({ scanned: 1, remindersSent: 0, autoClosed: 1 });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'sess-1' },
      data: {
        status: 'COMPLETED',
        // booked end, not `now` — keeps endedAt - startedAt == actualDurationMin
        endedAt: new Date(session.startedAt.getTime() + 60 * 60_000),
        endedByUserId: SYSTEM_ACTOR_ID,
        actualDurationMin: 60,
        pausedAt: null,
      },
    });
  });

  it('does not nudge a session it is auto-closing', async () => {
    findMany.mockResolvedValue([stale()]);

    await processOverrunReminders(NOW);

    expect(notifySessionOverrun).not.toHaveBeenCalled();
  });

  it('audits the close as system-initiated', async () => {
    findMany.mockResolvedValue([stale()]);

    await processOverrunReminders(NOW);

    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SESSION_AUTO_CLOSED',
        actorId: 'trainer-user-1',
        subjectType: 'SessionInstance',
        subjectId: 'sess-1',
        branchId: BRANCH,
        metadata: expect.objectContaining({
          autoClosed: true,
          closedBy: SYSTEM_ACTOR_ID,
          durationSource: 'BOOKED',
        }),
      }),
    );
  });

  it('notifies the trainer and the branch admins', async () => {
    findMany.mockResolvedValue([stale()]);
    userFindMany.mockResolvedValue([
      { id: 'admin-1', branchId: BRANCH },
      { id: 'admin-2', branchId: BRANCH },
    ]);

    await processOverrunReminders(NOW);

    expect(notifySessionAutoClosed).toHaveBeenCalledWith(
      expect.objectContaining({ trainerUserId: 'trainer-user-1', durationMin: 60 }),
    );
    expect(notifyAdminsSessionAutoClosed).toHaveBeenCalledWith(
      expect.objectContaining({ adminUserIds: ['admin-1', 'admin-2'] }),
    );
  });

  it('routes each branch its own admins', async () => {
    findMany.mockResolvedValue([
      openSession({ id: 'a', minutesAgo: AUTO_CLOSE_AFTER_MIN + 1, branchId: 'branch-a' }),
      openSession({ id: 'b', minutesAgo: AUTO_CLOSE_AFTER_MIN + 1, branchId: 'branch-b' }),
    ]);
    userFindMany.mockResolvedValue([
      { id: 'admin-a', branchId: 'branch-a' },
      { id: 'admin-b', branchId: 'branch-b' },
    ]);

    await processOverrunReminders(NOW);

    expect(notifyAdminsSessionAutoClosed).toHaveBeenCalledWith(
      expect.objectContaining({ branchId: 'branch-a', adminUserIds: ['admin-a'] }),
    );
    expect(notifyAdminsSessionAutoClosed).toHaveBeenCalledWith(
      expect.objectContaining({ branchId: 'branch-b', adminUserIds: ['admin-b'] }),
    );
  });

  it('skips the admin fan-out when a branch has no active admin', async () => {
    findMany.mockResolvedValue([stale()]);
    userFindMany.mockResolvedValue([]);

    const result = await processOverrunReminders(NOW);

    expect(result.autoClosed).toBe(1);
    expect(notifyAdminsSessionAutoClosed).not.toHaveBeenCalled();
  });

  it('keeps going when one session fails to close', async () => {
    findMany.mockResolvedValue([
      openSession({ id: 'bad', minutesAgo: AUTO_CLOSE_AFTER_MIN + 1 }),
      openSession({ id: 'good', minutesAgo: AUTO_CLOSE_AFTER_MIN + 1 }),
    ]);
    update.mockRejectedValueOnce(new Error('db down')).mockResolvedValue({});

    const result = await processOverrunReminders(NOW);

    expect(result.autoClosed).toBe(1);
    expect(auditLog).toHaveBeenCalledTimes(1);
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ subjectId: 'good' }));
  });

  it('handles reminders and auto-closes in the same pass', async () => {
    findMany.mockResolvedValue([
      openSession({ id: 'overrunning', minutesAgo: 61, durationMin: 60 }),
      openSession({ id: 'abandoned', minutesAgo: AUTO_CLOSE_AFTER_MIN + 1, durationMin: 60 }),
    ]);

    const result = await processOverrunReminders(NOW);

    expect(result).toEqual({ scanned: 2, remindersSent: 1, autoClosed: 1 });
    expect(notifySessionOverrun).toHaveBeenCalledWith(
      expect.objectContaining({ sessionInstanceId: 'overrunning' }),
    );
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'abandoned' } }),
    );
  });
});
