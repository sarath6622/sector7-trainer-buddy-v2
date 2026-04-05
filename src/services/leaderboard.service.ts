import { prisma } from '@/lib/prisma';
import { AppError } from '@/lib/errors';

// ─── Types ────────────────────────────────────────────

export interface LeaderboardEntry {
  rank: number;
  clientProfileId: string;
  firstName: string;
  lastName: string;
  profileImageUrl: string | null;
  maxWeightKg: number;
  reps: number | null;
  achievedAt: Date;
}

// ─── Compound Lift Leaderboard ────────────────────────

/**
 * Returns ranked leaderboard for a compound exercise within a branch.
 * Ranking is by MAX weight logged in a WorkoutSet for the given exercise.
 * Only active clients with at least one set are included.
 */
export async function getCompoundLeaderboard({
  branchId,
  exerciseId,
}: {
  branchId: string;
  exerciseId: string;
}): Promise<LeaderboardEntry[]> {
  // Verify exercise exists and is compound
  const exercise = await prisma.exercise.findUnique({
    where: { id: exerciseId },
    select: { id: true, name: true, isCompound: true },
  });
  if (!exercise) throw new AppError('NOT_FOUND', 'Exercise not found', 404);
  if (!exercise.isCompound) {
    throw new AppError('BAD_REQUEST', 'Exercise is not marked as compound', 400);
  }

  // Aggregate max weight per client for this exercise
  // Join: WorkoutSet → WorkoutLog → SessionInstance → ClientProfile (branch-scoped)
  const rows = await prisma.$queryRaw<
    Array<{
      clientProfileId: string;
      firstName: string;
      lastName: string;
      profileImageUrl: string | null;
      maxWeightKg: number;
      reps: number | null;
      achievedAt: Date;
    }>
  >`
    SELECT
      cp.id           AS "clientProfileId",
      u."firstName",
      u."lastName",
      u."profileImageUrl",
      MAX(ws."weightKg")::float       AS "maxWeightKg",
      ws."reps",
      MAX(ws."createdAt")             AS "achievedAt"
    FROM workout_sets ws
    JOIN workout_logs wl   ON wl.id = ws."workoutLogId"
    JOIN session_instances si ON si.id = wl."sessionInstanceId"
    JOIN client_profiles cp   ON cp.id = si."clientProfileId"
    JOIN users u              ON u.id = cp."userId"
    JOIN exercises e          ON e.id = wl."exerciseId"
    WHERE
      si."branchId" = ${branchId}
      AND wl."exerciseId" = ${exerciseId}
      AND ws."weightKg" IS NOT NULL
      AND cp."branchId" = ${branchId}
    GROUP BY cp.id, u."firstName", u."lastName", u."profileImageUrl", ws."reps"
    ORDER BY "maxWeightKg" DESC
    LIMIT 50
  `;

  // Deduplicate per client — keep only best entry per client
  const seen = new Set<string>();
  const deduplicated: typeof rows = [];
  for (const row of rows) {
    if (!seen.has(row.clientProfileId)) {
      seen.add(row.clientProfileId);
      deduplicated.push(row);
    }
  }

  return deduplicated.map((row, index) => ({
    rank: index + 1,
    clientProfileId: row.clientProfileId,
    firstName: row.firstName,
    lastName: row.lastName,
    profileImageUrl: row.profileImageUrl,
    maxWeightKg: Number(row.maxWeightKg),
    reps: row.reps,
    achievedAt: row.achievedAt,
  }));
}

// ─── List Compound Exercises ──────────────────────────

/**
 * Returns all exercises marked as compound (global, not branch-scoped).
 * Used to populate the leaderboard exercise tabs.
 */
export async function getCompoundExercises() {
  return prisma.exercise.findMany({
    where: { isCompound: true, isActive: true },
    select: { id: true, name: true, targetMuscleGroup: true, category: true },
    orderBy: { name: 'asc' },
  });
}
