import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';
import { AppError } from '@/lib/errors';
import { evaluateBodyCompositionBadges, type NewBadge } from '@/services/badge.service';

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
