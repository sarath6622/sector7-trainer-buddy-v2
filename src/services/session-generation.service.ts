import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';
import { sendNotification } from '@/lib/notifications';
import type { DayOfWeek } from '@prisma/client';

interface GenerateSessionsInput {
  branchId: string;
  month: string; // "YYYY-MM"
  scheduleIds?: string[];
  actorId: string;
  dryRun?: boolean;
  trainerProfileId?: string; // when set, scope generation to this trainer's schedules only
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
 * Returns the number of overlapping minutes (0 = no overlap).
 */
export function timeSlotsOverlap(
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
  if (input.trainerProfileId) {
    whereSchedule.trainerProfileId = input.trainerProfileId;
  }

  const schedules = await prisma.sessionSchedule.findMany({
    where: whereSchedule,
    include: {
      client: { include: { user: { select: { id: true, firstName: true, lastName: true } } } },
      trainer: { include: { user: { select: { id: true, firstName: true, lastName: true } } } },
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

  // Fetch all non-cancelled instances for client-level overlap detection
  const existingActiveInstances = await prisma.sessionInstance.findMany({
    where: {
      branchId: input.branchId,
      scheduledDate: { gte: monthStart, lte: monthEnd },
      status: { not: 'CANCELLED' },
    },
    select: {
      clientProfileId: true,
      trainerProfileId: true,
      scheduledDate: true,
      scheduledTime: true,
      durationMin: true,
    },
  });

  // Group existing instances by client+date and trainer+date for overlap checks
  const existingByClientDate = new Map<string, typeof existingActiveInstances>();
  const existingByTrainerDate = new Map<string, typeof existingActiveInstances>();
  for (const inst of existingActiveInstances) {
    const dateStr = inst.scheduledDate.toISOString().split('T')[0];
    const clientKey = `${inst.clientProfileId}|${dateStr}`;
    const trainerKey = `${inst.trainerProfileId}|${dateStr}`;

    if (!existingByClientDate.has(clientKey)) existingByClientDate.set(clientKey, []);
    existingByClientDate.get(clientKey)!.push(inst);

    if (!existingByTrainerDate.has(trainerKey)) existingByTrainerDate.set(trainerKey, []);
    existingByTrainerDate.get(trainerKey)!.push(inst);
  }

  // Fetch all trainer availability overrides for this month
  const allOverrides = await prisma.trainerAvailabilityOverride.findMany({
    where: {
      branchId: input.branchId,
      date: { gte: monthStart, lte: monthEnd },
    },
  });

  // Build a map: trainerProfileId|YYYY-MM-DD → override
  const overrideMap = new Map<string, (typeof allOverrides)[number]>();
  for (const o of allOverrides) {
    const key = `${o.trainerProfileId}|${o.date.toISOString().split('T')[0]}`;
    overrideMap.set(key, o);
  }

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

  const skippedDueToOverride: { scheduleId: string; date: string; reason: string }[] = [];
  const skippedDueToConflict: { scheduleId: string; date: string; reason: string }[] = [];

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

      // Check if trainer has an availability override making them unavailable
      const dateStr = date.toISOString().split('T')[0];
      const overrideKey = `${schedule.trainerProfileId}|${dateStr}`;
      const override = overrideMap.get(overrideKey);

      if (override && !override.isAvailable) {
        skippedDueToOverride.push({
          scheduleId: schedule.id,
          date: dateStr!,
          reason: override.reason ?? 'Trainer marked unavailable',
        });
        continue;
      }

      // Check for client double-booking (existing DB instances + already-queued instances in this batch)
      const clientDateKey = `${schedule.clientProfileId}|${dateStr}`;
      const clientExisting = existingByClientDate.get(clientDateKey) ?? [];
      let clientConflict = false;
      for (const ex of clientExisting) {
        if (
          timeSlotsOverlap(
            schedule.startTime,
            schedule.durationMin,
            ex.scheduledTime,
            ex.durationMin,
          ) > 0
        ) {
          clientConflict = true;
          break;
        }
      }

      // Check for trainer double-booking against existing instances
      const trainerDateKey = `${schedule.trainerProfileId}|${dateStr}`;
      const trainerExisting = existingByTrainerDate.get(trainerDateKey) ?? [];
      let trainerConflict = false;
      for (const ex of trainerExisting) {
        if (
          timeSlotsOverlap(
            schedule.startTime,
            schedule.durationMin,
            ex.scheduledTime,
            ex.durationMin,
          ) > 0
        ) {
          trainerConflict = true;
          break;
        }
      }

      if (clientConflict || trainerConflict) {
        const who = clientConflict ? 'client' : 'trainer';
        skippedDueToConflict.push({
          scheduleId: schedule.id,
          date: dateStr!,
          reason: `Skipped: ${who} already has an overlapping session at this time`,
        });
        continue;
      }

      const newInstance = {
        branchId: input.branchId,
        scheduleId: schedule.id,
        clientProfileId: schedule.clientProfileId,
        trainerProfileId: schedule.trainerProfileId,
        scheduledDate: date,
        scheduledTime: schedule.startTime,
        durationMin: schedule.durationMin,
      };
      instancesToCreate.push(newInstance);

      // Track this new instance for intra-batch conflict detection
      if (!existingByClientDate.has(clientDateKey)) existingByClientDate.set(clientDateKey, []);
      existingByClientDate.get(clientDateKey)!.push(newInstance);
      if (!existingByTrainerDate.has(trainerDateKey)) existingByTrainerDate.set(trainerDateKey, []);
      existingByTrainerDate.get(trainerDateKey)!.push(newInstance);
    }
  }

  // Dry-run: return preview without creating anything
  if (input.dryRun) {
    // Build a summary grouped by trainer → client (with schedule metadata)
    const previewByTrainer = new Map<
      string,
      {
        scheduleId: string;
        clientName: string;
        dayOfWeek: string;
        startTime: string;
        durationMin: number;
        dates: string[];
      }[]
    >();
    for (const inst of instancesToCreate) {
      const schedule = schedules.find((s) => s.id === inst.scheduleId)!;
      const trainerName = `${schedule.trainer.user.firstName} ${schedule.trainer.user.lastName}`;
      const clientName = `${schedule.client.user.firstName} ${schedule.client.user.lastName}`;
      const dateStr = inst.scheduledDate.toISOString().split('T')[0]!;

      if (!previewByTrainer.has(trainerName)) previewByTrainer.set(trainerName, []);
      const trainerGroup = previewByTrainer.get(trainerName)!;
      let clientEntry = trainerGroup.find((e) => e.scheduleId === inst.scheduleId);
      if (!clientEntry) {
        clientEntry = {
          scheduleId: inst.scheduleId,
          clientName,
          dayOfWeek: schedule.dayOfWeek,
          startTime: schedule.startTime,
          durationMin: schedule.durationMin,
          dates: [],
        };
        trainerGroup.push(clientEntry);
      }
      clientEntry.dates.push(dateStr);
    }

    // Collect unique dates across all instances
    const allDates = new Set(
      instancesToCreate.map((i) => i.scheduledDate.toISOString().split('T')[0]!),
    );

    const preview = Array.from(previewByTrainer.entries()).map(([trainerName, clients]) => ({
      trainerName,
      clients,
    }));

    return {
      dryRun: true,
      willCreate: instancesToCreate.length,
      daysAffected: allDates.size,
      skippedDueToOverride,
      skippedDueToConflict,
      preview,
      // Not applicable in dry run
      created: 0,
      conflicts: [],
    };
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
      skippedDueToOverride: skippedDueToOverride.length,
      skippedDueToConflict: skippedDueToConflict.length,
      scheduleIds: input.scheduleIds ?? 'all',
    },
  });

