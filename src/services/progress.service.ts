import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';
import { AppError } from '@/lib/errors';
import { evaluateBodyCompositionBadges, type NewBadge } from '@/services/badge.service';
import {
  CURATED_MUSCLE_GROUPS,
  expandCuratedGroups,
  type CuratedMuscleGroupId,
} from '@/lib/muscle-groups';

// ─── Input Interfaces ───────────────────────────────

interface CreateProgressInput {
  clientProfileId: string;
  recordedByUserId: string;
  branchId: string;
  weightKg?: number;
  bodyFatPercent?: number;
  muscleMass?: number;
  chest?: number;
  waist?: number;
  hips?: number;
  bicepLeft?: number;
  bicepRight?: number;
  thighLeft?: number;
  thighRight?: number;
  photoUrls?: string[];
  notes?: string;
}

interface UpdateProgressInput {
  progressId: string;
  actorId: string;
  branchId: string;
  weightKg?: number;
  bodyFatPercent?: number;
  muscleMass?: number;
  chest?: number;
  waist?: number;
  hips?: number;
  bicepLeft?: number;
  bicepRight?: number;
  thighLeft?: number;
  thighRight?: number;
  photoUrls?: string[];
  notes?: string;
}

interface ListProgressInput {
  clientProfileId: string;
  branchId: string;
}

interface ChartDataInput {
  clientProfileId: string;
  branchId: string;
  metric: 'weight' | 'bodyFat' | 'muscleMass' | 'exercise';
  exerciseId?: string;
}

// ─── Service Functions ──────────────────────────────

/**
 * Create or overwrite today's progress entry for a client.
 * Only one entry per calendar day is allowed — logging again on the same day
 * overwrites the existing values for the fields that are provided.
 */
export async function createProgressEntry({
  clientProfileId,
  recordedByUserId,
  branchId,
  ...measurements
}: CreateProgressInput) {
  // Verify client exists in this branch
  const client = await prisma.clientProfile.findFirst({
    where: { id: clientProfileId, branchId },
  });

  if (!client) {
    throw new AppError('CLIENT_NOT_FOUND', 'Client not found', 404);
  }

  // Check for an existing entry recorded today (UTC calendar day)
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setUTCHours(23, 59, 59, 999);

  const existing = await prisma.progressEntry.findFirst({
    where: {
      clientProfileId,
      recordedAt: { gte: todayStart, lte: todayEnd },
    },
  });

  if (existing) {
    // Overwrite today's entry with the new values
    const updated = await prisma.progressEntry.update({
      where: { id: existing.id },
      data: {
        recordedByUserId,
        ...(measurements.weightKg !== undefined && { weightKg: measurements.weightKg }),
        ...(measurements.bodyFatPercent !== undefined && {
          bodyFatPercent: measurements.bodyFatPercent,
        }),
        ...(measurements.muscleMass !== undefined && { muscleMass: measurements.muscleMass }),
        ...(measurements.chest !== undefined && { chest: measurements.chest }),
        ...(measurements.waist !== undefined && { waist: measurements.waist }),
        ...(measurements.hips !== undefined && { hips: measurements.hips }),
        ...(measurements.bicepLeft !== undefined && { bicepLeft: measurements.bicepLeft }),
        ...(measurements.bicepRight !== undefined && { bicepRight: measurements.bicepRight }),
        ...(measurements.thighLeft !== undefined && { thighLeft: measurements.thighLeft }),
        ...(measurements.thighRight !== undefined && { thighRight: measurements.thighRight }),
        ...(measurements.photoUrls !== undefined && { photoUrls: measurements.photoUrls }),
        ...(measurements.notes !== undefined && { notes: measurements.notes }),
      },
    });

    await auditLog({
      action: 'PROGRESS_UPDATED',
      actorId: recordedByUserId,
      subjectType: 'ProgressEntry',
      subjectId: existing.id,
      branchId,
      oldValue: { weightKg: existing.weightKg, bodyFatPercent: existing.bodyFatPercent },
      newValue: {
        weightKg: measurements.weightKg,
        bodyFatPercent: measurements.bodyFatPercent,
      },
    });

    // Evaluate body composition badges (non-blocking)
    const newBadges: NewBadge[] = [];
    try {
      const badges = await evaluateBodyCompositionBadges(
        clientProfileId,
        branchId,
        recordedByUserId,
      );
      newBadges.push(...badges);
    } catch {
      // badge evaluation failure must never break progress save
    }

    return { entry: updated, newBadges };
  }

  // No entry today — create a fresh one
  const entry = await prisma.progressEntry.create({
    data: {
      clientProfileId,
      recordedByUserId,
      weightKg: measurements.weightKg ?? null,
      bodyFatPercent: measurements.bodyFatPercent ?? null,
      muscleMass: measurements.muscleMass ?? null,
      chest: measurements.chest ?? null,
      waist: measurements.waist ?? null,
      hips: measurements.hips ?? null,
      bicepLeft: measurements.bicepLeft ?? null,
      bicepRight: measurements.bicepRight ?? null,
      thighLeft: measurements.thighLeft ?? null,
      thighRight: measurements.thighRight ?? null,
      photoUrls: measurements.photoUrls ?? [],
      notes: measurements.notes ?? null,
    },
  });

  await auditLog({
    action: 'PROGRESS_CREATED',
    actorId: recordedByUserId,
    subjectType: 'ProgressEntry',
    subjectId: entry.id,
    branchId,
    newValue: {
      clientProfileId,
      weightKg: measurements.weightKg,
      bodyFatPercent: measurements.bodyFatPercent,
    },
  });

  // Evaluate body composition badges (non-blocking)
  const newBadges: NewBadge[] = [];
  try {
    const badges = await evaluateBodyCompositionBadges(clientProfileId, branchId, recordedByUserId);
    newBadges.push(...badges);
  } catch {
    // badge evaluation failure must never break progress save
  }

  return { entry, newBadges };
}

