import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    exercise: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
}));

import { prisma } from '@/lib/prisma';
import * as leaderboard from '@/services/leaderboard.service';

const BRANCH = 'branch-1';
type Mock = ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

// ─── getCompoundLeaderboard ─────────────────────────────────────────

describe('getCompoundLeaderboard', () => {
  it('throws 404 when exercise not found', async () => {
    (prisma.exercise.findUnique as Mock).mockResolvedValue(null);

    await expect(
      leaderboard.getCompoundLeaderboard({ branchId: BRANCH, exerciseId: 'ex-x' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 });
  });

  it('throws 400 when exercise is not flagged compound', async () => {
    (prisma.exercise.findUnique as Mock).mockResolvedValue({
      id: 'ex-1',
      name: 'Bicep Curl',
      isCompound: false,
    });

    await expect(
      leaderboard.getCompoundLeaderboard({ branchId: BRANCH, exerciseId: 'ex-1' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', statusCode: 400 });
  });

  it('ranks entries in descending maxWeightKg order with rank starting at 1', async () => {
    (prisma.exercise.findUnique as Mock).mockResolvedValue({
      id: 'ex-bench',
      name: 'Bench Press',
      isCompound: true,
    });
    // Service issues a single $queryRaw call; mock the SQL result already sorted DESC.
    (prisma.$queryRaw as Mock).mockResolvedValue([
      {
        clientProfileId: 'c1',
        firstName: 'Alice',
        lastName: 'A',
        profileImageUrl: null,
        maxWeightKg: 120,
        reps: 3,
        achievedAt: new Date('2026-04-10'),
      },
      {
        clientProfileId: 'c2',
        firstName: 'Bob',
        lastName: 'B',
        profileImageUrl: null,
        maxWeightKg: 100,
        reps: 5,
        achievedAt: new Date('2026-04-12'),
      },
      {
        clientProfileId: 'c3',
        firstName: 'Carol',
        lastName: 'C',
        profileImageUrl: null,
        maxWeightKg: 80,
        reps: 8,
        achievedAt: new Date('2026-04-15'),
      },
    ]);

    const result = await leaderboard.getCompoundLeaderboard({
      branchId: BRANCH,
      exerciseId: 'ex-bench',
    });

    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ rank: 1, clientProfileId: 'c1', maxWeightKg: 120 });
    expect(result[1]).toMatchObject({ rank: 2, clientProfileId: 'c2', maxWeightKg: 100 });
    expect(result[2]).toMatchObject({ rank: 3, clientProfileId: 'c3', maxWeightKg: 80 });
  });

  it('deduplicates per client — keeps best (first) entry only when SQL returns multiple rows for same client', async () => {
    (prisma.exercise.findUnique as Mock).mockResolvedValue({
      id: 'ex-bench',
      isCompound: true,
    });
    // Same client appears twice (e.g. multiple grouping permutations); since result is
    // sorted DESC by maxWeightKg, the first row is the better one.
    (prisma.$queryRaw as Mock).mockResolvedValue([
      {
        clientProfileId: 'c1',
        firstName: 'A',
        lastName: 'A',
        profileImageUrl: null,
        maxWeightKg: 120,
        reps: 3,
        achievedAt: new Date('2026-04-10'),
      },
      {
        clientProfileId: 'c1',
        firstName: 'A',
        lastName: 'A',
        profileImageUrl: null,
        maxWeightKg: 110,
        reps: 5,
        achievedAt: new Date('2026-04-08'),
      },
      {
        clientProfileId: 'c2',
        firstName: 'B',
        lastName: 'B',
        profileImageUrl: null,
        maxWeightKg: 100,
        reps: 5,
        achievedAt: new Date('2026-04-12'),
      },
    ]);

    const result = await leaderboard.getCompoundLeaderboard({
      branchId: BRANCH,
      exerciseId: 'ex-bench',
    });

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ clientProfileId: 'c1', maxWeightKg: 120 }); // best entry
    expect(result[1]).toMatchObject({ clientProfileId: 'c2', maxWeightKg: 100 });
    // The 110kg row for c1 should be discarded
    expect(result.find((r) => r.maxWeightKg === 110)).toBeUndefined();
  });

  it('coerces SQL maxWeightKg to JS number', async () => {
    (prisma.exercise.findUnique as Mock).mockResolvedValue({
      id: 'ex-1',
      isCompound: true,
    });
    // Postgres NUMERIC sometimes returns as string via Prisma raw queries
    (prisma.$queryRaw as Mock).mockResolvedValue([
      {
        clientProfileId: 'c1',
        firstName: 'A',
        lastName: 'A',
        profileImageUrl: null,
        maxWeightKg: '125.5',
        reps: 3,
        achievedAt: new Date(),
      },
    ]);

    const result = await leaderboard.getCompoundLeaderboard({
      branchId: BRANCH,
      exerciseId: 'ex-1',
    });

    expect(typeof result[0]?.maxWeightKg).toBe('number');
    expect(result[0]?.maxWeightKg).toBe(125.5);
  });

  it('returns empty array when no qualifying records exist', async () => {
    (prisma.exercise.findUnique as Mock).mockResolvedValue({
      id: 'ex-1',
      isCompound: true,
    });
    (prisma.$queryRaw as Mock).mockResolvedValue([]);

    const result = await leaderboard.getCompoundLeaderboard({
      branchId: BRANCH,
      exerciseId: 'ex-1',
    });

    expect(result).toEqual([]);
  });
});

// ─── getCompoundExercises ───────────────────────────────────────────

describe('getCompoundExercises', () => {
  it('returns only compound + active exercises ordered by name', async () => {
    (prisma.exercise.findMany as Mock).mockResolvedValue([
      { id: 'e1', name: 'Bench Press' },
      { id: 'e2', name: 'Deadlift' },
    ]);

    const result = await leaderboard.getCompoundExercises();

    expect(result).toHaveLength(2);
    expect(prisma.exercise.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isCompound: true, isActive: true },
        orderBy: { name: 'asc' },
      }),
    );
  });
});
