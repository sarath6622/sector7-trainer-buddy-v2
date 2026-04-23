import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';
import { AppError } from '@/lib/errors';
import type { DayOfWeek } from '@prisma/client';

// ─── Helpers ─────────────────────────────────────────

async function recomputeWorkingDays(trainerProfileId: string): Promise<DayOfWeek[]> {
  const now = new Date();
  const shifts = await prisma.trainerShift.findMany({
    where: {
      trainerProfileId,
      effectiveFrom: { lte: now },
      OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: now } }],
    },
    select: { days: true },
  });
  const days = new Set<string>();
  for (const shift of shifts) {
    for (const day of shift.days) days.add(day as string);
  }
  return Array.from(days) as DayOfWeek[];
}

/** Returns the "active as of date" filter for shift queries. */
function activeFilter(asOf: Date = new Date()) {
  return {
    effectiveFrom: { lte: asOf },
    OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: asOf } }],
  };
}

// ─── List Shifts ─────────────────────────────────────

export async function listShifts(
  branchId: string,
  trainerProfileId?: string,
  opts?: { includeScheduled?: boolean; includeExpired?: boolean },
) {
  const now = new Date();

  // Build OR clauses for which shift "states" to include
  type WhereOrClause =
    | {
        effectiveFrom: { lte: Date };
        OR: ({ effectiveUntil: null } | { effectiveUntil: { gt: Date } })[];
      }
    | { effectiveFrom: { gt: Date } }
    | { effectiveUntil: { lte: Date }; effectiveUntil_lte?: Date };

  const orClauses: WhereOrClause[] = [
    // Always include active shifts
    {
      effectiveFrom: { lte: now },
      OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: now } }],
    },
  ];

  if (opts?.includeScheduled) {
    orClauses.push({ effectiveFrom: { gt: now } });
  }
  if (opts?.includeExpired) {
    orClauses.push({ effectiveUntil: { lte: now } } as WhereOrClause);
  }

  return prisma.trainerShift.findMany({
    where: {
      branchId,
      ...(trainerProfileId ? { trainerProfileId } : {}),
      OR: orClauses,
    },
    include: {
      trainer: { include: { user: { select: { firstName: true, lastName: true } } } },
    },
    orderBy: [{ trainerProfileId: 'asc' }, { effectiveFrom: 'asc' }, { startTime: 'asc' }],
  });
}

// ─── Create Shift ─────────────────────────────────────

export async function createShift(input: {
  branchId: string;
  trainerProfileId: string;
  label: string;
  startTime: string;
  endTime: string;
  days: string[];
  effectiveFrom?: string; // ISO string; defaults to now
  actorId: string;
}) {
  const trainer = await prisma.trainerProfile.findFirst({
    where: { id: input.trainerProfileId, branchId: input.branchId },
  });
  if (!trainer) throw new AppError('TRAINER_NOT_FOUND', 'Trainer not found', 404);

  const effectiveFrom = input.effectiveFrom ? new Date(input.effectiveFrom) : new Date();

  const shift = await prisma.trainerShift.create({
    data: {
      branchId: input.branchId,
      trainerProfileId: input.trainerProfileId,
      label: input.label,
      startTime: input.startTime,
      endTime: input.endTime,
      days: input.days as DayOfWeek[],
      effectiveFrom,
    },
    include: {
      trainer: { include: { user: { select: { firstName: true, lastName: true } } } },
    },
  });

  // Only recompute workingDays if the shift is immediately active
  if (effectiveFrom <= new Date()) {
    const workingDays = await recomputeWorkingDays(input.trainerProfileId);
    await prisma.trainerProfile.update({
      where: { id: input.trainerProfileId },
      data: { workingDays },
    });
  }

  await auditLog({
    action: 'TRAINER_SHIFT_CREATED',
    actorId: input.actorId,
    subjectType: 'TrainerShift',
    subjectId: shift.id,
    branchId: input.branchId,
    newValue: {
      trainerProfileId: input.trainerProfileId,
      label: input.label,
      startTime: input.startTime,
      endTime: input.endTime,
      days: input.days,
      effectiveFrom: effectiveFrom.toISOString(),
    },
  });

  return shift;
}

// ─── Edit Shift (expire-and-replace) ─────────────────

/**
 * Edits a shift without destructive mutation:
 * 1. Sets the current shift's `effectiveUntil` to `effectiveFrom` (expires it on that date).
 * 2. Creates a new shift record with the updated fields and `effectiveFrom` as its start.
 *
 * If `effectiveFrom` is in the past or now → the old shift is immediately expired and the new one
 * is live. If `effectiveFrom` is in the future → the old shift remains active until that date.
 */
