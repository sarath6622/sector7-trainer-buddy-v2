import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    kickboxingClass: {
      findFirst: vi.fn(),
    },
    kickboxingSession: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    kickboxingAttendance: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    clientProfile: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock('@/lib/audit', () => ({
  auditLog: vi.fn(),
}));

import { prisma } from '@/lib/prisma';
import {
  getOrCreateKickboxingSession,
  startKickboxingSession,
  endKickboxingSession,
  markKickboxingAttendance,
  removeKickboxingAttendance,
  getKickboxingAttendance,
} from '@/services/kickboxing.service';

const BRANCH = 'branch-1';
const ACTOR = 'trainer-1';
const SESSION_ID = 'sess-1';
const CLASS_ID = 'cls-1';
const DATE = new Date('2026-04-24T00:00:00.000Z');

describe('kickboxing.service — sessions & attendance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── getOrCreateKickboxingSession ──────────────────────────────────────────

  describe('getOrCreateKickboxingSession', () => {
    it('returns existing session when one exists for classId+date', async () => {
      (prisma.kickboxingClass.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: CLASS_ID,
        branchId: BRANCH,
        isActive: true,
      });
      const existing = {
        id: SESSION_ID,
        classId: CLASS_ID,
        date: DATE,
        status: 'SCHEDULED',
        _count: { attendances: 0 },
      };
      (prisma.kickboxingSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(existing);

      const result = await getOrCreateKickboxingSession(CLASS_ID, DATE, BRANCH, ACTOR);

      expect(result.id).toBe(SESSION_ID);
      expect(prisma.kickboxingSession.create).not.toHaveBeenCalled();
    });

    it('creates a new session when none exists', async () => {
      (prisma.kickboxingClass.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: CLASS_ID,
        branchId: BRANCH,
        isActive: true,
      });
      (prisma.kickboxingSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      const created = {
        id: 'sess-new',
        classId: CLASS_ID,
        branchId: BRANCH,
        date: DATE,
        status: 'SCHEDULED',
        _count: { attendances: 0 },
      };
      (prisma.kickboxingSession.create as ReturnType<typeof vi.fn>).mockResolvedValue(created);

      const result = await getOrCreateKickboxingSession(CLASS_ID, DATE, BRANCH, ACTOR);

      expect(result.id).toBe('sess-new');
      expect(prisma.kickboxingSession.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ branchId: BRANCH, classId: CLASS_ID }),
        }),
      );
    });

    it('throws NOT_FOUND if kickboxing class does not exist', async () => {
      (prisma.kickboxingClass.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(
        getOrCreateKickboxingSession('cls-invalid', DATE, BRANCH, ACTOR),
      ).rejects.toThrow('Kickboxing class not found');
    });
  });

  // ─── startKickboxingSession ────────────────────────────────────────────────

  describe('startKickboxingSession', () => {
    it('starts a SCHEDULED session', async () => {
      (prisma.kickboxingSession.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: SESSION_ID,
        branchId: BRANCH,
        status: 'SCHEDULED',
      });
      const updated = {
        id: SESSION_ID,
        status: 'IN_PROGRESS',
        startedAt: new Date(),
        _count: { attendances: 0 },
      };
      (prisma.kickboxingSession.update as ReturnType<typeof vi.fn>).mockResolvedValue(updated);

      const result = await startKickboxingSession(SESSION_ID, BRANCH, ACTOR);

      expect(result.status).toBe('IN_PROGRESS');
      expect(prisma.kickboxingSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'IN_PROGRESS',
            startedByUserId: ACTOR,
          }),
        }),
      );
    });

    it('is idempotent — returns session unchanged if already IN_PROGRESS', async () => {
      const inProgress = {
        id: SESSION_ID,
        branchId: BRANCH,
        status: 'IN_PROGRESS',
        startedAt: new Date(),
      };
      (prisma.kickboxingSession.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        inProgress,
      );

      const result = await startKickboxingSession(SESSION_ID, BRANCH, ACTOR);

      expect(result.status).toBe('IN_PROGRESS');
      expect(prisma.kickboxingSession.update).not.toHaveBeenCalled();
    });

    it('throws CONFLICT if session is already COMPLETED', async () => {
      (prisma.kickboxingSession.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: SESSION_ID,
        branchId: BRANCH,
        status: 'COMPLETED',
      });

      await expect(startKickboxingSession(SESSION_ID, BRANCH, ACTOR)).rejects.toThrow(
        'Session is already completed',
      );
    });

    it('throws NOT_FOUND for missing session', async () => {
      (prisma.kickboxingSession.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(startKickboxingSession('sess-invalid', BRANCH, ACTOR)).rejects.toThrow(
        'Kickboxing session not found',
      );
    });
  });

  // ─── endKickboxingSession ──────────────────────────────────────────────────

  describe('endKickboxingSession', () => {
    it('ends an IN_PROGRESS session', async () => {
      (prisma.kickboxingSession.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: SESSION_ID,
        branchId: BRANCH,
        status: 'IN_PROGRESS',
      });
      const updated = {
        id: SESSION_ID,
        status: 'COMPLETED',
        endedAt: new Date(),
        _count: { attendances: 3 },
      };
      (prisma.kickboxingSession.update as ReturnType<typeof vi.fn>).mockResolvedValue(updated);

      const result = await endKickboxingSession(SESSION_ID, BRANCH, ACTOR);

      expect(result.status).toBe('COMPLETED');
      expect(prisma.kickboxingSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'COMPLETED' }),
        }),
      );
    });

    it('is idempotent — returns session unchanged if already COMPLETED', async () => {
      const completed = {
        id: SESSION_ID,
        branchId: BRANCH,
        status: 'COMPLETED',
        endedAt: new Date(),
      };
      (prisma.kickboxingSession.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(completed);

      const result = await endKickboxingSession(SESSION_ID, BRANCH, ACTOR);

      expect(result.status).toBe('COMPLETED');
      expect(prisma.kickboxingSession.update).not.toHaveBeenCalled();
    });

    it('throws CONFLICT if session has not been started (SCHEDULED)', async () => {
      (prisma.kickboxingSession.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: SESSION_ID,
        branchId: BRANCH,
        status: 'SCHEDULED',
      });

      await expect(endKickboxingSession(SESSION_ID, BRANCH, ACTOR)).rejects.toThrow(
        'Session has not been started yet',
      );
    });

    it('throws NOT_FOUND for missing session', async () => {
      (prisma.kickboxingSession.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(endKickboxingSession('sess-invalid', BRANCH, ACTOR)).rejects.toThrow(
        'Kickboxing session not found',
      );
    });
  });

  // ─── markKickboxingAttendance ──────────────────────────────────────────────

  describe('markKickboxingAttendance', () => {
    it('marks attendance for an enrolled client', async () => {
      (prisma.kickboxingSession.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: SESSION_ID,
        branchId: BRANCH,
        status: 'IN_PROGRESS',
      });
      (prisma.clientProfile.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'cp-1',
      });
      (prisma.kickboxingAttendance.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      const created = {
        id: 'att-1',
        sessionId: SESSION_ID,
        clientProfileId: 'cp-1',
        externalName: null,
        client: { user: { firstName: 'Alice', lastName: 'Smith', profileImageUrl: null } },
      };
      (prisma.kickboxingAttendance.create as ReturnType<typeof vi.fn>).mockResolvedValue(created);

      const result = await markKickboxingAttendance(
        SESSION_ID,
        { clientProfileId: 'cp-1' },
        ACTOR,
        BRANCH,
      );

      expect(result.id).toBe('att-1');
      expect(prisma.kickboxingAttendance.create).toHaveBeenCalled();
    });

    it('marks attendance for a walk-in (external name)', async () => {
      (prisma.kickboxingSession.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: SESSION_ID,
        branchId: BRANCH,
        status: 'IN_PROGRESS',
      });
      const created = {
        id: 'att-2',
        sessionId: SESSION_ID,
        clientProfileId: null,
        externalName: 'Walk-In Person',
        client: null,
      };
      (prisma.kickboxingAttendance.create as ReturnType<typeof vi.fn>).mockResolvedValue(created);

      const result = await markKickboxingAttendance(
        SESSION_ID,
        { externalName: 'Walk-In Person' },
        ACTOR,
        BRANCH,
      );

      expect(result.externalName).toBe('Walk-In Person');
    });

    it('throws CONFLICT when session is COMPLETED (attendance locked)', async () => {
      (prisma.kickboxingSession.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: SESSION_ID,
        branchId: BRANCH,
        status: 'COMPLETED',
      });

      await expect(
        markKickboxingAttendance(SESSION_ID, { clientProfileId: 'cp-1' }, ACTOR, BRANCH),
      ).rejects.toThrow('attendance is locked');
    });

    it('throws DUPLICATE when client already marked present', async () => {
      (prisma.kickboxingSession.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: SESSION_ID,
        branchId: BRANCH,
        status: 'IN_PROGRESS',
      });
      (prisma.clientProfile.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'cp-1',
      });
      (prisma.kickboxingAttendance.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'att-existing',
      });

      await expect(
        markKickboxingAttendance(SESSION_ID, { clientProfileId: 'cp-1' }, ACTOR, BRANCH),
      ).rejects.toThrow('already marked present');
    });

    it('throws VALIDATION_ERROR when neither clientProfileId nor externalName provided', async () => {
      (prisma.kickboxingSession.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: SESSION_ID,
        branchId: BRANCH,
        status: 'IN_PROGRESS',
      });

      await expect(markKickboxingAttendance(SESSION_ID, {}, ACTOR, BRANCH)).rejects.toThrow(
        'clientProfileId or externalName is required',
      );
    });
  });

  // ─── removeKickboxingAttendance ───────────────────────────────────────────

  describe('removeKickboxingAttendance', () => {
    it('deletes an attendance record', async () => {
      const existing = {
        id: 'att-1',
        sessionId: SESSION_ID,
        branchId: BRANCH,
        clientProfileId: 'cp-1',
        externalName: null,
      };
      (prisma.kickboxingAttendance.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        existing,
      );
      (prisma.kickboxingAttendance.delete as ReturnType<typeof vi.fn>).mockResolvedValue(existing);

      const result = await removeKickboxingAttendance(SESSION_ID, 'att-1', BRANCH, ACTOR);

      expect(result.success).toBe(true);
      expect(prisma.kickboxingAttendance.delete).toHaveBeenCalledWith({ where: { id: 'att-1' } });
    });

    it('throws NOT_FOUND when attendance record does not exist', async () => {
      (prisma.kickboxingAttendance.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(
        removeKickboxingAttendance(SESSION_ID, 'att-invalid', BRANCH, ACTOR),
      ).rejects.toThrow('Attendance record not found');
    });
  });

  // ─── getKickboxingAttendance ──────────────────────────────────────────────

  describe('getKickboxingAttendance', () => {
    it('returns attendance list for a valid session', async () => {
      (prisma.kickboxingSession.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: SESSION_ID,
        branchId: BRANCH,
        status: 'IN_PROGRESS',
      });
      (prisma.kickboxingAttendance.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: 'att-1', clientProfileId: 'cp-1', externalName: null },
        { id: 'att-2', clientProfileId: null, externalName: 'Walk-In' },
      ]);

      const result = await getKickboxingAttendance(SESSION_ID, BRANCH);

      expect(result).toHaveLength(2);
      expect(prisma.kickboxingAttendance.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { sessionId: SESSION_ID } }),
      );
    });

    it('throws NOT_FOUND for invalid session', async () => {
      (prisma.kickboxingSession.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(getKickboxingAttendance('sess-invalid', BRANCH)).rejects.toThrow(
        'Kickboxing session not found',
      );
    });
  });
});
