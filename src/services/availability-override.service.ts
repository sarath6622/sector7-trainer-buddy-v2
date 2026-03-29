import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';
import { AppError } from '@/lib/errors';

// ─── Input Interfaces ───────────────────────────────

interface CreateOverrideInput {
  branchId: string;
  trainerProfileId: string;
  date: string;
  isAvailable: boolean;
  startTime?: string;
  endTime?: string;
  reason?: string;
  actorId: string;
}

interface BulkCreateOverrideInput {
  branchId: string;
  trainerProfileId: string;
  overrides: {
    date: string;
    isAvailable: boolean;
    startTime?: string;
    endTime?: string;
    reason?: string;
  }[];
  actorId: string;
}

interface ListOverridesInput {
  branchId: string;
  trainerProfileId?: string;
  dateFrom?: string;
  dateTo?: string;
}

interface DeleteOverrideInput {
  id: string;
  branchId: string;
  actorId: string;
}

// ─── Helper: Check trainer availability for a specific date ─────

const DAY_NAMES = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
] as const;

/**
 * Determine if a trainer is available on a specific date, considering overrides.
 * Returns { available, startTime, endTime } or null if no data.
 */
export async function isTrainerAvailable(
  trainerProfileId: string,
  branchId: string,
  date: Date,
): Promise<{ available: boolean; startTime: string | null; endTime: string | null }> {
  // Check for date-specific override first
  const override = await prisma.trainerAvailabilityOverride.findUnique({
    where: {
      trainerProfileId_date: {
        trainerProfileId,
        date: new Date(date.getFullYear(), date.getMonth(), date.getDate()),
      },
    },
  });

  if (override) {
    return {
      available: override.isAvailable,
      startTime: override.startTime,
      endTime: override.endTime,
    };
  }

  // Fall back to static profile
  const trainer = await prisma.trainerProfile.findFirst({
    where: { id: trainerProfileId, branchId },
  });

  if (!trainer) {
    return { available: false, startTime: null, endTime: null };
  }

  const dayOfWeek = DAY_NAMES[date.getDay()];
  const available =
    trainer.workingDays.length === 0 || trainer.workingDays.includes(dayOfWeek as never);

  return {
    available,
    startTime: trainer.workingHoursStart,
    endTime: trainer.workingHoursEnd,
  };
}

/**
 * Batch check: get overrides for a trainer within a date range.
 * Returns a Map<dateString, override>.
 */
export async function getOverridesMap(
  trainerProfileId: string,
  branchId: string,
  dateFrom: Date,
  dateTo: Date,
) {
  const overrides = await prisma.trainerAvailabilityOverride.findMany({
    where: {
      trainerProfileId,
      branchId,
      date: { gte: dateFrom, lte: dateTo },
    },
  });

  const map = new Map<string, (typeof overrides)[number]>();
  for (const o of overrides) {
    map.set(o.date.toISOString().split('T')[0]!, o);
  }
  return map;
}

// ─── CRUD Operations ────────────────────────────────

export async function createOverride(input: CreateOverrideInput) {
  // Verify trainer exists in this branch
  const trainer = await prisma.trainerProfile.findFirst({
    where: { id: input.trainerProfileId, branchId: input.branchId },
  });
  if (!trainer) {
    throw new AppError('TRAINER_NOT_FOUND', 'Trainer profile not found', 404);
  }

  const override = await prisma.trainerAvailabilityOverride.upsert({
    where: {
      trainerProfileId_date: {
        trainerProfileId: input.trainerProfileId,
        date: new Date(input.date),
      },
    },
    update: {
      isAvailable: input.isAvailable,
      startTime: input.startTime ?? null,
      endTime: input.endTime ?? null,
      reason: input.reason ?? null,
      createdByUserId: input.actorId,
    },
    create: {
      branchId: input.branchId,
      trainerProfileId: input.trainerProfileId,
      date: new Date(input.date),
      isAvailable: input.isAvailable,
      startTime: input.startTime ?? null,
      endTime: input.endTime ?? null,
      reason: input.reason ?? null,
      createdByUserId: input.actorId,
    },
    include: {
      trainer: { include: { user: { select: { firstName: true, lastName: true } } } },
    },
  });

  await auditLog({
    action: 'AVAILABILITY_OVERRIDE_SET',
    actorId: input.actorId,
    subjectType: 'TrainerAvailabilityOverride',
    subjectId: override.id,
    branchId: input.branchId,
    newValue: {
      trainerProfileId: input.trainerProfileId,
      date: input.date,
      isAvailable: input.isAvailable,
      startTime: input.startTime,
      endTime: input.endTime,
      reason: input.reason,
    },
  });

  return override;
}

export async function bulkCreateOverrides(input: BulkCreateOverrideInput) {
  const results = [];
  for (const o of input.overrides) {
    const result = await createOverride({
      branchId: input.branchId,
      trainerProfileId: input.trainerProfileId,
      date: o.date,
      isAvailable: o.isAvailable,
      startTime: o.startTime,
      endTime: o.endTime,
      reason: o.reason,
      actorId: input.actorId,
    });
    results.push(result);
  }
  return results;
}

export async function listOverrides(input: ListOverridesInput) {
  const where: Record<string, unknown> = { branchId: input.branchId };

  if (input.trainerProfileId) {
    where.trainerProfileId = input.trainerProfileId;
  }

  if (input.dateFrom || input.dateTo) {
    const dateFilter: Record<string, unknown> = {};
    if (input.dateFrom) dateFilter.gte = new Date(input.dateFrom);
    if (input.dateTo) dateFilter.lte = new Date(input.dateTo);
    where.date = dateFilter;
  }

  return prisma.trainerAvailabilityOverride.findMany({
    where,
    include: {
      trainer: { include: { user: { select: { firstName: true, lastName: true } } } },
    },
    orderBy: [{ date: 'asc' }],
  });
}

export async function deleteOverride({ id, branchId, actorId }: DeleteOverrideInput) {
  const existing = await prisma.trainerAvailabilityOverride.findFirst({
    where: { id, branchId },
  });
  if (!existing) {
    throw new AppError('OVERRIDE_NOT_FOUND', 'Availability override not found', 404);
  }

  await prisma.trainerAvailabilityOverride.delete({ where: { id } });

  await auditLog({
    action: 'AVAILABILITY_OVERRIDE_DELETED',
    actorId,
    subjectType: 'TrainerAvailabilityOverride',
    subjectId: id,
    branchId,
    oldValue: {
      trainerProfileId: existing.trainerProfileId,
      date: existing.date.toISOString().split('T')[0],
      isAvailable: existing.isAvailable,
    },
  });

  return { success: true };
}
