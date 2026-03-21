import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';
import { AppError } from '@/lib/errors';
import { notifyReassignment } from '@/services/notification.service';

// ─── Input Interfaces ───────────────────────────────

interface ReassignInput {
  sessionInstanceId: string;
  replacementTrainerProfileId: string;
  reason?: string;
  actorId: string;
  branchId: string;
}

interface BulkReassignInput {
  sessionInstanceIds: string[];
  replacementTrainerProfileId: string;
  reason?: string;
  actorId: string;
  branchId: string;
}

interface VacantTrainersInput {
  date: string;
  startTime: string;
  endTime: string;
  branchId: string;
}

interface ListReassignmentsInput {
  branchId: string;
  date?: string;
  trainerId?: string;
}

// ─── Service Functions ──────────────────────────────

/**
 * Find trainers who are available for a given date/time slot.
 * Excludes trainers who are: booked in an overlapping session, or on approved leave.
 */
export async function getVacantTrainers({
  date,
  startTime,
  endTime,
  branchId,
}: VacantTrainersInput) {
  const targetDate = new Date(date);

  // Get all active trainers in the branch
  const allTrainers = await prisma.trainerProfile.findMany({
    where: {
      branchId,
      user: { isActive: true, deletedAt: null },
    },
    include: {
      user: { select: { firstName: true, lastName: true, email: true } },
    },
  });

  // Get trainers who have sessions overlapping the requested slot
  const busyTrainerIds = await getBusyTrainerIds(branchId, targetDate, startTime, endTime);

  // Get trainers on approved leave that day
  const onLeaveTrainerIds = await getOnLeaveTrainerIds(branchId, targetDate);

  // Filter to vacant trainers
  const excludeIds = new Set([...busyTrainerIds, ...onLeaveTrainerIds]);

  return allTrainers.filter((t) => {
    if (excludeIds.has(t.id)) return false;

    // Check working hours if defined
    if (t.workingHoursStart && t.workingHoursEnd) {
      if (startTime < t.workingHoursStart || endTime > t.workingHoursEnd) {
        return false;
      }
    }

    // Check working days if defined
    if (t.workingDays && t.workingDays.length > 0) {
      const dayNames = [
        'SUNDAY',
        'MONDAY',
        'TUESDAY',
        'WEDNESDAY',
        'THURSDAY',
        'FRIDAY',
        'SATURDAY',
      ];
      const dayOfWeek = dayNames[targetDate.getDay()];
      if (!t.workingDays.includes(dayOfWeek as never)) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Reassign a single session to a replacement trainer.
 */
export async function reassignSession({
  sessionInstanceId,
  replacementTrainerProfileId,
  reason,
  actorId,
  branchId,
}: ReassignInput) {
  const session = await prisma.sessionInstance.findFirst({
    where: { id: sessionInstanceId, branchId, status: 'SCHEDULED' },
    include: {
      trainerReassignment: true,
      client: { include: { user: { select: { id: true, firstName: true, lastName: true } } } },
      trainer: { include: { user: { select: { id: true, firstName: true, lastName: true } } } },
    },
  });

  if (!session) {
    throw new AppError('SESSION_NOT_FOUND', 'Session not found or not in SCHEDULED status', 404);
  }

  if (session.trainerReassignment) {
    throw new AppError('ALREADY_REASSIGNED', 'This session has already been reassigned', 409);
  }

  // Verify replacement trainer exists in this branch
  const replacementTrainer = await prisma.trainerProfile.findFirst({
    where: { id: replacementTrainerProfileId, branchId, user: { isActive: true } },
    include: { user: { select: { id: true, firstName: true, lastName: true } } },
  });

  if (!replacementTrainer) {
    throw new AppError('TRAINER_NOT_FOUND', 'Replacement trainer not found', 404);
  }

  if (replacementTrainerProfileId === session.trainerProfileId) {
    throw new AppError('SAME_TRAINER', 'Cannot reassign to the same trainer', 400);
  }

  // Create reassignment record and update session trainer in a transaction
  const [reassignment] = await prisma.$transaction([
    prisma.trainerReassignment.create({
      data: {
        branchId,
        sessionInstanceId,
        originalTrainerProfileId: session.trainerProfileId,
        replacementTrainerProfileId,
        reassignedByUserId: actorId,
        reason: reason ?? null,
      },
      include: {
        sessionInstance: {
          include: {
            client: { include: { user: { select: { firstName: true, lastName: true } } } },
          },
        },
        originalTrainer: { include: { user: { select: { firstName: true, lastName: true } } } },
        replacementTrainer: { include: { user: { select: { firstName: true, lastName: true } } } },
      },
    }),
    prisma.sessionInstance.update({
      where: { id: sessionInstanceId },
      data: { trainerProfileId: replacementTrainerProfileId },
    }),
  ]);

  await auditLog({
    action: 'SESSION_REASSIGNED',
    actorId,
    subjectType: 'SessionInstance',
    subjectId: sessionInstanceId,
    branchId,
    oldValue: {
      trainerProfileId: session.trainerProfileId,
      trainerName: `${session.trainer.user.firstName} ${session.trainer.user.lastName}`,
    },
    newValue: {
      trainerProfileId: replacementTrainerProfileId,
      trainerName: `${replacementTrainer.user.firstName} ${replacementTrainer.user.lastName}`,
    },
    metadata: {
      reassignmentId: reassignment.id,
      reason: reason ?? null,
      clientName: `${session.client.user.firstName} ${session.client.user.lastName}`,
      scheduledDate: session.scheduledDate.toISOString(),
      scheduledTime: session.scheduledTime,
    },
  });

  // Notify client (fire-and-forget)
  notifyReassignment({
    branchId,
    clientUserId: session.client.user.id,
    originalTrainerName: `${session.trainer.user.firstName} ${session.trainer.user.lastName}`,
    newTrainerName: `${replacementTrainer.user.firstName} ${replacementTrainer.user.lastName}`,
    date: session.scheduledDate.toISOString().slice(0, 10),
    time: session.scheduledTime,
  });

  return reassignment;
}

/**
 * Bulk reassign multiple sessions to a replacement trainer.
 */
export async function bulkReassign({
  sessionInstanceIds,
  replacementTrainerProfileId,
  reason,
  actorId,
  branchId,
}: BulkReassignInput) {
  const results = [];
  for (const sessionInstanceId of sessionInstanceIds) {
    const result = await reassignSession({
      sessionInstanceId,
      replacementTrainerProfileId,
      reason,
      actorId,
      branchId,
    });
    results.push(result);
  }
  return results;
}

/**
 * List reassignments with optional filters.
 */
export async function listReassignments({ branchId, date, trainerId }: ListReassignmentsInput) {
  const where: Record<string, unknown> = { branchId };

  if (trainerId) {
    where.OR = [
      { originalTrainerProfileId: trainerId },
      { replacementTrainerProfileId: trainerId },
    ];
  }

  if (date) {
    const d = new Date(date);
    where.sessionInstance = {
      scheduledDate: {
        gte: new Date(d.getFullYear(), d.getMonth(), d.getDate()),
        lte: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59),
      },
    };
  }

  return prisma.trainerReassignment.findMany({
    where,
    include: {
      sessionInstance: {
        include: {
          client: { include: { user: { select: { firstName: true, lastName: true } } } },
        },
      },
      originalTrainer: { include: { user: { select: { firstName: true, lastName: true } } } },
      replacementTrainer: { include: { user: { select: { firstName: true, lastName: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

// ─── Helpers ────────────────────────────────────────

async function getBusyTrainerIds(
  branchId: string,
  date: Date,
  startTime: string,
  endTime: string,
): Promise<string[]> {
  // Find sessions on this date that overlap the time window
  const sessions = await prisma.sessionInstance.findMany({
    where: {
      branchId,
      scheduledDate: {
        gte: new Date(date.getFullYear(), date.getMonth(), date.getDate()),
        lte: new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59),
      },
      status: { in: ['SCHEDULED', 'IN_PROGRESS'] },
    },
    select: { trainerProfileId: true, scheduledTime: true, durationMin: true },
  });

  return sessions
    .filter((s) => {
      // Check time overlap: session occupies [scheduledTime, scheduledTime + durationMin]
      const sessionStart = s.scheduledTime;
      const sessionEndMinutes =
        parseInt(sessionStart.split(':')[0]!, 10) * 60 +
        parseInt(sessionStart.split(':')[1]!, 10) +
        s.durationMin;
      const sessionEnd = `${String(Math.floor(sessionEndMinutes / 60)).padStart(2, '0')}:${String(sessionEndMinutes % 60).padStart(2, '0')}`;

      // Overlap if: sessionStart < endTime AND sessionEnd > startTime
      return sessionStart < endTime && sessionEnd > startTime;
    })
    .map((s) => s.trainerProfileId);
}

async function getOnLeaveTrainerIds(branchId: string, date: Date): Promise<string[]> {
  const leaves = await prisma.leaveRequest.findMany({
    where: {
      branchId,
      status: 'APPROVED',
      startDate: { lte: date },
      endDate: { gte: date },
    },
    select: { trainerProfileId: true },
  });

  return leaves.map((l) => l.trainerProfileId);
}
