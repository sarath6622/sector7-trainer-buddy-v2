import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    sessionInstance: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('@/lib/audit', () => ({ auditLog: vi.fn() }));
vi.mock('@/services/notification.service', () => ({
  notifySessionStarted: vi.fn(),
  notifyNoShow: vi.fn(),
}));

import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';
import * as sessionService from '@/services/session.service';

const BRANCH = 'branch-1';
const ACTOR = 'actor-1';
const TRAINER = 'tp-1';

beforeEach(() => vi.clearAllMocks());

// ─── startSession ───────────────────────────────────

describe('startSession', () => {
  const input = {
    sessionId: 'sess-1',
    trainerProfileId: TRAINER,
    actorId: ACTOR,
    branchId: BRANCH,
  };

  it('should throw if session not found', async () => {
    (prisma.sessionInstance.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(sessionService.startSession(input)).rejects.toThrow('Session not found');
  });

  it('should throw if session is not SCHEDULED', async () => {
    (prisma.sessionInstance.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'sess-1',
      status: 'COMPLETED',
      branchId: BRANCH,
      trainerProfileId: TRAINER,
    });
    await expect(sessionService.startSession(input)).rejects.toThrow('Cannot start a session');
  });

  it('should throw if trainer already has an active session', async () => {
    // First call: find the session
    (prisma.sessionInstance.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        id: 'sess-1',
        status: 'SCHEDULED',
        branchId: BRANCH,
        trainerProfileId: TRAINER,
        clientProfileId: 'cp-1',
        durationMin: 60,
      })
      // Second call: check for active session
      .mockResolvedValueOnce({ id: 'other-sess', status: 'IN_PROGRESS' });

    await expect(sessionService.startSession(input)).rejects.toThrow(
      'already have an active session',
    );
  });

  it('should start session, update status, and write audit log', async () => {
    const mockSession = {
      id: 'sess-1',
      status: 'SCHEDULED',
      branchId: BRANCH,
      trainerProfileId: TRAINER,
      clientProfileId: 'cp-1',
      durationMin: 60,
      scheduledTime: '09:00',
    };

    (prisma.sessionInstance.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(mockSession) // find session
      .mockResolvedValueOnce(null); // no active session

    const updatedSession = {
      ...mockSession,
      status: 'IN_PROGRESS',
      startedAt: expect.any(Date),
      client: { user: { id: 'user-c1', firstName: 'John', lastName: 'Doe' } },
      trainer: { user: { id: 'user-t1', firstName: 'Jane', lastName: 'Trainer' } },
    };
    (prisma.sessionInstance.update as ReturnType<typeof vi.fn>).mockResolvedValue(updatedSession);

    const result = await sessionService.startSession(input);

    expect(prisma.sessionInstance.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sess-1' },
        data: expect.objectContaining({
          status: 'IN_PROGRESS',
          startedByUserId: ACTOR,
        }),
      }),
    );

    expect(result.timer.expectedDurationMin).toBe(60);
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SESSION_STARTED',
        actorId: ACTOR,
        subjectId: 'sess-1',
        branchId: BRANCH,
      }),
    );
  });
});

// ─── endSession ───────────────────────────────────

describe('endSession', () => {
  const input = {
    sessionId: 'sess-1',
    trainerProfileId: TRAINER,
    actorId: ACTOR,
    branchId: BRANCH,
  };

  it('should throw if session not found', async () => {
    (prisma.sessionInstance.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(sessionService.endSession(input)).rejects.toThrow('Session not found');
  });

  it('should throw if session is not IN_PROGRESS', async () => {
    (prisma.sessionInstance.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'sess-1',
      status: 'SCHEDULED',
      branchId: BRANCH,
      trainerProfileId: TRAINER,
    });
    await expect(sessionService.endSession(input)).rejects.toThrow('Cannot end a session');
  });

  it('should end session, calculate duration, and write audit log', async () => {
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
    const mockSession = {
      id: 'sess-1',
      status: 'IN_PROGRESS',
      branchId: BRANCH,
      trainerProfileId: TRAINER,
      clientProfileId: 'cp-1',
      startedAt: thirtyMinAgo,
      durationMin: 60,
    };

    (prisma.sessionInstance.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockSession,
    );
    (prisma.sessionInstance.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockSession,
      status: 'COMPLETED',
    });

    const result = await sessionService.endSession(input);

    expect(prisma.sessionInstance.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sess-1' },
        data: expect.objectContaining({
          status: 'COMPLETED',
          endedByUserId: ACTOR,
        }),
      }),
    );

    expect(result.actualDurationMin).toBeGreaterThanOrEqual(29);
    expect(result.actualDurationMin).toBeLessThanOrEqual(31);
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SESSION_ENDED',
        subjectId: 'sess-1',
      }),
    );
  });
});

// ─── markNoShow ───────────────────────────────────

describe('markNoShow', () => {
  const input = {
    sessionId: 'sess-1',
    trainerProfileId: TRAINER,
    actorId: ACTOR,
    branchId: BRANCH,
  };

  it('should throw if session not found', async () => {
    (prisma.sessionInstance.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(sessionService.markNoShow(input)).rejects.toThrow('Session not found');
  });

  it('should throw if session is not SCHEDULED', async () => {
    (prisma.sessionInstance.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'sess-1',
      status: 'IN_PROGRESS',
    });
    await expect(sessionService.markNoShow(input)).rejects.toThrow('Cannot mark no-show');
  });

  it('should mark no-show and write audit log', async () => {
    const mockSession = {
      id: 'sess-1',
      status: 'SCHEDULED',
      branchId: BRANCH,
      trainerProfileId: TRAINER,
      clientProfileId: 'cp-1',
      scheduledDate: new Date('2026-03-20'),
      scheduledTime: '09:00',
    };

    (prisma.sessionInstance.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockSession,
    );
    (prisma.sessionInstance.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockSession,
      status: 'NO_SHOW',
      client: { user: { id: 'user-c1', firstName: 'John', lastName: 'Doe' } },
      trainer: { user: { id: 'user-t1', firstName: 'Jane', lastName: 'Trainer' } },
    });

    await sessionService.markNoShow(input);

    expect(prisma.sessionInstance.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sess-1' },
        data: expect.objectContaining({
          status: 'NO_SHOW',
          noShowMarkedByUserId: ACTOR,
        }),
      }),
    );

    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SESSION_NO_SHOW',
        subjectId: 'sess-1',
      }),
    );
  });
});

// ─── getSessionCounts ───────────────────────────────

describe('getSessionCounts', () => {
  it('should return correct session counts by status', async () => {
    (prisma.sessionInstance.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { status: 'COMPLETED', isCarryForward: false },
      { status: 'COMPLETED', isCarryForward: true },
      { status: 'SCHEDULED', isCarryForward: false },
      { status: 'NO_SHOW', isCarryForward: false },
      { status: 'CANCELLED', isCarryForward: false },
      { status: 'IN_PROGRESS', isCarryForward: false },
    ]);

    const result = await sessionService.getSessionCounts({
      clientProfileId: 'cp-1',
      branchId: BRANCH,
      month: '2026-04',
    });

    expect(result.total).toBe(6);
    expect(result.completed).toBe(2);
    expect(result.noShow).toBe(1);
    expect(result.cancelled).toBe(1);
    expect(result.scheduled).toBe(1);
    expect(result.inProgress).toBe(1);
    expect(result.carryForward).toBe(1);
    expect(result.used).toBe(3); // completed + noShow
    expect(result.remaining).toBe(2); // scheduled + inProgress
  });
});
