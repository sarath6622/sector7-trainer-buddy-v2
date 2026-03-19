import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';
import type { DayOfWeek } from '@prisma/client';

interface GenerateSessionsInput {
  branchId: string;
  month: string; // "YYYY-MM"
  scheduleIds?: string[];
  actorId: string;
}

interface Conflict {
  sessionA: { id: string; scheduledDate: string; scheduledTime: string; clientName: string };
  sessionB: { id: string; scheduledDate: string; scheduledTime: string; clientName: string };
  trainerName: string;
  overlapMinutes: number;
}

const DAY_MAP: Record<DayOfWeek, number> = {
  SUNDAY: 0,
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
};

/**
 * Get all dates in a given month that fall on a specific day of week.
 */
function getDatesForDay(year: number, month: number, dayOfWeek: DayOfWeek): Date[] {
  const targetDay = DAY_MAP[dayOfWeek];
  const dates: Date[] = [];
  const date = new Date(year, month - 1, 1);

  // Find first occurrence of the target day
  while (date.getDay() !== targetDay) {
    date.setDate(date.getDate() + 1);
  }

  // Collect all occurrences in the month
  while (date.getMonth() === month - 1) {
    dates.push(new Date(date));
    date.setDate(date.getDate() + 7);
  }

  return dates;
}

/**
 * Check if two time slots overlap.
 * Times are in "HH:MM" format, durations in minutes.
 */
function timeSlotsOverlap(
  startA: string,
  durationA: number,
  startB: string,
  durationB: number,
): number {
  const [hA, mA] = startA.split(':').map(Number);
  const [hB, mB] = startB.split(':').map(Number);
  const startMinA = hA! * 60 + mA!;
  const endMinA = startMinA + durationA;
  const startMinB = hB! * 60 + mB!;
  const endMinB = startMinB + durationB;

  const overlapStart = Math.max(startMinA, startMinB);
  const overlapEnd = Math.min(endMinA, endMinB);
  return Math.max(0, overlapEnd - overlapStart);
}

/**
 * Generate session instances for a given month from active schedules.
 * Returns the count of created instances and any conflicts detected.
 */
