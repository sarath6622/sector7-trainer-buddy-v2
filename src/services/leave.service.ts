import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';
import { AppError } from '@/lib/errors';
import {
  notifyLeaveApproved,
  notifyLeaveRejected,
  notifyAdminsLeaveRequested,
  notifyClientsTrainerOnLeave,
} from '@/services/notification.service';
import type { LeaveStatus, LeaveType, LeaveCategory } from '@prisma/client';

// ─── Input Interfaces ───────────────────────────────

interface ApplyLeaveInput {
  trainerProfileId: string;
  startDate: string;
  endDate: string;
  leaveType: LeaveType;
  leaveCategory: LeaveCategory;
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
  leaveCategory?: 'REGULAR' | 'EMERGENCY';
  actorId: string;
  branchId: string;
}

interface ListLeavesInput {
  branchId: string;
  status?: LeaveStatus;
  trainerId?: string;
  leaveCategory?: 'REGULAR' | 'EMERGENCY';
  month?: string; // YYYY-MM — filter by startDate month
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

interface GetLeaveBalanceInput {
  trainerProfileId: string;
  branchId: string;
  month: string; // YYYY-MM
}

export interface LeaveBalance {
  month: string;
  regular: { quota: number; used: number; remaining: number };
  emergency: { quota: number; used: number; remaining: number };
}

// ─── Helpers ────────────────────────────────────────

function timeToMin(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h! * 60 + m!;
}

/**
 * How many leave-days a given leave request consumes within a specific month.
 * Each calendar day = 1.0. Half-day (AM/PM) = 0.5. CUSTOM < 4h = 0.5, else 1.0.
 */
function leaveDaysForMonth(
  startDate: Date,
  endDate: Date,
  leaveType: LeaveType,
  startTime: string | null,
  endTime: string | null,
  month: string, // YYYY-MM
): number {
  const [year, mon] = month.split('-').map(Number);
  const monthStart = new Date(year!, mon! - 1, 1);
  const monthEnd = new Date(year!, mon!, 0); // last day of month

  // Clamp leave range to the target month
  const from = startDate < monthStart ? monthStart : startDate;
  const to = endDate > monthEnd ? monthEnd : endDate;

  if (from > to) return 0;

  const calendarDays = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;

  // Partial-day factor
  let dayFactor = 1.0;
  if (leaveType === 'HALF_DAY_AM' || leaveType === 'HALF_DAY_PM') {
    dayFactor = 0.5;
  } else if (leaveType === 'CUSTOM' && startTime && endTime) {
    const durationMin = timeToMin(endTime) - timeToMin(startTime);
    dayFactor = durationMin < 240 ? 0.5 : 1.0; // < 4h = half day
  }

  return calendarDays * dayFactor;
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
  const windowStart = new Date(startDate);
  const windowEnd = new Date(endDate);
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

/**
 * Get the branch leave quotas (falls back to defaults if no settings row exists).
 */
async function getBranchQuotas(
  branchId: string,
): Promise<{ regularQuota: number; emergencyQuota: number }> {
  const settings = await prisma.branchSettings.findUnique({ where: { branchId } });
  return {
    regularQuota: settings?.monthlyRegularLeaveQuota ?? 4,
    emergencyQuota: settings?.monthlyEmergencyLeaveQuota ?? 1,
  };
}

// ─── Service Functions ──────────────────────────────

/**
 * Get leave balance for a trainer for a given month.
 * Counts days from PENDING and APPROVED leaves (rejected don't consume quota).
 */
export async function getLeaveBalance({
  trainerProfileId,
  branchId,
  month,
}: GetLeaveBalanceInput): Promise<LeaveBalance> {
  const [year, mon] = month.split('-').map(Number);
  const monthStart = new Date(year!, mon! - 1, 1);
  const monthEnd = new Date(year!, mon!, 0);
  monthEnd.setHours(23, 59, 59, 999);

  const { regularQuota, emergencyQuota } = await getBranchQuotas(branchId);

  // Fetch all non-rejected leaves that overlap this month
  const leaves = await prisma.leaveRequest.findMany({
    where: {
      branchId,
      trainerProfileId,
      status: { in: ['PENDING', 'APPROVED'] },
      startDate: { lte: monthEnd },
      endDate: { gte: monthStart },
    },
  });

  let regularUsed = 0;
  let emergencyUsed = 0;

  for (const leave of leaves) {
    const days = leaveDaysForMonth(
      leave.startDate,
      leave.endDate,
      leave.leaveType,
      leave.startTime,
      leave.endTime,
      month,
    );
    if (leave.leaveCategory === 'EMERGENCY') {
      emergencyUsed += days;
    } else {
      // REGULAR or any unknown/null value counts as regular
      regularUsed += days;
    }
  }

  return {
    month,
    regular: {
      quota: regularQuota,
      used: regularUsed,
      remaining: Math.max(0, regularQuota - regularUsed),
    },
    emergency: {
      quota: emergencyQuota,
      used: emergencyUsed,
      remaining: Math.max(0, emergencyQuota - emergencyUsed),
    },
  };
}

/**
 * Get leave balance for all trainers in a branch for a given month (admin view).
 */
export async function getLeaveBalanceAllTrainers({
  branchId,
  month,
}: {
  branchId: string;
  month: string;
}): Promise<(LeaveBalance & { trainerProfileId: string; trainerName: string })[]> {
  const [year, mon] = month.split('-').map(Number);
  const monthStart = new Date(year!, mon! - 1, 1);
  const monthEnd = new Date(year!, mon!, 0);
  monthEnd.setHours(23, 59, 59, 999);

  const { regularQuota, emergencyQuota } = await getBranchQuotas(branchId);

  const trainers = await prisma.trainerProfile.findMany({
    where: { branchId },
    include: { user: { select: { firstName: true, lastName: true } } },
  });

  const leaves = await prisma.leaveRequest.findMany({
    where: {
      branchId,
      status: { in: ['PENDING', 'APPROVED'] },
      startDate: { lte: monthEnd },
      endDate: { gte: monthStart },
    },
  });

  return trainers.map((trainer) => {
    const trainerLeaves = leaves.filter((l) => l.trainerProfileId === trainer.id);

    let regularUsed = 0;
    let emergencyUsed = 0;

    for (const leave of trainerLeaves) {
      const days = leaveDaysForMonth(
        leave.startDate,
        leave.endDate,
        leave.leaveType,
        leave.startTime,
        leave.endTime,
        month,
      );
      if (leave.leaveCategory === 'REGULAR') {
        regularUsed += days;
      } else {
        emergencyUsed += days;
      }
    }

    return {
      trainerProfileId: trainer.id,
      trainerName: `${trainer.user.firstName} ${trainer.user.lastName}`,
      month,
      regular: {
        quota: regularQuota,
        used: regularUsed,
        remaining: Math.max(0, regularQuota - regularUsed),
      },
      emergency: {
        quota: emergencyQuota,
        used: emergencyUsed,
        remaining: Math.max(0, emergencyQuota - emergencyUsed),
      },
    };
  });
}

/**
 * Apply for leave — creates a PENDING leave request, enforces quota, identifies affected clients.
 */
export async function applyLeave({
  trainerProfileId,
  startDate,
  endDate,
  leaveType,
  leaveCategory,
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

  // Emergency leave must be single-day only
  if (leaveCategory === 'EMERGENCY') {
    const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
    if (days > 1) {
      throw new AppError(
        'EMERGENCY_LEAVE_SINGLE_DAY',
        'Emergency leave can only be applied for a single day',
        400,
      );
    }
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

  // ── Quota enforcement ─────────────────────────────
  // Gather all months spanned by this leave request
  const months: string[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cursor <= endMonth) {
    months.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`);
    cursor.setMonth(cursor.getMonth() + 1);
  }

  for (const month of months) {
    const balance = await getLeaveBalance({ trainerProfileId, branchId, month });
    const daysInMonth = leaveDaysForMonth(
      start,
      end,
      leaveType,
      startTime ?? null,
      endTime ?? null,
      month,
    );

    if (leaveCategory === 'REGULAR' && daysInMonth > balance.regular.remaining) {
      throw new AppError(
        'LEAVE_QUOTA_EXCEEDED',
        `Regular leave quota exceeded for ${month}. Remaining: ${balance.regular.remaining} day(s).`,
        422,
      );
    }
    if (leaveCategory === 'EMERGENCY' && daysInMonth > balance.emergency.remaining) {
      throw new AppError(
        'LEAVE_QUOTA_EXCEEDED',
        `Emergency leave quota exceeded for ${month}. Remaining: ${balance.emergency.remaining} day(s).`,
        422,
      );
    }
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
      leaveCategory,
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
      leaveCategory,
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
    where: { branchId, roles: { hasSome: ['SUPER_ADMIN', 'BRANCH_ADMIN'] }, isActive: true },
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
export async function reviewLeave({
  leaveId,
  status,
  notes,
  leaveCategory,
  actorId,
  branchId,
}: ReviewLeaveInput) {
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

  // If admin is marking as EMERGENCY on approve, check quota
  const effectiveCategory = leaveCategory ?? leave.leaveCategory;
  if (status === 'APPROVED' && effectiveCategory === 'EMERGENCY') {
    const startStr = leave.startDate.toISOString().slice(0, 7); // YYYY-MM
    const balance = await getLeaveBalance({
      trainerProfileId: leave.trainerProfileId,
      branchId,
      month: startStr,
    });
    // Exclude this leave's own contribution since it's still PENDING
    if (balance.emergency.remaining <= 0) {
      throw new AppError(
        'LEAVE_QUOTA_EXCEEDED',
        `Emergency leave quota exceeded for ${startStr}. Remaining: ${balance.emergency.remaining} day(s).`,
        422,
      );
    }
  }

  const updated = await prisma.leaveRequest.update({
    where: { id: leaveId },
    data: {
      status,
      reviewedByUserId: actorId,
      reviewedAt: new Date(),
      reviewNotes: notes ?? null,
      ...(leaveCategory ? { leaveCategory } : {}),
    },
    include: {
      trainer: {
        include: { user: { select: { id: true, firstName: true, lastName: true } } },
      },
    },
  });

  // Get affected sessions for audit metadata
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
  leaveCategory,
  month,
  page = 1,
  pageSize = 20,
}: ListLeavesInput) {
  const where: Record<string, unknown> = { branchId };
  if (status) where.status = status;
  if (trainerId) where.trainerProfileId = trainerId;
  if (leaveCategory) where.leaveCategory = leaveCategory;
  if (month) {
    const [year, mon] = month.split('-').map(Number);
    where.startDate = {
      gte: new Date(Date.UTC(year!, mon! - 1, 1)),
      lt: new Date(Date.UTC(year!, mon!, 1)),
    };
  }

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
 * List all active trainers in a branch (for admin dropdowns).
 */
export async function listTrainers({ branchId }: { branchId: string }) {
  const trainers = await prisma.trainerProfile.findMany({
    where: { branchId, user: { isActive: true } },
    include: { user: { select: { firstName: true, lastName: true } } },
    orderBy: { user: { firstName: 'asc' } },
  });
  return trainers.map((t) => ({
    id: t.id,
    name: `${t.user.firstName} ${t.user.lastName}`,
  }));
}

/**
 * Admin directly creates and approves an emergency leave on behalf of a trainer.
 */
export async function adminMarkEmergencyLeave({
  trainerProfileId,
  date,
  notes,
  actorId,
  branchId,
}: {
  trainerProfileId: string;
  date: string; // YYYY-MM-DD
  notes?: string;
  actorId: string;
  branchId: string;
}) {
  const month = date.slice(0, 7);

  // Verify trainer belongs to this branch
  const trainer = await prisma.trainerProfile.findFirst({
    where: { id: trainerProfileId, branchId },
    include: { user: { select: { firstName: true, lastName: true } } },
  });
  if (!trainer) {
    throw new AppError('NOT_FOUND', 'Trainer not found', 404);
  }

  // Check emergency quota
  const balance = await getLeaveBalance({ trainerProfileId, branchId, month });
  if (balance.emergency.remaining <= 0) {
    throw new AppError(
      'LEAVE_QUOTA_EXCEEDED',
      `Emergency leave quota exhausted for ${month}. Quota: ${balance.emergency.quota}.`,
      422,
    );
  }

  const startDate = new Date(date + 'T00:00:00.000Z');
  const endDate = new Date(date + 'T00:00:00.000Z');

  const leave = await prisma.leaveRequest.create({
    data: {
      trainerProfileId,
      branchId,
      startDate,
      endDate,
      leaveType: 'FULL_DAY',
      leaveCategory: 'EMERGENCY',
      status: 'APPROVED',
      reviewedByUserId: actorId,
      reviewedAt: new Date(),
      reviewNotes: notes ?? null,
      reason: 'Emergency — reported directly to admin',
    },
  });

  await auditLog({
    action: 'LEAVE_APPROVED',
    actorId,
    subjectType: 'LeaveRequest',
    subjectId: leave.id,
    branchId,
    newValue: {
      leaveCategory: 'EMERGENCY',
      status: 'APPROVED',
      date,
      adminCreated: true,
    },
    metadata: { trainerProfileId },
  });

  return {
    ...leave,
    trainerName: `${trainer.user.firstName} ${trainer.user.lastName}`,
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