  // Send summary notifications (one per unique client-trainer pair)
  if (created > 0) {
    const monthName = (() => {
      const d = new Date(`${input.month}-01`);
      return d.toLocaleString('en-IN', { month: 'long' });
    })();

    // Count sessions per client-trainer pair from the instancesToCreate list
    const pairCounts = new Map<
      string,
      {
        clientUserId: string;
        trainerUserId: string;
        clientName: string;
        trainerName: string;
        count: number;
      }
    >();
    for (const inst of instancesToCreate) {
      const schedule = schedules.find((s) => s.id === inst.scheduleId)!;
      const key = `${inst.clientProfileId}|${inst.trainerProfileId}`;
      if (!pairCounts.has(key)) {
        pairCounts.set(key, {
          clientUserId: schedule.client.user.id,
          trainerUserId: schedule.trainer.user.id,
          clientName: `${schedule.client.user.firstName} ${schedule.client.user.lastName}`,
          trainerName: `${schedule.trainer.user.firstName} ${schedule.trainer.user.lastName}`,
          count: 0,
        });
      }
      pairCounts.get(key)!.count++;
    }

    await Promise.all(
      Array.from(pairCounts.values()).flatMap(
        ({ clientUserId, trainerUserId, clientName, trainerName, count }) => [
          sendNotification({
            branchId: input.branchId,
            recipientId: clientUserId,
            title: `Sessions scheduled — ${monthName}`,
            body: `${count} session${count !== 1 ? 's' : ''} with ${trainerName}`,
            channel: 'BOTH',
          }),
          sendNotification({
            branchId: input.branchId,
            recipientId: trainerUserId,
            title: `Sessions scheduled — ${monthName}`,
            body: `${count} session${count !== 1 ? 's' : ''} with ${clientName}`,
            channel: 'BOTH',
          }),
        ],
      ),
    );
  }

  return { created, conflicts, skippedDueToOverride, skippedDueToConflict };
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