export async function generateSessions(input: GenerateSessionsInput) {
  const [yearStr, monthStr] = input.month.split('-');
  const year = parseInt(yearStr!, 10);
  const month = parseInt(monthStr!, 10);

  // Get active schedules for this branch
  const whereSchedule: Record<string, unknown> = {
    branchId: input.branchId,
    isActive: true,
    validFrom: { lte: new Date(year, month - 1 + 1, 0) }, // before end of month
  };
  if (input.scheduleIds?.length) {
    whereSchedule.id = { in: input.scheduleIds };
  }

  const schedules = await prisma.sessionSchedule.findMany({
    where: whereSchedule,
    include: {
      client: { include: { user: { select: { firstName: true, lastName: true } } } },
      trainer: { include: { user: { select: { firstName: true, lastName: true } } } },
    },
  });

  // Month boundaries for checking existing instances
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0, 23, 59, 59);

  // Get existing instances for this month to avoid duplicates
  const existingInstances = await prisma.sessionInstance.findMany({
    where: {
      branchId: input.branchId,
      scheduledDate: { gte: monthStart, lte: monthEnd },
    },
    select: {
      scheduleId: true,
      scheduledDate: true,
    },
  });

  // Build a set of existing schedule+date combos
  const existingKeys = new Set(
    existingInstances.map(
      (inst) => `${inst.scheduleId}|${inst.scheduledDate.toISOString().split('T')[0]}`,
    ),
  );

  // Generate instances
  const instancesToCreate: {
    branchId: string;
    scheduleId: string;
    clientProfileId: string;
    trainerProfileId: string;
    scheduledDate: Date;
    scheduledTime: string;
    durationMin: number;
  }[] = [];

  for (const schedule of schedules) {
    // Skip if validUntil is before the month starts
    if (schedule.validUntil && schedule.validUntil < monthStart) continue;

    const dates = getDatesForDay(year, month, schedule.dayOfWeek);

    for (const date of dates) {
      // Skip dates before validFrom
      if (date < schedule.validFrom) continue;
      // Skip dates after validUntil
      if (schedule.validUntil && date > schedule.validUntil) continue;

      const dateKey = `${schedule.id}|${date.toISOString().split('T')[0]}`;
      if (existingKeys.has(dateKey)) continue; // already generated

      instancesToCreate.push({
        branchId: input.branchId,
        scheduleId: schedule.id,
        clientProfileId: schedule.clientProfileId,
        trainerProfileId: schedule.trainerProfileId,
        scheduledDate: date,
        scheduledTime: schedule.startTime,
        durationMin: schedule.durationMin,
      });
    }
  }

  // Batch create
  let created = 0;
  if (instancesToCreate.length > 0) {
    const result = await prisma.sessionInstance.createMany({
      data: instancesToCreate,
    });
    created = result.count;
  }

  // Detect conflicts among all instances for this month (including newly created)
  const allInstances = await prisma.sessionInstance.findMany({
    where: {
      branchId: input.branchId,
      scheduledDate: { gte: monthStart, lte: monthEnd },
      status: { not: 'CANCELLED' },
    },
    include: {
      client: { include: { user: { select: { firstName: true, lastName: true } } } },
      trainer: { include: { user: { select: { firstName: true, lastName: true } } } },
    },
    orderBy: [{ trainerProfileId: 'asc' }, { scheduledDate: 'asc' }, { scheduledTime: 'asc' }],
  });

  const conflicts: Conflict[] = [];

  // Group by trainer + date, then check for overlaps
  const byTrainerDate = new Map<string, typeof allInstances>();
  for (const inst of allInstances) {
    const key = `${inst.trainerProfileId}|${inst.scheduledDate.toISOString().split('T')[0]}`;
    const group = byTrainerDate.get(key) ?? [];
    group.push(inst);
    byTrainerDate.set(key, group);
  }

  for (const [, group] of byTrainerDate) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i]!;
        const b = group[j]!;
        const overlap = timeSlotsOverlap(
          a.scheduledTime,
          a.durationMin,
          b.scheduledTime,
          b.durationMin,
        );
        if (overlap > 0) {
          conflicts.push({
            sessionA: {
              id: a.id,
              scheduledDate: a.scheduledDate.toISOString().split('T')[0]!,
              scheduledTime: a.scheduledTime,
              clientName: `${a.client.user.firstName} ${a.client.user.lastName}`,
            },
            sessionB: {
              id: b.id,
              scheduledDate: b.scheduledDate.toISOString().split('T')[0]!,
              scheduledTime: b.scheduledTime,
              clientName: `${b.client.user.firstName} ${b.client.user.lastName}`,
            },
            trainerName: `${a.trainer.user.firstName} ${a.trainer.user.lastName}`,
            overlapMinutes: overlap,
          });
        }
      }
    }
  }

  await auditLog({
    action: 'SESSIONS_GENERATED',
    actorId: input.actorId,
    subjectType: 'SessionInstance',
    subjectId: `${input.month}`,
    branchId: input.branchId,
    newValue: {
      month: input.month,
      created,
      conflictsFound: conflicts.length,
      scheduleIds: input.scheduleIds ?? 'all',
    },
  });

  return { created, conflicts };
}

/**
 * Detect scheduling conflicts for a given date (or date range).
 */
export async function detectConflicts(branchId: string, date: string, trainerId?: string) {
  const targetDate = new Date(date);
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);

  const where: Record<string, unknown> = {
    branchId,
    scheduledDate: { gte: targetDate, lte: dayEnd },
    status: { not: 'CANCELLED' },
  };
  if (trainerId) where.trainerProfileId = trainerId;

  const instances = await prisma.sessionInstance.findMany({
    where,
    include: {
      client: { include: { user: { select: { firstName: true, lastName: true } } } },
      trainer: { include: { user: { select: { firstName: true, lastName: true } } } },
    },
    orderBy: [{ trainerProfileId: 'asc' }, { scheduledTime: 'asc' }],
  });

  const conflicts: Conflict[] = [];

  // Group by trainer
  const byTrainer = new Map<string, typeof instances>();
  for (const inst of instances) {
    const group = byTrainer.get(inst.trainerProfileId) ?? [];
    group.push(inst);
    byTrainer.set(inst.trainerProfileId, group);
  }

  for (const [, group] of byTrainer) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i]!;
        const b = group[j]!;
        const overlap = timeSlotsOverlap(
          a.scheduledTime,
          a.durationMin,
          b.scheduledTime,
          b.durationMin,
        );
        if (overlap > 0) {
          conflicts.push({
            sessionA: {
              id: a.id,
              scheduledDate: a.scheduledDate.toISOString().split('T')[0]!,
              scheduledTime: a.scheduledTime,
              clientName: `${a.client.user.firstName} ${a.client.user.lastName}`,
            },
            sessionB: {
              id: b.id,
              scheduledDate: b.scheduledDate.toISOString().split('T')[0]!,
              scheduledTime: b.scheduledTime,
              clientName: `${b.client.user.firstName} ${b.client.user.lastName}`,
            },
            trainerName: `${a.trainer.user.firstName} ${a.trainer.user.lastName}`,
            overlapMinutes: overlap,
          });
        }
      }
    }
  }

  return { data: conflicts };
}
