import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    ptPackage: {
      findFirst: vi.fn(),
    },
    sessionInstance: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock('@/lib/audit', () => ({ auditLog: vi.fn() }));
vi.mock('@/services/notification.service', () => ({
  notifySessionStarted: vi.fn(),
  notifyNoShow: vi.fn(),
}));
vi.mock('@/services/badge.service', () => ({
  evaluateStreakBadges: vi.fn(),
  evaluateSessionMilestoneBadges: vi.fn(),
}));
vi.mock('@/lib/pusher', () => ({ triggerSessionEvent: vi.fn() }));

import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';
import { bookSessionByTrainer } from '@/services/session.service';

const BRANCH = 'branch-1';
const TRAINER = 'tp-1';
const CLIENT = 'cp-1';
const ACTOR = 'trainer-user-1';

const baseInput = {
  trainerProfileId: TRAINER,
  clientProfileId: CLIENT,
  branchId: BRANCH,
  actorId: ACTOR,
  scheduledDate: '2026-04-25',
  scheduledTime: '09:00',
  durationMin: 60,
};

const activePtPackage = {
  id: 'pkg-1',
  trainerProfileId: TRAINER,
  clientProfileId: CLIENT,
  branchId: BRANCH,
  isActive: true,
};

beforeEach(() => vi.resetAllMocks());

// ─── Assignment guard ─────────────────────────────────────────────────────────

describe('bookSessionByTrainer — assignment guard', () => {
  it('throws 403 NOT_ASSIGNED if trainer has no active PtPackage for this client', async () => {
    (prisma.ptPackage.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(bookSessionByTrainer(baseInput)).rejects.toMatchObject({
      code: 'NOT_ASSIGNED',
      statusCode: 403,
    });

    expect(prisma.sessionInstance.create).not.toHaveBeenCalled();
  });

  it('throws 403 if PtPackage exists but is inactive (isActive: false)', async () => {
    // findFirst with isActive: true filter returns null for inactive packages
    (prisma.ptPackage.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(bookSessionByTrainer(baseInput)).rejects.toMatchObject({
      code: 'NOT_ASSIGNED',
      statusCode: 403,
    });
  });
});

// ─── Conflict detection ───────────────────────────────────────────────────────

describe('bookSessionByTrainer — conflict detection', () => {
  beforeEach(() => {
    (prisma.ptPackage.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(activePtPackage);
  });

  it('throws 409 TRAINER_CONFLICT if trainer already has an overlapping session', async () => {
    // Trainer has a session 08:30–09:30, new slot 09:00–10:00 overlaps
    (prisma.sessionInstance.findMany as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([{ scheduledTime: '08:30', durationMin: 60 }]) // trainer conflicts
      .mockResolvedValueOnce([]); // client conflicts (not reached)

    await expect(bookSessionByTrainer(baseInput)).rejects.toMatchObject({
      code: 'TRAINER_CONFLICT',
      statusCode: 409,
    });

    expect(prisma.sessionInstance.create).not.toHaveBeenCalled();
  });

  it('throws 409 CLIENT_CONFLICT if client already has an overlapping session', async () => {
    // Trainer is free, client has session 09:30–10:30, new slot 09:00–10:00 overlaps
    (prisma.sessionInstance.findMany as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([]) // trainer: no conflicts
      .mockResolvedValueOnce([{ scheduledTime: '09:30', durationMin: 60 }]); // client: overlap

    await expect(bookSessionByTrainer(baseInput)).rejects.toMatchObject({
      code: 'CLIENT_CONFLICT',
      statusCode: 409,
    });

    expect(prisma.sessionInstance.create).not.toHaveBeenCalled();
  });

  it('does not conflict when existing session ends exactly when new one starts', async () => {
    // Existing 07:00–09:00 (120 min), new starts at 09:00 — no overlap
    (prisma.sessionInstance.findMany as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([{ scheduledTime: '07:00', durationMin: 120 }])
      .mockResolvedValueOnce([]);

    const newSession = {
      id: 'new-sess',
      branchId: BRANCH,
      status: 'SCHEDULED',
      client: { user: { firstName: 'Alice', lastName: 'C' } },
      trainer: { user: { firstName: 'Dev', lastName: 'T' } },
    };
    (prisma.sessionInstance.create as ReturnType<typeof vi.fn>).mockResolvedValue(newSession);

    await expect(bookSessionByTrainer(baseInput)).resolves.toBeDefined();
  });
});

// ─── Successful booking ───────────────────────────────────────────────────────

describe('bookSessionByTrainer — success', () => {
  it('creates session instance and writes audit log', async () => {
    (prisma.ptPackage.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(activePtPackage);
    (prisma.sessionInstance.findMany as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([]) // trainer: no conflicts
      .mockResolvedValueOnce([]); // client: no conflicts

    const newSession = {
      id: 'new-sess-1',
      branchId: BRANCH,
      clientProfileId: CLIENT,
      trainerProfileId: TRAINER,
      status: 'SCHEDULED',
      scheduledTime: '09:00',
      durationMin: 60,
      client: { user: { firstName: 'Alice', lastName: 'Client' } },
      trainer: { user: { firstName: 'Dev', lastName: 'Trainer' } },
    };
    (prisma.sessionInstance.create as ReturnType<typeof vi.fn>).mockResolvedValue(newSession);

    const result = await bookSessionByTrainer(baseInput);

    expect(prisma.sessionInstance.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          branchId: BRANCH,
          clientProfileId: CLIENT,
          trainerProfileId: TRAINER,
          scheduledTime: '09:00',
          durationMin: 60,
          status: 'SCHEDULED',
        }),
      }),
    );

    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SESSION_BOOKED_BY_TRAINER',
        actorId: ACTOR,
        subjectId: 'new-sess-1',
        branchId: BRANCH,
      }),
    );

    expect(result.id).toBe('new-sess-1');
  });
});
