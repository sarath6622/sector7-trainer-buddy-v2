import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    clientProfile: { findFirst: vi.fn() },
    trainerProfile: { findFirst: vi.fn() },
    sessionSchedule: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('@/lib/audit', () => ({ auditLog: vi.fn() }));

import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';
import * as scheduleService from '@/services/schedule.service';

const BRANCH = 'branch-1';
const ACTOR = 'actor-1';

beforeEach(() => vi.clearAllMocks());

describe('createSchedule', () => {
  const input = {
    branchId: BRANCH,
    clientProfileId: 'cp-1',
    trainerProfileId: 'tp-1',
    dayOfWeek: 'MONDAY' as const,
    startTime: '07:00',
    durationMin: 60,
    validFrom: '2026-04-01',
    actorId: ACTOR,
  };

  it('should throw if client not found', async () => {
    (prisma.clientProfile.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(scheduleService.createSchedule(input)).rejects.toThrow('Client profile not found');
  });

  it('should throw if trainer not found', async () => {
    (prisma.clientProfile.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'cp-1' });
    (prisma.trainerProfile.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(scheduleService.createSchedule(input)).rejects.toThrow(
      'Trainer profile not found',
    );
  });

  it('should create schedule and audit', async () => {
    (prisma.clientProfile.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'cp-1' });
    (prisma.trainerProfile.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'tp-1' });
    const created = { id: 'sched-1', ...input };
    (prisma.sessionSchedule.create as ReturnType<typeof vi.fn>).mockResolvedValue(created);

    const result = await scheduleService.createSchedule(input);
    expect(result.id).toBe('sched-1');
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SCHEDULE_CREATED', subjectId: 'sched-1' }),
    );
  });
});

describe('getSchedules', () => {
  it('should pass filters to query', async () => {
    (prisma.sessionSchedule.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    await scheduleService.getSchedules({ branchId: BRANCH, trainerId: 'tp-1', clientId: 'cp-1' });
    expect(prisma.sessionSchedule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { branchId: BRANCH, trainerProfileId: 'tp-1', clientProfileId: 'cp-1' },
      }),
    );
  });
});

describe('getScheduleById', () => {
  it('should throw if not found', async () => {
    (prisma.sessionSchedule.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(scheduleService.getScheduleById('x', BRANCH)).rejects.toThrow(
      'Schedule not found',
    );
  });
});

describe('updateSchedule', () => {
  it('should throw if not found', async () => {
    (prisma.sessionSchedule.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(
      scheduleService.updateSchedule('x', BRANCH, ACTOR, { durationMin: 45 }),
    ).rejects.toThrow('Schedule not found');
  });

  it('should update and audit', async () => {
    const existing = { id: 's-1', dayOfWeek: 'MONDAY', startTime: '07:00', durationMin: 60 };
    (prisma.sessionSchedule.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(existing);
    (prisma.sessionSchedule.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...existing,
      durationMin: 45,
    });

    const result = await scheduleService.updateSchedule('s-1', BRANCH, ACTOR, { durationMin: 45 });
    expect(result.durationMin).toBe(45);
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'SCHEDULE_UPDATED' }));
  });
});

describe('deleteSchedule', () => {
  it('should throw if not found', async () => {
    (prisma.sessionSchedule.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(scheduleService.deleteSchedule('x', BRANCH, ACTOR)).rejects.toThrow(
      'Schedule not found',
    );
  });

  it('should deactivate and audit', async () => {
    (prisma.sessionSchedule.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 's-1' });
    (prisma.sessionSchedule.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 's-1',
      isActive: false,
    });

    const result = await scheduleService.deleteSchedule('s-1', BRANCH, ACTOR);
    expect(result).toEqual({ success: true });
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SCHEDULE_DEACTIVATED' }),
    );
  });
});
