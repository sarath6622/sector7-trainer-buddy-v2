import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';
import { AppError } from '@/lib/errors';
import {
  notifyLeaveApproved,
  notifyLeaveRejected,
  notifyAdminsLeaveRequested,
  notifyClientsTrainerOnLeave,
} from '@/services/notification.service';
import type { LeaveStatus, LeaveType } from '@prisma/client';

// ─── Input Interfaces ───────────────────────────────

interface ApplyLeaveInput {
  trainerProfileId: string;
  startDate: string;
  endDate: string;
  leaveType: LeaveType;
  startTime?: string; // HH:MM — for partial leaves
  endTime?: string; // HH:MM — for partial leaves
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

function timeToMin(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h! * 60 + m!;
}

/**
 * Find sessions affected by a trainer leave within the date range.
 * For partial leaves (startTime/endTime provided), only sessions that overlap
 * the time window are returned.
 */
async function getAffectedSessions(
  trainerProfileId: string,
  branchId: string,
  startDate: Date,
  endDate: Date,
  startTime?: string | null,
  endTime?: string | null,
) {
  // Expand window by 1 day on each side to capture timezone-shifted dates
  const windowStart = new Date(startDate);
  windowStart.setDate(windowStart.getDate() - 1);
  const windowEnd = new Date(endDate);
  windowEnd.setDate(windowEnd.getDate() + 1);
  windowEnd.setHours(23, 59, 59, 999);

  const sessions = await prisma.sessionInstance.findMany({
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

  // For partial leave, filter sessions whose time window overlaps the leave time window
  if (startTime && endTime) {
    const leaveStart = timeToMin(startTime);
    const leaveEnd = timeToMin(endTime);
    return sessions.filter((s) => {
      const sessStart = timeToMin(s.scheduledTime);
      const sessEnd = sessStart + s.durationMin;
      return Math.min(sessEnd, leaveEnd) - Math.max(sessStart, leaveStart) > 0;
    });
  }

  return sessions;
}

// ─── Service Functions ──────────────────────────────

/**
 * Apply for leave — creates a PENDING leave request and identifies affected clients.
 */
export async function applyLeave({
  trainerProfileId,
  startDate,
  endDate,
  leaveType,
  startTime,
  endTime,
  reason,
  actorId,
  branchId,
}: ApplyLeaveInput) {
  const start = new Date(startDate);
  const end = new Date(endDate);

  if (end < start) {
    throw new AppError('INVALID_DATES', 'End date must be on or after start date', 400);
  }

  // Check for overlapping approved/pending leaves on the same dates
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

  // Find affected sessions (time-filtered for partial leaves)
  const affectedSessions = await getAffectedSessions(
    trainerProfileId,
    branchId,
    start,
    end,
    startTime,
    endTime,
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

  const leave = await prisma.leaveRequest.create({
    data: {
      branchId,
      trainerProfileId,
      startDate: start,
      endDate: end,
      leaveType,
      startTime: leaveType !== 'FULL_DAY' ? (startTime ?? null) : null,
      endTime: leaveType !== 'FULL_DAY' ? (endTime ?? null) : null,
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
      leaveType,
      startTime: startTime ?? null,
      endTime: endTime ?? null,
      reason: reason ?? null,
      affectedSessionCount: affectedSessions.length,
      affectedClientCount: affectedClients.length,
    },
    metadata: { trainerProfileId },
  });

  // Notify branch admins (fire-and-forget)
  const trainerName = `${leave.trainer.user.firstName} ${leave.trainer.user.lastName}`;
  const adminUsers = await prisma.user.findMany({
    where: { branchId, role: { in: ['SUPER_ADMIN', 'BRANCH_ADMIN'] }, isActive: true },
    select: { id: true },
  });
  notifyAdminsLeaveRequested({
    branchId,
    adminUserIds: adminUsers.map((u) => u.id),
    trainerName,
    startDate,
    endDate,
    leaveId: leave.id,
    leaveType,
  });

  return {
    ...leave,
    affectedSessions: affectedSessions.map((s) => ({
      id: s.id,
      scheduledDate: s.scheduledDate,
      scheduledTime: s.scheduledTime,
      durationMin: s.durationMin,
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

    // Also notify all affected clients
    const clientUserIds = [...new Set(affectedSessions.map((s) => s.client.user.id))];
    if (clientUserIds.length > 0) {
      notifyClientsTrainerOnLeave({
        branchId,
        clientUserIds,
        trainerName: `${updated.trainer.user.firstName} ${updated.trainer.user.lastName}`,
        startDate,
        endDate,
      });
    }
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
      durationMin: s.durationMin,
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
      durationMin: s.durationMin,
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