/**
 * Update a progress entry.
 */
export async function updateProgressEntry({
  progressId,
  actorId,
  branchId,
  ...measurements
}: UpdateProgressInput) {
  const entry = await prisma.progressEntry.findFirst({
    where: { id: progressId },
    include: { client: { select: { branchId: true } } },
  });

  if (!entry || entry.client.branchId !== branchId) {
    throw new AppError('PROGRESS_NOT_FOUND', 'Progress entry not found', 404);
  }

  const oldValue = {
    weightKg: entry.weightKg,
    bodyFatPercent: entry.bodyFatPercent,
    muscleMass: entry.muscleMass,
  };

  const updated = await prisma.progressEntry.update({
    where: { id: progressId },
    data: {
      ...(measurements.weightKg !== undefined && { weightKg: measurements.weightKg }),
      ...(measurements.bodyFatPercent !== undefined && {
        bodyFatPercent: measurements.bodyFatPercent,
      }),
      ...(measurements.muscleMass !== undefined && { muscleMass: measurements.muscleMass }),
      ...(measurements.chest !== undefined && { chest: measurements.chest }),
      ...(measurements.waist !== undefined && { waist: measurements.waist }),
      ...(measurements.hips !== undefined && { hips: measurements.hips }),
      ...(measurements.bicepLeft !== undefined && { bicepLeft: measurements.bicepLeft }),
      ...(measurements.bicepRight !== undefined && { bicepRight: measurements.bicepRight }),
      ...(measurements.thighLeft !== undefined && { thighLeft: measurements.thighLeft }),
      ...(measurements.thighRight !== undefined && { thighRight: measurements.thighRight }),
      ...(measurements.photoUrls !== undefined && { photoUrls: measurements.photoUrls }),
      ...(measurements.notes !== undefined && { notes: measurements.notes }),
    },
  });

  await auditLog({
    action: 'PROGRESS_UPDATED',
    actorId,
    subjectType: 'ProgressEntry',
    subjectId: progressId,
    branchId,
    oldValue,
    newValue: {
      weightKg: measurements.weightKg,
      bodyFatPercent: measurements.bodyFatPercent,
      muscleMass: measurements.muscleMass,
    },
  });

  return updated;
}

/**
 * List all progress entries for a client, ordered by date.
 */
export async function listProgressEntries({ clientProfileId, branchId }: ListProgressInput) {
  // Verify client belongs to this branch
  const client = await prisma.clientProfile.findFirst({
    where: { id: clientProfileId, branchId },
  });

  if (!client) {
    throw new AppError('CLIENT_NOT_FOUND', 'Client not found', 404);
  }

  return prisma.progressEntry.findMany({
    where: { clientProfileId },
    orderBy: { recordedAt: 'desc' },
  });
}

/**
 * Get chart data for a specific metric.
 */
