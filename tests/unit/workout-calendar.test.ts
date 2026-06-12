import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    sessionInstance: { findMany: vi.fn() },
    workoutSet: { findMany: vi.fn() },
  },
}));
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn() }));
vi.mock('@/lib/pusher', () => ({
  triggerPrCelebrated: vi.fn(),
  triggerLeaderboardChanged: vi.fn(),
}));
vi.mock('@/services/badge.service', () => ({
  evaluatePRBadges: vi.fn(),
  evaluateWeightLiftedBadges: vi.fn(),
  evaluateExerciseMilestoneBadges: vi.fn(),
}));
vi.mock('@/services/community.service', () => ({ createPost: vi.fn() }));
vi.mock('@/services/session.service', () => ({ assertSessionAccess: vi.fn() }));
vi.mock('@/services/tv-dashboard.service', () => ({
  invalidateTvDashboardCacheForBranch: vi.fn(),
  resolveCompoundSlotKey: vi.fn(),
}));
vi.mock('@/services/tv-live.service', () => ({ invalidateTvLiveCacheForBranch: vi.fn() }));

import { prisma } from '@/lib/prisma';
import { getWorkoutCalendar } from '@/services/workout.service';

const BRANCH = 'branch-1';
const CLIENT_ID = 'client-1';

const sessionFindMany = prisma.sessionInstance.findMany as ReturnType<typeof vi.fn>;
const setFindMany = prisma.workoutSet.findMany as ReturnType<typeof vi.fn>;

function mockSet(date: string, exerciseId: string, weightKg: number) {
  return {
    weightKg,
    workoutLog: {
      exerciseId,
      sessionInstance: { scheduledDate: new Date(`${date}T00:00:00.000Z`) },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getWorkoutCalendar', () => {
  it('returns completed session days grouped by date with totalDays', async () => {
    sessionFindMany.mockResolvedValue([
      { id: 's1', scheduledDate: new Date('2026-06-01T00:00:00.000Z') },
      { id: 's2', scheduledDate: new Date('2026-06-03T00:00:00.000Z') },
      { id: 's3', scheduledDate: new Date('2026-06-03T00:00:00.000Z') }, // same day, 2nd session
    ]);
    setFindMany.mockResolvedValue([]);

    const result = await getWorkoutCalendar({
      clientProfileId: CLIENT_ID,
      branchId: BRANCH,
      month: '2026-06',
    });

    expect(result.totalDays).toBe(2);
    expect(result.days).toEqual([
      { date: '2026-06-01', sessionIds: ['s1'], isPR: false },
      { date: '2026-06-03', sessionIds: ['s2', 's3'], isPR: false },
    ]);
  });

  it('scopes the session query to branch, client, COMPLETED status and month range', async () => {
    sessionFindMany.mockResolvedValue([]);
    setFindMany.mockResolvedValue([]);

    await getWorkoutCalendar({ clientProfileId: CLIENT_ID, branchId: BRANCH, month: '2026-06' });

    expect(sessionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          branchId: BRANCH,
          clientProfileId: CLIENT_ID,
          status: 'COMPLETED',
          scheduledDate: {
            gte: new Date(2026, 5, 1),
            lte: new Date(2026, 6, 0, 23, 59, 59),
          },
        }),
      }),
    );
  });

  it('flags a PR day when a compound lift beats the previous all-time best', async () => {
    sessionFindMany.mockResolvedValue([
      { id: 's1', scheduledDate: new Date('2026-06-05T00:00:00.000Z') },
      { id: 's2', scheduledDate: new Date('2026-06-10T00:00:00.000Z') },
    ]);
    setFindMany.mockResolvedValue([
      mockSet('2026-05-20', 'bench', 60), // history before the month
      mockSet('2026-06-05', 'bench', 55), // below best — not a PR
      mockSet('2026-06-10', 'bench', 65), // beats 60 — PR
    ]);

    const result = await getWorkoutCalendar({
      clientProfileId: CLIENT_ID,
      branchId: BRANCH,
      month: '2026-06',
    });

    expect(result.days.find((d) => d.date === '2026-06-05')!.isPR).toBe(false);
    expect(result.days.find((d) => d.date === '2026-06-10')!.isPR).toBe(true);
  });

  it('does not flag a PR when the lift only equals the previous best', async () => {
    sessionFindMany.mockResolvedValue([
      { id: 's1', scheduledDate: new Date('2026-06-08T00:00:00.000Z') },
    ]);
    setFindMany.mockResolvedValue([
      mockSet('2026-05-01', 'squat', 100),
      mockSet('2026-06-08', 'squat', 100),
    ]);

    const result = await getWorkoutCalendar({
      clientProfileId: CLIENT_ID,
      branchId: BRANCH,
      month: '2026-06',
    });

    expect(result.days[0]!.isPR).toBe(false);
  });

  it('counts the first-ever compound lift as a PR (mirrors auto-post rule)', async () => {
    sessionFindMany.mockResolvedValue([
      { id: 's1', scheduledDate: new Date('2026-06-02T00:00:00.000Z') },
    ]);
    setFindMany.mockResolvedValue([mockSet('2026-06-02', 'deadlift', 80)]);

    const result = await getWorkoutCalendar({
      clientProfileId: CLIENT_ID,
      branchId: BRANCH,
      month: '2026-06',
    });

    expect(result.days[0]!.isPR).toBe(true);
  });

  it('uses the highest set of the day when multiple sets exist', async () => {
    sessionFindMany.mockResolvedValue([
      { id: 's1', scheduledDate: new Date('2026-06-15T00:00:00.000Z') },
    ]);
    setFindMany.mockResolvedValue([
      mockSet('2026-05-10', 'bench', 70),
      mockSet('2026-06-15', 'bench', 50),
      mockSet('2026-06-15', 'bench', 75), // day max beats 70
    ]);

    const result = await getWorkoutCalendar({
      clientProfileId: CLIENT_ID,
      branchId: BRANCH,
      month: '2026-06',
    });

    expect(result.days[0]!.isPR).toBe(true);
  });

  it('returns empty days for a month with no completed sessions', async () => {
    sessionFindMany.mockResolvedValue([]);
    setFindMany.mockResolvedValue([]);

    const result = await getWorkoutCalendar({
      clientProfileId: CLIENT_ID,
      branchId: BRANCH,
      month: '2026-06',
    });

    expect(result).toEqual({ days: [], totalDays: 0 });
  });
});
