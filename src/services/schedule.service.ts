import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';
import { AppError } from '@/lib/errors';
import { timeSlotsOverlap } from '@/services/session-generation.service';
import type { DayOfWeek } from '@prisma/client';

interface CreateScheduleInput {
  branchId: string;
  clientProfileId: string;
  trainerProfileId: string;
  dayOfWeek: DayOfWeek;
  startTime: string;
  durationMin: number;
  validFrom: string;
  validUntil?: string;
  actorId: string;
}

interface UpdateScheduleInput {
  dayOfWeek?: DayOfWeek;
  startTime?: string;
  durationMin?: number;
  validFrom?: string;
  validUntil?: string;
  clientProfileId?: string;
  trainerProfileId?: string;
}

interface ListSchedulesInput {
  branchId: string;
  trainerId?: string;
  clientId?: string;
}

const SCHEDULE_INCLUDE = {
  client: { include: { user: { select: { firstName: true, lastName: true, email: true } } } },
  trainer: { include: { user: { select: { firstName: true, lastName: true, email: true } } } },
} as const;

/**
 * Create a recurring session schedule.
 */
export async function createSchedule(input: CreateScheduleInput) {
  // Verify client profile
  const client = await prisma.clientProfile.findFirst({
    where: { id: input.clientProfileId, branchId: input.branchId },
  });
  if (!client) {
    throw new AppError('CLIENT_NOT_FOUND', 'Client profile not found', 404);
  }

  // Verify trainer profile
  const trainer = await prisma.trainerProfile.findFirst({
    where: { id: input.trainerProfileId, branchId: input.branchId },
  });
  if (!trainer) {
    throw new AppError('TRAINER_NOT_FOUND', 'Trainer profile not found', 404);
  }

  // Validate: warn if the day conflicts with trainer's default working days
  if (trainer.workingDays.length > 0 && !trainer.workingDays.includes(input.dayOfWeek as never)) {
    throw new AppError(
      'DAY_OUTSIDE_WORKING_DAYS',
      `${input.dayOfWeek} is not in this trainer's default working days. Add an availability override for specific dates, or update the trainer's working days first.`,
      400,
    );
  }

  // Validate: warn if the start time is outside trainer's working hours
  if (trainer.workingHoursStart && trainer.workingHoursEnd) {
    if (input.startTime < trainer.workingHoursStart || input.startTime >= trainer.workingHoursEnd) {
      throw new AppError(
        'TIME_OUTSIDE_WORKING_HOURS',
        `Start time ${input.startTime} is outside this trainer's working hours (${trainer.workingHoursStart}–${trainer.workingHoursEnd}).`,
        400,
      );
    }
  }

  // Check for trainer time conflict on the same day
  const trainerSchedules = await prisma.sessionSchedule.findMany({
    where: {
      branchId: input.branchId,
      trainerProfileId: input.trainerProfileId,
      dayOfWeek: input.dayOfWeek,
      isActive: true,
    },
    include: {
      client: { include: { user: { select: { firstName: true, lastName: true } } } },
    },
  });

  for (const existing of trainerSchedules) {
    const overlap = timeSlotsOverlap(
      input.startTime,
      input.durationMin,
      existing.startTime,
      existing.durationMin,
    );
    if (overlap > 0) {
      const clientName = `${existing.client.user.firstName} ${existing.client.user.lastName}`;
      throw new AppError(
        'TRAINER_SCHEDULE_CONFLICT',
        `This trainer already has a session with ${clientName} on ${input.dayOfWeek} at ${existing.startTime} (${existing.durationMin}min). The new schedule overlaps by ${overlap} minutes.`,
        409,
      );
    }
  }

  // Check for client time conflict on the same day (with any trainer)
  const clientSchedules = await prisma.sessionSchedule.findMany({
    where: {
      branchId: input.branchId,
      clientProfileId: input.clientProfileId,
      dayOfWeek: input.dayOfWeek,
      isActive: true,
    },
    include: {
      trainer: { include: { user: { select: { firstName: true, lastName: true } } } },
    },
  });

  for (const existing of clientSchedules) {
    const overlap = timeSlotsOverlap(
      input.startTime,
      input.durationMin,
      existing.startTime,
      existing.durationMin,
    );
    if (overlap > 0) {
      const trainerName = `${existing.trainer.user.firstName} ${existing.trainer.user.lastName}`;
      throw new AppError(
        'CLIENT_SCHEDULE_CONFLICT',
        `This client already has a session with trainer ${trainerName} on ${input.dayOfWeek} at ${existing.startTime} (${existing.durationMin}min). The new schedule overlaps by ${overlap} minutes.`,
        409,
      );
    }
  }

  const schedule = await prisma.sessionSchedule.create({
    data: {
      branchId: input.branchId,
      clientProfileId: input.clientProfileId,
      trainerProfileId: input.trainerProfileId,
      dayOfWeek: input.dayOfWeek,
      startTime: input.startTime,
      durationMin: input.durationMin,
      validFrom: new Date(input.validFrom),
      validUntil: input.validUntil ? new Date(input.validUntil) : null,
    },
    include: SCHEDULE_INCLUDE,
  });

  await auditLog({
    action: 'SCHEDULE_CREATED',
    actorId: input.actorId,
    subjectType: 'SessionSchedule',
    subjectId: schedule.id,
    branchId: input.branchId,
    newValue: {
      clientProfileId: input.clientProfileId,
      trainerProfileId: input.trainerProfileId,
      dayOfWeek: input.dayOfWeek,
      startTime: input.startTime,
      durationMin: input.durationMin,
    },
  });

  return schedule;
}