export async function getChartData({
  clientProfileId,
  branchId,
  metric,
  exerciseId,
}: ChartDataInput) {
  // Verify client belongs to this branch
  const client = await prisma.clientProfile.findFirst({
    where: { id: clientProfileId, branchId },
  });

  if (!client) {
    throw new AppError('CLIENT_NOT_FOUND', 'Client not found', 404);
  }

  if (metric === 'weight') {
    const entries = await prisma.progressEntry.findMany({
      where: { clientProfileId, weightKg: { not: null } },
      select: { recordedAt: true, weightKg: true },
      orderBy: { recordedAt: 'asc' },
    });
    return entries.map((e) => ({
      date: e.recordedAt.toISOString(),
      value: e.weightKg,
      label: 'Weight (kg)',
    }));
  }

  if (metric === 'bodyFat') {
    const entries = await prisma.progressEntry.findMany({
      where: { clientProfileId, bodyFatPercent: { not: null } },
      select: { recordedAt: true, bodyFatPercent: true },
      orderBy: { recordedAt: 'asc' },
    });
    return entries.map((e) => ({
      date: e.recordedAt.toISOString(),
      value: e.bodyFatPercent,
      label: 'Body Fat (%)',
    }));
  }

  if (metric === 'muscleMass') {
    const entries = await prisma.progressEntry.findMany({
      where: { clientProfileId, muscleMass: { not: null } },
      select: { recordedAt: true, muscleMass: true },
      orderBy: { recordedAt: 'asc' },
    });
    return entries.map((e) => ({
      date: e.recordedAt.toISOString(),
      value: e.muscleMass,
      label: 'Muscle Mass (kg)',
    }));
  }

  // metric === 'exercise' — weight progression for a specific exercise
  if (!exerciseId) {
    throw new AppError('MISSING_EXERCISE_ID', 'exerciseId is required for exercise metric', 400);
  }

  // Determine exercise type to know which field to chart
  const exercise = await prisma.exercise.findUnique({
    where: { id: exerciseId },
    select: { exerciseType: true, name: true },
  });
  if (!exercise) throw new AppError('EXERCISE_NOT_FOUND', 'Exercise not found', 404);

  const type = exercise.exerciseType;

  const workoutLogs = await prisma.workoutLog.findMany({
    where: { exerciseId, sessionInstance: { clientProfileId } },
    include: {
      sets: true,
      sessionInstance: { select: { scheduledDate: true } },
    },
    orderBy: { sessionInstance: { scheduledDate: 'asc' } },
  });

  if (type === 'WEIGHTED') {
    return workoutLogs
      .map((log) => {
        const maxW = Math.max(...log.sets.map((s) => s.weightKg ?? 0));
        return maxW > 0
          ? {
              date: log.sessionInstance.scheduledDate.toISOString(),
              value: maxW,
              label: 'Max Weight (kg)',
            }
          : null;
      })
      .filter(Boolean) as { date: string; value: number; label: string }[];
  }

  if (type === 'BODYWEIGHT') {
    return workoutLogs
      .map((log) => {
        const maxR = Math.max(...log.sets.map((s) => s.reps ?? 0));
        return maxR > 0
          ? {
              date: log.sessionInstance.scheduledDate.toISOString(),
              value: maxR,
              label: 'Max Reps',
            }
          : null;
      })
      .filter(Boolean) as { date: string; value: number; label: string }[];
  }

  // DURATION or CARDIO — max duration per session
  return workoutLogs
    .map((log) => {
      const maxD = Math.max(...log.sets.map((s) => s.durationSec ?? 0));
      return maxD > 0
        ? {
            date: log.sessionInstance.scheduledDate.toISOString(),
            value: maxD,
            label: 'Duration (sec)',
          }
        : null;
    })
    .filter(Boolean) as { date: string; value: number; label: string }[];
}

/**
 * List exercises a client has weight-based workout data for, with summary stats.
 * Only returns exercises with ≥2 data points (enough to draw a trend).
 */
