import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockReassignmentCreate = vi.fn();
const mockSessionUpdate = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    trainerProfile: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    sessionInstance: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    leaveRequest: {
      findMany: vi.fn(),
    },
    trainerReassignment: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    $transaction: vi.fn((ops: unknown[]) => Promise.all(ops)),
  },
}));

vi.mock('@/lib/audit', () => ({ auditLog: vi.fn() }));

import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';
import * as reassignmentService from '@/services/reassignment.service';

const BRANCH = 'branch-1';
const ACTOR = 'admin-1';

beforeEach(() => {
  vi.clearAllMocks();
  mockReassignmentCreate.mockReset();
  mockSessionUpdate.mockReset();
});

// ─── getVacantTrainers ─────────────────────────────

describe('getVacantTrainers', () => {
  it('should return trainers not booked and not on leave', async () => {
    (prisma.trainerProfile.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'tp-1',
        workingHoursStart: '06:00',
        workingHoursEnd: '20:00',
        workingDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
        user: { firstName: 'A', lastName: 'T', email: 'a@t.com' },
      },
      {
        id: 'tp-2',
        workingHoursStart: '06:00',
        workingHoursEnd: '20:00',
        workingDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
        user: { firstName: 'B', lastName: 'T', email: 'b@t.com' },
      },
      {
        id: 'tp-3',
        workingHoursStart: '06:00',
        workingHoursEnd: '20:00',
        workingDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
        user: { firstName: 'C', lastName: 'T', email: 'c@t.com' },
      },
    ]);

    // tp-1 is booked
    (prisma.sessionInstance.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { trainerProfileId: 'tp-1', scheduledTime: '10:00', durationMin: 60 },
    ]);

    // tp-2 is on leave
    (prisma.leaveRequest.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { trainerProfileId: 'tp-2' },
    ]);

    // 2026-03-23 is a Monday
    const result = await reassignmentService.getVacantTrainers({
      date: '2026-03-23',
      startTime: '10:00',
      endTime: '11:00',
      branchId: BRANCH,
    });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('tp-3');
  });

  it('should exclude trainers outside working hours', async () => {
    (prisma.trainerProfile.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'tp-1',
        workingHoursStart: '09:00',
        workingHoursEnd: '17:00',
        workingDays: ['MONDAY'],
        user: { firstName: 'A', lastName: 'T', email: 'a@t.com' },
      },
    ]);
    (prisma.sessionInstance.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.leaveRequest.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    // 2026-03-23 is a Monday, but slot 06:00-07:00 is before working hours
    const result = await reassignmentService.getVacantTrainers({
      date: '2026-03-23',
      startTime: '06:00',
      endTime: '07:00',
      branchId: BRANCH,
    });

    expect(result).toHaveLength(0);
  });

  it('should exclude trainers not working on that day', async () => {
    (prisma.trainerProfile.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'tp-1',
        workingHoursStart: '06:00',
        workingHoursEnd: '20:00',
        workingDays: ['MONDAY'],
        user: { firstName: 'A', lastName: 'T', email: 'a@t.com' },
      },
    ]);
    (prisma.sessionInstance.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.leaveRequest.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    // 2026-03-22 is a Sunday
    const result = await reassignmentService.getVacantTrainers({
      date: '2026-03-22',
      startTime: '10:00',
      endTime: '11:00',
      branchId: BRANCH,
    });

    expect(result).toHaveLength(0);
  });
});

// ─── reassignSession ───────────────────────────────

describe('reassignSession', () => {
  it('should throw if session not found', async () => {
    (prisma.sessionInstance.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(
      reassignmentService.reassignSession({
        sessionInstanceId: 'sess-1',
        replacementTrainerProfileId: 'tp-2',
        actorId: ACTOR,
        branchId: BRANCH,
      }),
    ).rejects.toThrow('Session not found or not in SCHEDULED status');
  });

  it('should throw if already reassigned', async () => {
    (prisma.sessionInstance.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'sess-1',
      trainerProfileId: 'tp-1',
      trainerReassignment: { id: 'existing' },
      client: { user: { firstName: 'C', lastName: 'One' } },
      trainer: { user: { firstName: 'T', lastName: 'One' } },
    });

    await expect(
      reassignmentService.reassignSession({
        sessionInstanceId: 'sess-1',
        replacementTrainerProfileId: 'tp-2',
        actorId: ACTOR,
        branchId: BRANCH,
      }),
    ).rejects.toThrow('This session has already been reassigned');
  });

  it('should throw if same trainer', async () => {
    (prisma.sessionInstance.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'sess-1',
      trainerProfileId: 'tp-1',
      trainerReassignment: null,
      client: { user: { firstName: 'C', lastName: 'One' } },
      trainer: { user: { firstName: 'T', lastName: 'One' } },
    });
    (prisma.trainerProfile.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'tp-1',
      user: { firstName: 'T', lastName: 'One' },
    });

    await expect(
      reassignmentService.reassignSession({
        sessionInstanceId: 'sess-1',
        replacementTrainerProfileId: 'tp-1',
        actorId: ACTOR,
        branchId: BRANCH,
      }),
    ).rejects.toThrow('Cannot reassign to the same trainer');
  });

  it('should create reassignment and update session', async () => {
    (prisma.sessionInstance.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'sess-1',
      trainerProfileId: 'tp-1',
      trainerReassignment: null,
      scheduledDate: new Date('2026-03-23'),
      scheduledTime: '10:00',
      client: { id: 'cp-1', user: { firstName: 'Client', lastName: 'One' } },
      trainer: { user: { firstName: 'Original', lastName: 'Trainer' } },
    });
    (prisma.trainerProfile.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'tp-2',
      user: { firstName: 'Replacement', lastName: 'Trainer' },
    });

    const mockReassignment = {
      id: 'ra-1',
      sessionInstanceId: 'sess-1',
      originalTrainerProfileId: 'tp-1',
      replacementTrainerProfileId: 'tp-2',
      sessionInstance: { client: { user: { firstName: 'Client', lastName: 'One' } } },
      originalTrainer: { user: { firstName: 'Original', lastName: 'Trainer' } },
      replacementTrainer: { user: { firstName: 'Replacement', lastName: 'Trainer' } },
    };

    (prisma.trainerReassignment.create as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockReassignment,
    );
    (prisma.sessionInstance.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const result = await reassignmentService.reassignSession({
      sessionInstanceId: 'sess-1',
      replacementTrainerProfileId: 'tp-2',
      reason: 'Trainer on leave',
      actorId: ACTOR,
      branchId: BRANCH,
    });

    expect(result.id).toBe('ra-1');
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SESSION_REASSIGNED',
        branchId: BRANCH,
      }),
    );
  });
});

// ─── listReassignments ─────────────────────────────

describe('listReassignments', () => {
  it('should return reassignment history', async () => {
    (prisma.trainerReassignment.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'ra-1',
        sessionInstance: { client: { user: { firstName: 'C', lastName: 'One' } } },
        originalTrainer: { user: { firstName: 'T', lastName: 'One' } },
        replacementTrainer: { user: { firstName: 'T', lastName: 'Two' } },
      },
    ]);

    const result = await reassignmentService.listReassignments({ branchId: BRANCH });

    expect(result).toHaveLength(1);
  });
});