/**
 * List schedules filtered by trainer and/or client.
 */
export async function getSchedules(input: ListSchedulesInput) {
  const where: Record<string, unknown> = {
    branchId: input.branchId,
  };
  if (input.trainerId) where.trainerProfileId = input.trainerId;
  if (input.clientId) where.clientProfileId = input.clientId;

  const schedules = await prisma.sessionSchedule.findMany({
    where,
    include: SCHEDULE_INCLUDE,
    orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
  });

  return { data: schedules };
}

/**
 * Get a single schedule by ID.
 */
export async function getScheduleById(id: string, branchId: string) {
  const schedule = await prisma.sessionSchedule.findFirst({
    where: { id, branchId },
    include: SCHEDULE_INCLUDE,
  });
  if (!schedule) {
    throw new AppError('SCHEDULE_NOT_FOUND', 'Schedule not found', 404);
  }
  return schedule;
}

/**
 * Update a schedule.
 */
export async function updateSchedule(
  id: string,
  branchId: string,
  actorId: string,
  input: UpdateScheduleInput,
) {
  const existing = await prisma.sessionSchedule.findFirst({
    where: { id, branchId },
  });
  if (!existing) {
    throw new AppError('SCHEDULE_NOT_FOUND', 'Schedule not found', 404);
  }

  const data: Record<string, unknown> = {};
  if (input.dayOfWeek !== undefined) data.dayOfWeek = input.dayOfWeek;
  if (input.startTime !== undefined) data.startTime = input.startTime;
  if (input.durationMin !== undefined) data.durationMin = input.durationMin;
  if (input.validFrom !== undefined) data.validFrom = new Date(input.validFrom);
  if (input.validUntil !== undefined) data.validUntil = new Date(input.validUntil);
  if (input.clientProfileId !== undefined) data.clientProfileId = input.clientProfileId;
  if (input.trainerProfileId !== undefined) data.trainerProfileId = input.trainerProfileId;

  const updated = await prisma.sessionSchedule.update({
    where: { id },
    data,
    include: SCHEDULE_INCLUDE,
  });

  await auditLog({
    action: 'SCHEDULE_UPDATED',
    actorId,
    subjectType: 'SessionSchedule',
    subjectId: id,
    branchId,
    oldValue: {
      dayOfWeek: existing.dayOfWeek,
      startTime: existing.startTime,
      durationMin: existing.durationMin,
    },
    newValue: {
      dayOfWeek: updated.dayOfWeek,
      startTime: updated.startTime,
      durationMin: updated.durationMin,
    },
  });

  return updated;
}

/**
 * Deactivate a schedule (soft delete).
 */
export async function deleteSchedule(id: string, branchId: string, actorId: string) {
  const existing = await prisma.sessionSchedule.findFirst({
    where: { id, branchId },
  });
  if (!existing) {
    throw new AppError('SCHEDULE_NOT_FOUND', 'Schedule not found', 404);
  }

  await prisma.sessionSchedule.update({
    where: { id },
    data: { isActive: false },
  });

  await auditLog({
    action: 'SCHEDULE_DEACTIVATED',
    actorId,
    subjectType: 'SessionSchedule',
    subjectId: id,
    branchId,
    oldValue: { isActive: true },
    newValue: { isActive: false },
  });

  return { success: true };
}
