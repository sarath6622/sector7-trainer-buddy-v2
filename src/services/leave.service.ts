import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';
import { AppError } from '@/lib/errors';
import { notifyLeaveApproved, notifyLeaveRejected } from '@/services/notification.service';
import type { LeaveStatus } from '@prisma/client';

// ─── Input Interfaces ───────────────────────────────

interface ApplyLeaveInput {
  trainerProfileId: string;
  startDate: string;
  endDate: string;
  reason?: string;
  actorId: string;
  branchId: string;
}

interface ReviewLeaveInput {
  leaveId: string;
  status: 'APPROVED' | 'REJECTED';
  notes?: string;
  actorId: string;
  branchId: string;
}

interface ListLeavesInput {
  branchId: string;
  status?: LeaveStatus;
  trainerId?: string;
  page?: number;
  pageSize?: number;
}

interface GetLeaveInput {
  leaveId: string;
  branchId: string;
}

interface GetTrainerLeavesInput {
  trainerProfileId: string;
  branchId: string;
}

// ─── Helpers ────────────────────────────────────────

/**
 * Find sessions affected by a trainer leave within the date range.
 * Returns sessions that are SCHEDULED (not yet completed/cancelled).
 * Uses a wide UTC window to handle timezone offsets (e.g. IST stored as previous-day UTC).
 */
async function getAffectedSessions(
  trainerProfileId: string,
  branchId: string,
  startDate: Date,
  endDate: Date,
) {
  // Expand window by 1 day on each side to capture timezone-shifted dates
  const windowStart = new Date(startDate);
  windowStart.setDate(windowStart.getDate() - 1);
  const windowEnd = new Date(endDate);
  windowEnd.setDate(windowEnd.getDate() + 1);
  windowEnd.setHours(23, 59, 59, 999);

  return prisma.sessionInstance.findMany({
    where: {
      branchId,
      trainerProfileId,
      scheduledDate: { gte: windowStart, lte: windowEnd },
      status: { in: ['SCHEDULED'] },
    },
    include: {
      client: {
        include: { user: { select: { id: true, firstName: true, lastName: true } } },
      },
    },
    orderBy: { scheduledDate: 'asc' },
  });
}

// ─── Service Functions ──────────────────────────────

/**
 * Apply for leave — creates a PENDING leave request and identifies affected clients.
 */
export async function applyLeave({
  trainerProfileId,
  startDate,
  endDate,
  reason,
  actorId,
  branchId,
}: ApplyLeaveInput) {
  const start = new Date(startDate);
  const end = new Date(endDate);

  if (end < start) {
    throw new AppError('INVALID_DATES', 'End date must be on or after start date', 400);
  }

  // Check for overlapping approved/pending leaves
  const overlapping = await prisma.leaveRequest.findFirst({
    where: {
      branchId,
      trainerProfileId,
      status: { in: ['PENDING', 'APPROVED'] },
      startDate: { lte: end },
      endDate: { gte: start },
    },
  });

  if (overlapping) {
    throw new AppError(
      'LEAVE_OVERLAP',
      'You already have a leave request overlapping these dates',
      409,
    );
  }

  // Find affected sessions
  const affectedSessions = await getAffectedSessions(trainerProfileId, branchId, start, end);
  const affectedClients = [
    ...new Map(
      affectedSessions.map((s) => [
        s.client.id,
        {
          clientProfileId: s.client.id,
          firstName: s.client.user.firstName,
          lastName: s.client.user.lastName,
        },
      ]),
    ).values(),
  ];

  const leave = await prisma.leaveRequest.create({
    data: {
      branchId,
      trainerProfileId,
      startDate: start,
      endDate: end,
      reason: reason ?? null,
    },
    include: {
      trainer: {
        include: { user: { select: { firstName: true, lastName: true } } },
      },
    },
  });

  await auditLog({
    action: 'LEAVE_APPLIED',
    actorId,
    subjectType: 'LeaveRequest',
    subjectId: leave.id,
    branchId,
    newValue: {
      startDate,
      endDate,
      reason: reason ?? null,
      affectedSessionCount: affectedSessions.length,
      affectedClientCount: affectedClients.length,
    },
    metadata: { trainerProfileId },
  });

  return {
    ...leave,
    affectedSessions: affectedSessions.map((s) => ({
      id: s.id,
      scheduledDate: s.scheduledDate,
      scheduledTime: s.scheduledTime,
      clientName: `${s.client.user.firstName} ${s.client.user.lastName}`,
    })),
    affectedClients,
  };
}

/**
 * Approve or reject a leave request.
 */