export async function listExercisesWithProgressData({
  clientProfileId,
  branchId,
}: {
  clientProfileId: string;
  branchId: string;
}) {
  const client = await prisma.clientProfile.findFirst({
    where: { id: clientProfileId, branchId },
  });
  if (!client) throw new AppError('CLIENT_NOT_FOUND', 'Client not found', 404);

  const rows = await prisma.workoutLog.findMany({
    where: {
      sessionInstance: { clientProfileId, branchId },
      // At least one set with some meaningful data
      sets: {
        some: {
          OR: [
            { weightKg: { not: null } },
            { reps: { not: null } },
            { durationSec: { not: null } },
          ],
        },
      },
    },
    select: {
      exerciseId: true,
      exercise: {
        select: { name: true, targetMuscleGroup: true, exerciseType: true },
      },
      sets: {
        select: { weightKg: true, reps: true, durationSec: true },
      },
      sessionInstance: { select: { scheduledDate: true } },
    },
    orderBy: { sessionInstance: { scheduledDate: 'asc' } },
  });

  const UNIT_MAP: Record<string, string> = {
    WEIGHTED: 'kg',
    BODYWEIGHT: 'reps',
    DURATION: 'sec',
    CARDIO: 'sec',
  };

  const map = new Map<
    string,
    {
      name: string;
      muscle: string;
      exerciseType: string;
      unit: string;
      values: number[];
    }
  >();

  for (const row of rows) {
    const type = row.exercise.exerciseType;
    let maxVal: number | null = null;

    if (type === 'WEIGHTED') {
      const vals = row.sets.map((s) => s.weightKg ?? 0).filter((v) => v > 0);
      maxVal = vals.length > 0 ? Math.max(...vals) : null;
    } else if (type === 'BODYWEIGHT') {
      const vals = row.sets.map((s) => s.reps ?? 0).filter((v) => v > 0);
      maxVal = vals.length > 0 ? Math.max(...vals) : null;
    } else {
      // DURATION or CARDIO
      const vals = row.sets.map((s) => s.durationSec ?? 0).filter((v) => v > 0);
      maxVal = vals.length > 0 ? Math.max(...vals) : null;
    }

    if (maxVal == null) continue;

    if (!map.has(row.exerciseId)) {
      map.set(row.exerciseId, {
        name: row.exercise.name,
        muscle: row.exercise.targetMuscleGroup,
        exerciseType: type,
        unit: UNIT_MAP[type] ?? 'kg',
        values: [],
      });
    }
    map.get(row.exerciseId)!.values.push(maxVal);
  }

  return Array.from(map.entries())
    .filter(([, v]) => v.values.length >= 1)
    .map(([id, v]) => ({
      id,
      name: v.name,
      targetMuscleGroup: v.muscle,
      exerciseType: v.exerciseType,
      unit: v.unit,
      sessionCount: v.values.length,
      currentMax: v.values[v.values.length - 1]!,
      startMax: v.values[0]!,
      improvement: +(v.values[v.values.length - 1]! - v.values[0]!).toFixed(1),
    }))
    .sort((a, b) => b.sessionCount - a.sessionCount);
}

/**
 * List recent workout sessions for a client — each session with its logged
 * exercises and sets. Used by the trainer's "Workout History" tab.
 */
export async function listWorkoutHistory({
  clientProfileId,
  branchId,
  limit = 20,
}: {
  clientProfileId: string;
  branchId: string;
  limit?: number;
}) {
  const client = await prisma.clientProfile.findFirst({
    where: { id: clientProfileId, branchId },
    select: { id: true },
  });
  if (!client) throw new AppError('CLIENT_NOT_FOUND', 'Client not found', 404);

  const sessions = await prisma.sessionInstance.findMany({
    where: {
      clientProfileId,
      branchId,
      workoutLogs: { some: {} },
    },
    select: {
      id: true,
      scheduledDate: true,
      scheduledTime: true,
      status: true,
      actualDurationMin: true,
      durationMin: true,
      workoutLogs: {
        select: {
          id: true,
          orderIndex: true,
          exercise: {
            select: {
              id: true,
              name: true,
              targetMuscleGroup: true,
              exerciseType: true,
            },
          },
          sets: {
            select: {
              id: true,
              setNumber: true,
              reps: true,
              weightKg: true,
              durationSec: true,
              rpe: true,
            },
            orderBy: { setNumber: 'asc' },
          },
        },
        orderBy: { orderIndex: 'asc' },
      },
    },
    orderBy: { scheduledDate: 'desc' },
    take: limit,
  });

  return sessions.map((s) => ({
    sessionId: s.id,
    date: s.scheduledDate.toISOString(),
    time: s.scheduledTime,
    status: s.status,
    durationMin: s.actualDurationMin ?? s.durationMin,
    exercises: s.workoutLogs.map((log) => ({
      id: log.id,
      name: log.exercise.name,
      targetMuscleGroup: log.exercise.targetMuscleGroup,
      exerciseType: log.exercise.exerciseType,
      sets: log.sets.map((set) => ({
        setNumber: set.setNumber,
        reps: set.reps,
        weightKg: set.weightKg,
        durationSec: set.durationSec,
        rpe: set.rpe,
      })),
    })),
  }));
}