export async function editShift(
  id: string,
  branchId: string,
  actorId: string,
  updates: {
    label?: string;
    startTime?: string;
    endTime?: string;
    days?: string[];
    effectiveFrom: string; // ISO datetime — required
  },
) {
  const existing = await prisma.trainerShift.findFirst({
    where: { id, branchId },
  });
  if (!existing) throw new AppError('SHIFT_NOT_FOUND', 'Shift not found', 404);

  const effectiveFrom = new Date(updates.effectiveFrom);

  // Cannot set effectiveFrom earlier than the existing shift's own effectiveFrom
  if (effectiveFrom <= existing.effectiveFrom) {
    throw new AppError(
      'INVALID_EFFECTIVE_FROM',
      "Apply-from date must be after the current shift's effective date",
      400,
    );
  }

  const newLabel = updates.label ?? existing.label;
  const newStart = updates.startTime ?? existing.startTime;
  const newEnd = updates.endTime ?? existing.endTime;
  const newDays = (updates.days ?? existing.days) as DayOfWeek[];

  const [, newShift] = await prisma.$transaction([
    // 1. Expire the current shift at effectiveFrom
    prisma.trainerShift.update({
      where: { id },
      data: { effectiveUntil: effectiveFrom },
    }),
    // 2. Create the replacement shift starting at effectiveFrom
    prisma.trainerShift.create({
      data: {
        branchId,
        trainerProfileId: existing.trainerProfileId,
        label: newLabel,
        startTime: newStart,
        endTime: newEnd,
        days: newDays,
        effectiveFrom,
      },
    }),
  ]);

  // Recompute workingDays only if the change is effective now
  if (effectiveFrom <= new Date()) {
    const workingDays = await recomputeWorkingDays(existing.trainerProfileId);
    await prisma.trainerProfile.update({
      where: { id: existing.trainerProfileId },
      data: { workingDays },
    });
  }

  await auditLog({
    action: 'TRAINER_SHIFT_EDITED',
    actorId,
    subjectType: 'TrainerShift',
    subjectId: id,
    branchId,
    oldValue: {
      label: existing.label,
      startTime: existing.startTime,
      endTime: existing.endTime,
      days: existing.days,
      effectiveFrom: existing.effectiveFrom.toISOString(),
      effectiveUntil: existing.effectiveUntil?.toISOString() ?? null,
    },
    newValue: {
      newShiftId: newShift.id,
      label: newLabel,
      startTime: newStart,
      endTime: newEnd,
      days: newDays,
      effectiveFrom: effectiveFrom.toISOString(),
    },
  });

  return newShift;
}

// ─── Delete Shift ─────────────────────────────────────

/**
 * Deletes a shift.
 * - If the shift has not yet started (effectiveFrom > now) → hard delete (cancel future shift).
 * - If the shift is currently active → expire it immediately (set effectiveUntil = now).
 * - If already expired → hard delete (clean up old record).
 */
export async function deleteShift(id: string, branchId: string, actorId: string) {
  const existing = await prisma.trainerShift.findFirst({
    where: { id, branchId },
  });
  if (!existing) throw new AppError('SHIFT_NOT_FOUND', 'Shift not found', 404);

  const now = new Date();
  const isFuture = existing.effectiveFrom > now;
  const isActive =
    existing.effectiveFrom <= now &&
    (existing.effectiveUntil === null || existing.effectiveUntil > now);

  if (isFuture || !isActive) {
    // Hard delete — not yet live or already expired
    await prisma.trainerShift.delete({ where: { id } });
  } else {
    // Expire it immediately
    await prisma.trainerShift.update({
      where: { id },
      data: { effectiveUntil: now },
    });
  }

  // Recompute workingDays after any change
  const workingDays = await recomputeWorkingDays(existing.trainerProfileId);
  await prisma.trainerProfile.update({
    where: { id: existing.trainerProfileId },
    data: { workingDays },
  });

  await auditLog({
    action: 'TRAINER_SHIFT_DELETED',
    actorId,
    subjectType: 'TrainerShift',
    subjectId: id,
    branchId,
    oldValue: {
      trainerProfileId: existing.trainerProfileId,
      label: existing.label,
      startTime: existing.startTime,
      endTime: existing.endTime,
      days: existing.days,
      effectiveFrom: existing.effectiveFrom.toISOString(),
    },
  });

  return { success: true };
}

// ─── Shift Swaps ─────────────────────────────────────

export async function createShiftSwap(input: {
  branchId: string;
  trainerAProfileId: string;
  trainerBProfileId: string;
  swapFrom: string;
  swapUntil: string;
  notes?: string;
  actorId: string;
}) {
  if (input.trainerAProfileId === input.trainerBProfileId) {
    throw new AppError('INVALID_SWAP', 'Cannot swap a trainer with themselves', 400);
  }

  const swapFrom = new Date(input.swapFrom);
  const swapUntil = new Date(input.swapUntil);

  if (swapUntil <= swapFrom) {
    throw new AppError('INVALID_SWAP_DATES', 'Swap end date must be after start date', 400);
  }

  // Verify both trainers belong to the branch
  const trainers = await prisma.trainerProfile.findMany({
    where: {
      branchId: input.branchId,
      id: { in: [input.trainerAProfileId, input.trainerBProfileId] },
    },
  });
  if (trainers.length !== 2) {
    throw new AppError('TRAINER_NOT_FOUND', 'One or both trainers not found in branch', 404);
  }

  const swap = await prisma.shiftSwap.create({
    data: {
      branchId: input.branchId,
      trainerAProfileId: input.trainerAProfileId,
      trainerBProfileId: input.trainerBProfileId,
      swapFrom,
      swapUntil,
      status: 'PENDING',
      requestedByUserId: input.actorId,
      notes: input.notes,
    },
    include: {
      trainerA: { include: { user: { select: { firstName: true, lastName: true } } } },
      trainerB: { include: { user: { select: { firstName: true, lastName: true } } } },
    },
  });

  await auditLog({
    action: 'SHIFT_SWAP_CREATED',
    actorId: input.actorId,
    subjectType: 'ShiftSwap',
    subjectId: swap.id,
    branchId: input.branchId,
    newValue: {
      trainerAProfileId: input.trainerAProfileId,
      trainerBProfileId: input.trainerBProfileId,
      swapFrom: swapFrom.toISOString(),
      swapUntil: swapUntil.toISOString(),
    },
  });

  return swap;
}

