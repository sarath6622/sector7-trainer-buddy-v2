import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    leaveRequest: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    sessionInstance: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('@/lib/audit', () => ({ auditLog: vi.fn() }));

import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';
import * as leaveService from '@/services/leave.service';

const BRANCH = 'branch-1';
const ACTOR = 'actor-1';
const TRAINER = 'tp-1';

beforeEach(() => vi.clearAllMocks());

// ─── applyLeave ─────────────────────────────────────

describe('applyLeave', () => {
  const input = {
    trainerProfileId: TRAINER,
    startDate: '2026-03-20',
    endDate: '2026-03-22',
    reason: 'Family event',
    actorId: ACTOR,
    branchId: BRANCH,
  };

  it('should throw if end date is before start date', async () => {
    await expect(leaveService.applyLeave({ ...input, endDate: '2026-03-19' })).rejects.toThrow(
      'End date must be on or after start date',
    );
  });

  it('should throw if overlapping leave exists', async () => {
    (prisma.leaveRequest.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'existing-leave',
    });

    await expect(leaveService.applyLeave(input)).rejects.toThrow(
      'You already have a leave request overlapping these dates',
    );
  });

  it('should create leave and identify affected sessions', async () => {
    (prisma.leaveRequest.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    (prisma.sessionInstance.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'sess-1',
        scheduledDate: new Date('2026-03-20'),
        scheduledTime: '10:00',
        client: {
          id: 'cp-1',
          user: { id: 'u-1', firstName: 'John', lastName: 'Doe' },
        },
      },
    ]);

    const mockLeave = {
      id: 'leave-1',
      branchId: BRANCH,
      trainerProfileId: TRAINER,
      startDate: new Date('2026-03-20'),
      endDate: new Date('2026-03-22'),
      reason: 'Family event',
      status: 'PENDING',
      trainer: { user: { firstName: 'Trainer', lastName: 'One' } },
    };
    (prisma.leaveRequest.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockLeave);

    const result = await leaveService.applyLeave(input);

    expect(result.id).toBe('leave-1');
    expect(result.affectedSessions).toHaveLength(1);
    expect(result.affectedClients).toHaveLength(1);
    expect(result.affectedClients[0].firstName).toBe('John');
    expect(prisma.leaveRequest.create).toHaveBeenCalled();
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'LEAVE_APPLIED', branchId: BRANCH }),
    );
  });
});

// ─── reviewLeave ────────────────────────────────────

describe('reviewLeave', () => {
  it('should throw if leave not found', async () => {
    (prisma.leaveRequest.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(
      leaveService.reviewLeave({
        leaveId: 'leave-1',
        status: 'APPROVED',
        actorId: ACTOR,
        branchId: BRANCH,
      }),
    ).rejects.toThrow('Leave request not found');
  });

  it('should throw if leave is not PENDING', async () => {
    (prisma.leaveRequest.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'leave-1',
      status: 'APPROVED',
      trainerProfileId: TRAINER,
    });

    await expect(
      leaveService.reviewLeave({
        leaveId: 'leave-1',
        status: 'REJECTED',
        actorId: ACTOR,
        branchId: BRANCH,
      }),
    ).rejects.toThrow('Cannot reject a leave that is already APPROVED');
  });

  it('should approve leave and audit', async () => {
    (prisma.leaveRequest.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'leave-1',
      status: 'PENDING',
      trainerProfileId: TRAINER,
      startDate: new Date('2026-03-20'),
      endDate: new Date('2026-03-22'),
    });

    const updatedLeave = {
      id: 'leave-1',
      status: 'APPROVED',
      trainer: { user: { firstName: 'Trainer', lastName: 'One' } },
    };
    (prisma.leaveRequest.update as ReturnType<typeof vi.fn>).mockResolvedValue(updatedLeave);
    (prisma.sessionInstance.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const result = await leaveService.reviewLeave({
      leaveId: 'leave-1',
      status: 'APPROVED',
      notes: 'Approved, reassignment needed',
      actorId: ACTOR,
      branchId: BRANCH,
    });

    expect(result.status).toBe('APPROVED');
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'LEAVE_APPROVED' }));
  });

  it('should reject leave and audit', async () => {
    (prisma.leaveRequest.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'leave-1',
      status: 'PENDING',
      trainerProfileId: TRAINER,
      startDate: new Date('2026-03-20'),
      endDate: new Date('2026-03-22'),
    });

    (prisma.leaveRequest.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'leave-1',
      status: 'REJECTED',
      trainer: { user: { firstName: 'Trainer', lastName: 'One' } },
    });
    (prisma.sessionInstance.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const result = await leaveService.reviewLeave({
      leaveId: 'leave-1',
      status: 'REJECTED',
      actorId: ACTOR,
      branchId: BRANCH,
    });

    expect(result.status).toBe('REJECTED');
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'LEAVE_REJECTED' }));
  });
});

// ─── getLeaveById ──────────────────────────────────

describe('getLeaveById', () => {
  it('should throw if leave not found', async () => {
    (prisma.leaveRequest.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(
      leaveService.getLeaveById({ leaveId: 'leave-1', branchId: BRANCH }),
    ).rejects.toThrow('Leave request not found');
  });

  it('should return leave with affected sessions', async () => {
    (prisma.leaveRequest.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'leave-1',
      trainerProfileId: TRAINER,
      startDate: new Date('2026-03-20'),
      endDate: new Date('2026-03-22'),
      trainer: { user: { firstName: 'Trainer', lastName: 'One' } },
    });

    (prisma.sessionInstance.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'sess-1',
        scheduledDate: new Date('2026-03-21'),
        scheduledTime: '10:00',
        client: {
          id: 'cp-1',
          user: { id: 'u-1', firstName: 'Jane', lastName: 'Doe' },
        },
      },
    ]);

    const result = await leaveService.getLeaveById({ leaveId: 'leave-1', branchId: BRANCH });

    expect(result.affectedSessions).toHaveLength(1);
    expect(result.affectedClients).toHaveLength(1);
    expect(result.affectedClients[0].firstName).toBe('Jane');
  });
});

// ─── listLeaves ────────────────────────────────────

describe('listLeaves', () => {
  it('should return paginated leaves', async () => {
    (prisma.leaveRequest.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'leave-1', status: 'PENDING', trainer: { user: { firstName: 'T', lastName: 'One' } } },
    ]);
    (prisma.leaveRequest.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);

    const result = await leaveService.listLeaves({ branchId: BRANCH, page: 1, pageSize: 20 });

    expect(result.data).toHaveLength(1);
    expect(result.pagination.total).toBe(1);
  });
});

// ─── getTrainerLeaves ──────────────────────────────

describe('getTrainerLeaves', () => {
  it('should return trainer own leaves', async () => {
    (prisma.leaveRequest.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'leave-1', status: 'PENDING' },
      { id: 'leave-2', status: 'APPROVED' },
    ]);

    const result = await leaveService.getTrainerLeaves({
      trainerProfileId: TRAINER,
      branchId: BRANCH,
    });

    expect(result).toHaveLength(2);
  });
});