// ─── Recent exercises by curated muscle group ────────────────────────────────
//
// Powers the trainer's "today's focus" picker. For each curated bucket the
// trainer selects (Chest, Legs, ...), return the top N exercises this client
// has performed in that bucket — ordered by recency, with the *last set* of
// the most recent session attached so the trainer sees prior weight/reps as
// progression hints.

export interface LastSetSnapshot {
  setNumber: number;
  reps: number | null;
  weightKg: number | null;
  durationSec: number | null;
  rpe: number | null;
  performedAt: string;
}

export interface RecentExerciseSuggestion {
  exerciseId: string;
  name: string;
  targetMuscleGroup: string;
  category: string;
  exerciseType: 'WEIGHTED' | 'BODYWEIGHT' | 'DURATION' | 'CARDIO';
  /** Most recent set logged for this exercise across all sessions for the client. */
  lastSet: LastSetSnapshot | null;
  /** Total sessions in which this exercise appears (for ranking context). */
  sessionCount: number;
}

export interface MuscleGroupSuggestions {
  groupId: CuratedMuscleGroupId;
  label: string;
  exercises: RecentExerciseSuggestion[];
}

export async function getRecentExercisesByMuscleGroup({
  clientProfileId,
  branchId,
  curatedGroupIds,
  perGroup = 5,
}: {
  clientProfileId: string;
  branchId: string;
  curatedGroupIds: CuratedMuscleGroupId[];
  perGroup?: number;
}): Promise<MuscleGroupSuggestions[]> {
  const client = await prisma.clientProfile.findFirst({
    where: { id: clientProfileId, branchId },
    select: { id: true },
  });
  if (!client) throw new AppError('CLIENT_NOT_FOUND', 'Client not found', 404);

  const catalogValues = expandCuratedGroups(curatedGroupIds);
  if (catalogValues.length === 0) {
    return curatedGroupIds.map((id) => ({
      groupId: id,
      label: CURATED_MUSCLE_GROUPS.find((g) => g.id === id)?.label ?? id,
      exercises: [],
    }));
  }

  // Pull every workout log for this client whose exercise sits in one of the
  // requested catalog values. Newest first so the first occurrence per
  // exerciseId is the most recent session.
  const logs = await prisma.workoutLog.findMany({
    where: {
      sessionInstance: { clientProfileId, branchId },
      exercise: { targetMuscleGroup: { in: catalogValues } },
    },
    select: {
      id: true,
      createdAt: true,
      exercise: {
        select: {
          id: true,
          name: true,
          targetMuscleGroup: true,
          category: true,
          exerciseType: true,
        },
      },
      sets: {
        select: {
          setNumber: true,
          reps: true,
          weightKg: true,
          durationSec: true,
          rpe: true,
          createdAt: true,
        },
        orderBy: { setNumber: 'asc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  type Acc = {
    exerciseId: string;
    name: string;
    targetMuscleGroup: string;
    category: string;
    exerciseType: 'WEIGHTED' | 'BODYWEIGHT' | 'DURATION' | 'CARDIO';
    lastSet: LastSetSnapshot | null;
    lastSeenAt: Date;
    sessionCount: number;
  };

  // First sweep: aggregate per exerciseId. Because logs are ordered newest →
  // oldest, the first time we encounter an exercise its `sets` belong to the
  // most recent session — pick the highest-set-number row that has data as
  // the canonical "last set" (trainers care about the working set, not a
  // warmup row).
  const byExercise = new Map<string, Acc>();
  for (const log of logs) {
    const ex = log.exercise;
    const existing = byExercise.get(ex.id);
    if (existing) {
      existing.sessionCount += 1;
      continue;
    }
    const dataSets = log.sets.filter(
      (s) => s.reps != null || s.weightKg != null || s.durationSec != null || s.rpe != null,
    );
    const chosen = dataSets[dataSets.length - 1] ?? log.sets[log.sets.length - 1] ?? null;
    byExercise.set(ex.id, {
      exerciseId: ex.id,
      name: ex.name,
      targetMuscleGroup: ex.targetMuscleGroup,
      category: ex.category,
      exerciseType: ex.exerciseType,
      lastSet: chosen
        ? {
            setNumber: chosen.setNumber,
            reps: chosen.reps,
            weightKg: chosen.weightKg,
            durationSec: chosen.durationSec,
            rpe: chosen.rpe,
            performedAt: (chosen.createdAt ?? log.createdAt).toISOString(),
          }
        : null,
      lastSeenAt: log.createdAt,
      sessionCount: 1,
    });
  }

  // Bucket exercises into their curated group. An exercise's catalog
  // muscle (e.g. "Quadriceps") may map to one curated id (e.g. "legs").
  const groupOf = (catalogMuscle: string): CuratedMuscleGroupId | null => {
    for (const g of CURATED_MUSCLE_GROUPS) {
      if (g.includes.some((v) => v.toLowerCase() === catalogMuscle.toLowerCase())) return g.id;
    }
    return null;
  };

  const buckets = new Map<CuratedMuscleGroupId, Acc[]>();
  for (const id of curatedGroupIds) buckets.set(id, []);
  for (const acc of byExercise.values()) {
    const gid = groupOf(acc.targetMuscleGroup);
    if (gid && buckets.has(gid)) buckets.get(gid)!.push(acc);
  }

  return curatedGroupIds.map((id) => {
    const list = (buckets.get(id) ?? [])
      .sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime())
      .slice(0, perGroup)
      .map<RecentExerciseSuggestion>((a) => ({
        exerciseId: a.exerciseId,
        name: a.name,
        targetMuscleGroup: a.targetMuscleGroup,
        category: a.category,
        exerciseType: a.exerciseType,
        lastSet: a.lastSet,
        sessionCount: a.sessionCount,
      }));
    return {
      groupId: id,
      label: CURATED_MUSCLE_GROUPS.find((g) => g.id === id)?.label ?? id,
      exercises: list,
    };
  });
}

// ─── Last set per exercise ────────────────────────────────────────────────────
//
// Lightweight lookup used by the workout logger to populate placeholder hints
// for empty input rows. Given a set of exerciseIds the trainer is logging in
// the current session, return the most recent prior set for each one — drawn
// from any other session for the same client. Caller passes
// `excludeSessionId` so the current session's own (possibly partial) sets
// don't shadow the real progression reference.

export async function getLastSetsByExercise({
  clientProfileId,
  branchId,
  exerciseIds,
  excludeSessionId,
}: {
  clientProfileId: string;
  branchId: string;
  exerciseIds: string[];
  excludeSessionId?: string;
}): Promise<Array<{ exerciseId: string; sets: LastSetSnapshot[] }>> {
  if (exerciseIds.length === 0) return [];

  const client = await prisma.clientProfile.findFirst({
    where: { id: clientProfileId, branchId },
    select: { id: true },
  });
  if (!client) throw new AppError('CLIENT_NOT_FOUND', 'Client not found', 404);

  const logs = await prisma.workoutLog.findMany({
    where: {
      sessionInstance: {
        clientProfileId,
        branchId,
        ...(excludeSessionId ? { id: { not: excludeSessionId } } : {}),
      },
      exerciseId: { in: exerciseIds },
    },
    select: {
      exerciseId: true,
      createdAt: true,
      sets: {
        select: {
          setNumber: true,
          reps: true,
          weightKg: true,
          durationSec: true,
          rpe: true,
          createdAt: true,
        },
        orderBy: { setNumber: 'asc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const result = new Map<string, LastSetSnapshot[]>();
  for (const id of exerciseIds) result.set(id, []);

  // Walk newest → oldest, take the first log per exerciseId. Return ALL sets
  // from that log so the caller can show per-row placeholders (set 1 → prior
  // set 1, set 2 → prior set 2, …) rather than repeating one snapshot.
  const seen = new Set<string>();
  for (const log of logs) {
    if (seen.has(log.exerciseId)) continue;
    seen.add(log.exerciseId);
    const sets: LastSetSnapshot[] = log.sets.map((s) => ({
      setNumber: s.setNumber,
      reps: s.reps,
      weightKg: s.weightKg,
      durationSec: s.durationSec,
      rpe: s.rpe,
      performedAt: (s.createdAt ?? log.createdAt).toISOString(),
    }));
    result.set(log.exerciseId, sets);
  }

  return Array.from(result.entries()).map(([exerciseId, sets]) => ({ exerciseId, sets }));
}