export async function approveShiftSwap(id: string, branchId: string, actorId: string) {
  const swap = await prisma.shiftSwap.findFirst({ where: { id, branchId } });
  if (!swap) throw new AppError('SWAP_NOT_FOUND', 'Shift swap not found', 404);
  if (swap.status !== 'PENDING') {
    throw new AppError('INVALID_STATUS', `Swap is already ${swap.status.toLowerCase()}`, 400);
  }

  const updated = await prisma.shiftSwap.update({
    where: { id },
    data: { status: 'APPROVED' },
    include: {
      trainerA: { include: { user: { select: { firstName: true, lastName: true } } } },
      trainerB: { include: { user: { select: { firstName: true, lastName: true } } } },
    },
  });

  await auditLog({
    action: 'SHIFT_SWAP_APPROVED',
    actorId,
    subjectType: 'ShiftSwap',
    subjectId: id,
    branchId,
    oldValue: { status: 'PENDING' },
    newValue: { status: 'APPROVED' },
  });

  return updated;
}

export async function cancelShiftSwap(id: string, branchId: string, actorId: string) {
  const swap = await prisma.shiftSwap.findFirst({ where: { id, branchId } });
  if (!swap) throw new AppError('SWAP_NOT_FOUND', 'Shift swap not found', 404);
  if (swap.status === 'CANCELLED') {
    throw new AppError('ALREADY_CANCELLED', 'Swap is already cancelled', 400);
  }

  const updated = await prisma.shiftSwap.update({
    where: { id },
    data: { status: 'CANCELLED' },
    include: {
      trainerA: { include: { user: { select: { firstName: true, lastName: true } } } },
      trainerB: { include: { user: { select: { firstName: true, lastName: true } } } },
    },
  });

  await auditLog({
    action: 'SHIFT_SWAP_CANCELLED',
    actorId,
    subjectType: 'ShiftSwap',
    subjectId: id,
    branchId,
    oldValue: { status: swap.status },
    newValue: { status: 'CANCELLED' },
  });

  return updated;
}

export async function listShiftSwaps(
  branchId: string,
  opts?: { trainerId?: string; status?: 'PENDING' | 'APPROVED' | 'CANCELLED' },
) {
  return prisma.shiftSwap.findMany({
    where: {
      branchId,
      ...(opts?.status ? { status: opts.status } : {}),
      ...(opts?.trainerId
        ? {
            OR: [{ trainerAProfileId: opts.trainerId }, { trainerBProfileId: opts.trainerId }],
          }
        : {}),
    },
    include: {
      trainerA: { include: { user: { select: { firstName: true, lastName: true } } } },
      trainerB: { include: { user: { select: { firstName: true, lastName: true } } } },
    },
    orderBy: { swapFrom: 'asc' },
  });
}

// ─── Availability helper (used by schedule.service) ──

/**
 * Returns the effective shifts for a trainer on a given date,
 * accounting for any active APPROVED shift swaps.
 *
 * If trainerA has an approved swap with trainerB covering `date`,
 * trainerA gets trainerB's active shifts for that date and vice-versa.
 */
export async function getEffectiveShiftsForDate(
  trainerProfileId: string,
  date: Date,
): Promise<{ startTime: string; endTime: string; days: string[] }[]> {
  const dateOnly = new Date(date);
  dateOnly.setHours(0, 0, 0, 0);

  // Check for an active approved swap covering this date
  const swap = await prisma.shiftSwap.findFirst({
    where: {
      status: 'APPROVED',
      swapFrom: { lte: date },
      swapUntil: { gt: date },
      OR: [{ trainerAProfileId: trainerProfileId }, { trainerBProfileId: trainerProfileId }],
    },
  });

  // If swapped, resolve which trainer's shifts to use
  const resolvedTrainerId =
    swap === null
      ? trainerProfileId
      : swap.trainerAProfileId === trainerProfileId
        ? swap.trainerBProfileId
        : swap.trainerAProfileId;

  const shifts = await prisma.trainerShift.findMany({
    where: {
      trainerProfileId: resolvedTrainerId,
      ...activeFilter(date),
    },
    select: { startTime: true, endTime: true, days: true },
  });

  return shifts;
}
