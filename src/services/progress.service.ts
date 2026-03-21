import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';
import { AppError } from '@/lib/errors';

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
  metric: 'weight' | 'bodyFat' | 'exercise';
  exerciseId?: string;
}

// ─── Service Functions ──────────────────────────────

/**
 * Create a new progress entry for a client.
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

  return entry;
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

  // metric === 'exercise' — weight progression for a specific exercise
  if (!exerciseId) {
    throw new AppError('MISSING_EXERCISE_ID', 'exerciseId is required for exercise metric', 400);
  }

  // Get workout logs for this exercise, with the heaviest weight per session date
  const workoutLogs = await prisma.workoutLog.findMany({
    where: {
      exerciseId,
      sessionInstance: { clientProfileId },
    },
    include: {
      sets: {
        where: { weightKg: { not: null } },
        orderBy: { weightKg: 'desc' },
        take: 1,
      },
      sessionInstance: {
        select: { scheduledDate: true },
      },
    },
    orderBy: { sessionInstance: { scheduledDate: 'asc' } },
  });

  return workoutLogs
    .filter((log) => log.sets.length > 0)
    .map((log) => ({
      date: log.sessionInstance.scheduledDate.toISOString(),
      value: log.sets[0]!.weightKg,
      label: 'Max Weight (kg)',
    }));
}
