import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    sessionSchedule: { findMany: vi.fn() },
    sessionInstance: {
      findMany: vi.fn(),
      createMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

vi.mock('@/lib/audit', () => ({ auditLog: vi.fn() }));

import { prisma } from '@/lib/prisma';
import * as sessionGen from '@/services/session-generation.service';

const BRANCH = 'branch-1';
const ACTOR = 'actor-1';

beforeEach(() => vi.clearAllMocks());

describe('generateSessions', () => {
  function makeSchedule(overrides = {}) {
    return {
      id: 'sched-1',
      branchId: BRANCH,
      clientProfileId: 'cp-1',
      trainerProfileId: 'tp-1',
      dayOfWeek: 'MONDAY',
      startTime: '07:00',
      durationMin: 60,
      isActive: true,
      validFrom: new Date('2026-01-01'),
      validUntil: null,
      client: { user: { firstName: 'John', lastName: 'Client' } },
      trainer: { user: { firstName: 'Jane', lastName: 'Trainer' } },
      ...overrides,
    };
  }

  it('should generate correct number of sessions for a month', async () => {
    // April 2026 has 4 Mondays (6th, 13th, 20th, 27th)
    (prisma.sessionSchedule.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeSchedule(),
    ]);
    (prisma.sessionInstance.findMany as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([]) // existing instances (none)
      .mockResolvedValueOnce([]); // all instances for conflict detection
    (prisma.sessionInstance.createMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 4 });

    const result = await sessionGen.generateSessions({
      branchId: BRANCH,
      month: '2026-04',
      actorId: ACTOR,
    });

    expect(result.created).toBe(4);
    expect(prisma.sessionInstance.createMany).toHaveBeenCalledOnce();
    const createCall = (prisma.sessionInstance.createMany as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(createCall.data).toHaveLength(4);
  });

  it('should skip dates before validFrom', async () => {
    (prisma.sessionSchedule.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeSchedule({ validFrom: new Date('2026-04-15') }), // Only 2 Mondays after Apr 15 (20th, 27th)
    ]);
    (prisma.sessionInstance.findMany as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    (prisma.sessionInstance.createMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 2 });

    const result = await sessionGen.generateSessions({
      branchId: BRANCH,
      month: '2026-04',
      actorId: ACTOR,
    });

    expect(result.created).toBe(2);
  });

  it('should skip already-generated dates', async () => {
    (prisma.sessionSchedule.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeSchedule(),
    ]);
    // One instance already exists
    (prisma.sessionInstance.findMany as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([{ scheduleId: 'sched-1', scheduledDate: new Date('2026-04-06') }])
      .mockResolvedValueOnce([]);
    (prisma.sessionInstance.createMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 3 });

    const result = await sessionGen.generateSessions({
      branchId: BRANCH,
      month: '2026-04',
      actorId: ACTOR,
    });

    expect(result.created).toBe(3); // 4 - 1 existing = 3
  });

  it('should detect conflicts when two sessions overlap for same trainer', async () => {
    (prisma.sessionSchedule.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.sessionInstance.findMany as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([]) // existing
      .mockResolvedValueOnce([
        // all instances — two overlapping sessions for same trainer
        {
          id: 'inst-1',
          trainerProfileId: 'tp-1',
          scheduledDate: new Date('2026-04-06'),
          scheduledTime: '07:00',
          durationMin: 60,
          status: 'SCHEDULED',
          client: { user: { firstName: 'Alice', lastName: 'A' } },
          trainer: { user: { firstName: 'Jane', lastName: 'Trainer' } },
        },
        {
          id: 'inst-2',
          trainerProfileId: 'tp-1',
          scheduledDate: new Date('2026-04-06'),
          scheduledTime: '07:30',
          durationMin: 60,
          status: 'SCHEDULED',
          client: { user: { firstName: 'Bob', lastName: 'B' } },
          trainer: { user: { firstName: 'Jane', lastName: 'Trainer' } },
        },
      ]);

    const result = await sessionGen.generateSessions({
      branchId: BRANCH,
      month: '2026-04',
      actorId: ACTOR,
    });

    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]!.overlapMinutes).toBe(30);
    expect(result.conflicts[0]!.trainerName).toBe('Jane Trainer');
  });

  it('should not create sessions if none needed', async () => {
    (prisma.sessionSchedule.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.sessionInstance.findMany as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await sessionGen.generateSessions({
      branchId: BRANCH,
      month: '2026-04',
      actorId: ACTOR,
    });

    expect(result.created).toBe(0);
    expect(prisma.sessionInstance.createMany).not.toHaveBeenCalled();
  });
});

describe('detectConflicts', () => {
  it('should return empty when no overlaps', async () => {
    (prisma.sessionInstance.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'i1',
        trainerProfileId: 'tp-1',
        scheduledTime: '07:00',
        durationMin: 60,
        client: { user: { firstName: 'A', lastName: 'A' } },
        trainer: { user: { firstName: 'T', lastName: 'T' } },
      },
      {
        id: 'i2',
        trainerProfileId: 'tp-1',
        scheduledTime: '08:00',
        durationMin: 60,
        client: { user: { firstName: 'B', lastName: 'B' } },
        trainer: { user: { firstName: 'T', lastName: 'T' } },
      },
    ]);

    const result = await sessionGen.detectConflicts(BRANCH, '2026-04-06');
    expect(result.data).toHaveLength(0);
  });

  it('should detect overlapping sessions', async () => {
    (prisma.sessionInstance.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'i1',
        trainerProfileId: 'tp-1',
        scheduledDate: new Date('2026-04-06'),
        scheduledTime: '07:00',
        durationMin: 60,
        client: { user: { firstName: 'A', lastName: 'A' } },
        trainer: { user: { firstName: 'T', lastName: 'T' } },
      },
      {
        id: 'i2',
        trainerProfileId: 'tp-1',
        scheduledDate: new Date('2026-04-06'),
        scheduledTime: '07:45',
        durationMin: 60,
        client: { user: { firstName: 'B', lastName: 'B' } },
        trainer: { user: { firstName: 'T', lastName: 'T' } },
      },
    ]);

    const result = await sessionGen.detectConflicts(BRANCH, '2026-04-06');
    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.overlapMinutes).toBe(15);
  });
});
