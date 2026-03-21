import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    kickboxingClass: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    kickboxingEnrollment: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    trainerProfile: {
      findFirst: vi.fn(),
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
  createKickboxingClass,
  getKickboxingClasses,
  updateKickboxingClass,
  createKickboxingEnrollment,
  getKickboxingEnrollments,
  deleteKickboxingEnrollment,
} from '@/services/kickboxing.service';

const BRANCH = 'branch-1';
const ACTOR = 'admin-1';

describe('kickboxing.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Class Tests ──────────────────────────────

  describe('createKickboxingClass', () => {
    it('should create a class and audit log', async () => {
      const mockTrainer = { id: 'tp-1', user: { role: 'KICKBOXING_TRAINER' } };
      (prisma.trainerProfile.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(mockTrainer);

      const mockClass = {
        id: 'kc-1',
        branchId: BRANCH,
        trainerProfileId: 'tp-1',
        dayOfWeek: 'MONDAY',
        startTime: '18:00',
        durationMin: 60,
        maxCapacity: 20,
        trainer: { user: { firstName: 'John', lastName: 'Doe' } },
        _count: { enrollments: 0 },
      };
      (prisma.kickboxingClass.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockClass);

      const result = await createKickboxingClass({
        branchId: BRANCH,
        trainerProfileId: 'tp-1',
        dayOfWeek: 'MONDAY',
        startTime: '18:00',
        durationMin: 60,
        maxCapacity: 20,
        actorId: ACTOR,
      });

      expect(result.id).toBe('kc-1');
      expect(prisma.kickboxingClass.create).toHaveBeenCalled();
    });

    it('should throw NOT_FOUND if trainer does not exist', async () => {
      (prisma.trainerProfile.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(
        createKickboxingClass({
          branchId: BRANCH,
          trainerProfileId: 'tp-invalid',
          dayOfWeek: 'MONDAY',
          startTime: '18:00',
          durationMin: 60,
          maxCapacity: 20,
          actorId: ACTOR,
        }),
      ).rejects.toThrow('Trainer not found');
    });
  });

  describe('getKickboxingClasses', () => {
    it('should return classes scoped to branch', async () => {
      (prisma.kickboxingClass.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      await getKickboxingClasses(BRANCH);

      expect(prisma.kickboxingClass.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { branchId: BRANCH },
        }),
      );
    });
  });

  describe('updateKickboxingClass', () => {
    it('should update class fields', async () => {
      const existing = {
        id: 'kc-1',
        branchId: BRANCH,
        dayOfWeek: 'MONDAY',
        startTime: '18:00',
        isActive: true,
      };
      (prisma.kickboxingClass.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(existing);
      (prisma.kickboxingClass.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...existing,
        startTime: '19:00',
      });

      const result = await updateKickboxingClass('kc-1', { startTime: '19:00' }, BRANCH, ACTOR);

      expect(result.startTime).toBe('19:00');
    });

    it('should throw NOT_FOUND for missing class', async () => {
      (prisma.kickboxingClass.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(
        updateKickboxingClass('kc-invalid', { startTime: '19:00' }, BRANCH, ACTOR),
      ).rejects.toThrow('Kickboxing class not found');
    });
  });

  // ─── Enrollment Tests ─────────────────────────

  describe('createKickboxingEnrollment', () => {
    it('should enroll an external client', async () => {
      const mockClass = {
        id: 'kc-1',
        maxCapacity: 20,
        _count: { enrollments: 5 },
      };
      (prisma.kickboxingClass.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(mockClass);
      (prisma.kickboxingEnrollment.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'ke-1',
        classId: 'kc-1',
        clientType: 'EXTERNAL_ONLY',
        externalName: 'Jane External',
        client: null,
      });

      const result = await createKickboxingEnrollment({
        branchId: BRANCH,
        classId: 'kc-1',
        clientType: 'EXTERNAL_ONLY',
        externalName: 'Jane External',
        actorId: ACTOR,
      });

      expect(result.clientType).toBe('EXTERNAL_ONLY');
    });

    it('should enroll a gym member', async () => {
      const mockClass = { id: 'kc-1', maxCapacity: 20, _count: { enrollments: 5 } };
      (prisma.kickboxingClass.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(mockClass);
      (prisma.clientProfile.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'cp-1',
      });
      (prisma.kickboxingEnrollment.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (prisma.kickboxingEnrollment.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'ke-2',
        classId: 'kc-1',
        clientType: 'GYM_MEMBER',
        clientProfileId: 'cp-1',
        client: { user: { firstName: 'John', lastName: 'Doe' } },
      });

      const result = await createKickboxingEnrollment({
        branchId: BRANCH,
        classId: 'kc-1',
        clientProfileId: 'cp-1',
        clientType: 'GYM_MEMBER',
        actorId: ACTOR,
      });

      expect(result.clientType).toBe('GYM_MEMBER');
    });

    it('should reject when class is at capacity', async () => {
      const mockClass = { id: 'kc-1', maxCapacity: 10, _count: { enrollments: 10 } };
      (prisma.kickboxingClass.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(mockClass);

      await expect(
        createKickboxingEnrollment({
          branchId: BRANCH,
          classId: 'kc-1',
          clientType: 'EXTERNAL_ONLY',
          externalName: 'Overflow',
          actorId: ACTOR,
        }),
      ).rejects.toThrow('Class has reached maximum capacity');
    });

    it('should reject duplicate gym member enrollment', async () => {
      const mockClass = { id: 'kc-1', maxCapacity: 20, _count: { enrollments: 5 } };
      (prisma.kickboxingClass.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(mockClass);
      (prisma.clientProfile.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'cp-1',
      });
      (prisma.kickboxingEnrollment.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'ke-existing',
      });

      await expect(
        createKickboxingEnrollment({
          branchId: BRANCH,
          classId: 'kc-1',
          clientProfileId: 'cp-1',
          clientType: 'GYM_MEMBER',
          actorId: ACTOR,
        }),
      ).rejects.toThrow('Client is already enrolled');
    });
  });

  describe('getKickboxingEnrollments', () => {
    it('should filter by classId and clientType', async () => {
      (prisma.kickboxingEnrollment.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      await getKickboxingEnrollments({
        branchId: BRANCH,
        classId: 'kc-1',
        clientType: 'GYM_MEMBER',
      });

      expect(prisma.kickboxingEnrollment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            branchId: BRANCH,
            classId: 'kc-1',
            clientType: 'GYM_MEMBER',
            isActive: true,
          }),
        }),
      );
    });
  });

  describe('deleteKickboxingEnrollment', () => {
    it('should soft-delete enrollment by setting isActive to false', async () => {
      const existing = {
        id: 'ke-1',
        classId: 'kc-1',
        clientType: 'EXTERNAL_ONLY',
        clientProfileId: null,
        externalName: 'Jane',
      };
      (prisma.kickboxingEnrollment.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        existing,
      );
      (prisma.kickboxingEnrollment.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...existing,
        isActive: false,
      });

      const result = await deleteKickboxingEnrollment('ke-1', BRANCH, ACTOR);

      expect(result.success).toBe(true);
      expect(prisma.kickboxingEnrollment.update).toHaveBeenCalledWith({
        where: { id: 'ke-1' },
        data: { isActive: false },
      });
    });

    it('should throw NOT_FOUND for missing enrollment', async () => {
      (prisma.kickboxingEnrollment.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(deleteKickboxingEnrollment('ke-invalid', BRANCH, ACTOR)).rejects.toThrow(
        'Enrollment not found',
      );
    });
  });
});