export async function reviewLeave({ leaveId, status, notes, actorId, branchId }: ReviewLeaveInput) {
  const leave = await prisma.leaveRequest.findFirst({
    where: { id: leaveId, branchId },
  });

  if (!leave) {
    throw new AppError('LEAVE_NOT_FOUND', 'Leave request not found', 404);
  }

  if (leave.status !== 'PENDING') {
    const action = status === 'APPROVED' ? 'approve' : 'reject';
    throw new AppError(
      'INVALID_STATUS',
      `Cannot ${action} a leave that is already ${leave.status}`,
      400,
    );
  }

  const updated = await prisma.leaveRequest.update({
    where: { id: leaveId },
    data: {
      status,
      reviewedByUserId: actorId,
      reviewedAt: new Date(),
      reviewNotes: notes ?? null,
    },
    include: {
      trainer: {
        include: { user: { select: { id: true, firstName: true, lastName: true } } },
      },
    },
  });

  // Get affected sessions/clients for audit metadata
  const affectedSessions = await getAffectedSessions(
    leave.trainerProfileId,
    branchId,
    leave.startDate,
    leave.endDate,
  );

  await auditLog({
    action: status === 'APPROVED' ? 'LEAVE_APPROVED' : 'LEAVE_REJECTED',
    actorId,
    subjectType: 'LeaveRequest',
    subjectId: leaveId,
    branchId,
    oldValue: { status: 'PENDING' },
    newValue: { status, reviewNotes: notes ?? null },
    metadata: {
      trainerProfileId: leave.trainerProfileId,
      affectedSessionCount: affectedSessions.length,
    },
  });

  // Notify trainer (fire-and-forget)
  const startDate = leave.startDate.toISOString().slice(0, 10);
  const endDate = leave.endDate.toISOString().slice(0, 10);
  if (status === 'APPROVED') {
    notifyLeaveApproved({
      branchId,
      trainerUserId: updated.trainer.user.id,
      startDate,
      endDate,
    });
  } else {
    notifyLeaveRejected({
      branchId,
      trainerUserId: updated.trainer.user.id,
      startDate,
      endDate,
      notes,
    });
  }

  return {
    ...updated,
    affectedSessions: affectedSessions.map((s) => ({
      id: s.id,
      scheduledDate: s.scheduledDate,
      scheduledTime: s.scheduledTime,
      clientName: `${s.client.user.firstName} ${s.client.user.lastName}`,
    })),
  };
}

/**
 * Get a single leave request with affected sessions.
 */
export async function getLeaveById({ leaveId, branchId }: GetLeaveInput) {
  const leave = await prisma.leaveRequest.findFirst({
    where: { id: leaveId, branchId },
    include: {
      trainer: {
        include: { user: { select: { firstName: true, lastName: true } } },
      },
    },
  });

  if (!leave) {
    throw new AppError('LEAVE_NOT_FOUND', 'Leave request not found', 404);
  }

  const affectedSessions = await getAffectedSessions(
    leave.trainerProfileId,
    branchId,
    leave.startDate,
    leave.endDate,
  );

  const affectedClients = [
    ...new Map(
      affectedSessions.map((s) => [
        s.client.id,
        {
          clientProfileId: s.client.id,
          firstName: s.client.user.firstName,
          lastName: s.client.user.lastName,
        },
      ]),
    ).values(),
  ];

  return {
    ...leave,
    affectedSessions: affectedSessions.map((s) => ({
      id: s.id,
      scheduledDate: s.scheduledDate,
      scheduledTime: s.scheduledTime,
      clientName: `${s.client.user.firstName} ${s.client.user.lastName}`,
    })),
    affectedClients,
  };
}

/**
 * List leave requests (admin view) with pagination and filters.
 */
export async function listLeaves({
  branchId,
  status,
  trainerId,
  page = 1,
  pageSize = 20,
}: ListLeavesInput) {
  const where: Record<string, unknown> = { branchId };
  if (status) where.status = status;
  if (trainerId) where.trainerProfileId = trainerId;

  const [leaves, total] = await Promise.all([
    prisma.leaveRequest.findMany({
      where,
      include: {
        trainer: {
          include: { user: { select: { firstName: true, lastName: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.leaveRequest.count({ where }),
  ]);

  return {
    data: leaves,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

/**
 * Get a trainer's own leave requests.
 */
export async function getTrainerLeaves({ trainerProfileId, branchId }: GetTrainerLeavesInput) {
  return prisma.leaveRequest.findMany({
    where: { branchId, trainerProfileId },
    orderBy: { createdAt: 'desc' },
  });
}
