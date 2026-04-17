import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';
import { AppError } from '@/lib/errors';
import { sendNotification } from '@/lib/notifications';
import type { RescheduleStatus } from '@prisma/client';

// ─── Types ───────────────────────────────────────────────────────────────────

interface SubmitRescheduleRequestInput {
  branchId: string;
  sessionInstanceId: string;
  clientProfileId: string; // derived from session — the requesting client
  actorId: string; // the client's userId
  requestedDate: string; // YYYY-MM-DD or ISO
  requestedTime: string; // HH:MM
  reason?: string;
}

interface ReviewRescheduleRequestInput {
  id: string;
  branchId: string;
  actorId: string; // admin or trainer userId reviewing it
  reviewNotes?: string;
}

interface ListRescheduleRequestsInput {
  branchId: string;
  status?: RescheduleStatus;
  clientId?: string; // clientProfileId filter
  trainerProfileId?: string; // scope to a specific trainer's clients
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

// ─── Include shape reused across queries ─────────────────────────────────────

const RESCHEDULE_INCLUDE = {
  client: {
    include: {
      user: { select: { firstName: true, lastName: true, email: true, phone: true } },
    },
  },
  sessionInstance: {
    include: {
      trainer: {
        include: { user: { select: { firstName: true, lastName: true } } },
      },
    },
  },
} as const;

// ─── Service Functions ────────────────────────────────────────────────────────

/**
 * Client submits a reschedule request for one of their upcoming sessions.
 *
 * Rules:
 * - Session must be SCHEDULED (not started, completed, cancelled, or no-show)
 * - Session must belong to the requesting client
 * - Only one PENDING request allowed per session at a time
 */
export async function submitRescheduleRequest(input: SubmitRescheduleRequestInput) {
  // 1. Verify the session exists, is in this branch, and belongs to the client
  const session = await prisma.sessionInstance.findFirst({
    where: {
      id: input.sessionInstanceId,
      branchId: input.branchId,
      clientProfileId: input.clientProfileId,
    },
    include: {
      trainer: {
        include: { user: { select: { id: true, firstName: true, lastName: true } } },
      },
      client: {
        include: { user: { select: { firstName: true, lastName: true } } },
      },
    },
  });

  if (!session) {
    throw new AppError('SESSION_NOT_FOUND', 'Session not found or does not belong to you.', 404);
  }

  // 2. Only SCHEDULED sessions can be rescheduled
  if (session.status !== 'SCHEDULED') {
    throw new AppError(
      'SESSION_NOT_RESCHEDULABLE',
      `Cannot request a reschedule for a session with status "${session.status}". Only SCHEDULED sessions can be rescheduled.`,
      400,
    );
  }

  // 3. Only one PENDING request per session at a time
  const existingPending = await prisma.rescheduleRequest.findFirst({
    where: { sessionInstanceId: input.sessionInstanceId, status: 'PENDING' },
  });
  if (existingPending) {
    throw new AppError(
      'PENDING_REQUEST_EXISTS',
      'A reschedule request is already pending for this session. Wait for it to be reviewed before submitting another.',
      409,
    );
  }

  // 4. Create the request
  const request = await prisma.rescheduleRequest.create({
    data: {
      branchId: input.branchId,
      sessionInstanceId: input.sessionInstanceId,
      clientProfileId: input.clientProfileId,
      requestedDate: new Date(input.requestedDate),
      requestedTime: input.requestedTime,
      reason: input.reason ?? null,
      status: 'PENDING',
    },
    include: RESCHEDULE_INCLUDE,
  });

  await auditLog({
    action: 'RESCHEDULE_REQUEST_SUBMITTED',
    actorId: input.actorId,
    subjectType: 'RescheduleRequest',
    subjectId: request.id,
    branchId: input.branchId,
    newValue: {
      sessionInstanceId: input.sessionInstanceId,
      requestedDate: input.requestedDate,
      requestedTime: input.requestedTime,
      reason: input.reason,
    },
  });

  // 5. Notify admin(s) of this branch
  const admins = await prisma.user.findMany({
    where: {
      branchId: input.branchId,
      roles: { has: 'BRANCH_ADMIN' },
      isActive: true,
      deletedAt: null,
    },
    select: { id: true },
  });

  const clientName = `${session.client.user.firstName} ${session.client.user.lastName}`;
  const originalDate = session.scheduledDate.toISOString().split('T')[0];

  const notifyPromises: Promise<void>[] = admins.map((admin) =>
    sendNotification({
      branchId: input.branchId,
      recipientId: admin.id,
      title: 'Reschedule Request',
      body: `${clientName} has requested to reschedule their session on ${originalDate} at ${session.scheduledTime} to ${input.requestedDate} at ${input.requestedTime}.`,
      channel: 'IN_APP',
      metadata: { rescheduleRequestId: request.id, sessionInstanceId: input.sessionInstanceId },
    }),
  );

  // 6. Notify the trainer
  notifyPromises.push(
    sendNotification({
      branchId: input.branchId,
      recipientId: session.trainer.user.id,
      title: 'Reschedule Request',
      body: `${clientName} has requested to reschedule their session on ${originalDate} at ${session.scheduledTime} to ${input.requestedDate} at ${input.requestedTime}.`,
      channel: 'IN_APP',
      metadata: { rescheduleRequestId: request.id, sessionInstanceId: input.sessionInstanceId },
    }),
  );

  await Promise.allSettled(notifyPromises);

  return request;
}

/**
 * Admin or trainer approves a reschedule request.
 * Updates the SessionInstance to the new date/time.
 */
export async function approveReschedule(input: ReviewRescheduleRequestInput) {
  const request = await prisma.rescheduleRequest.findFirst({
    where: { id: input.id, branchId: input.branchId },
    include: {
      sessionInstance: {
        include: {
          client: {
            include: { user: { select: { id: true, firstName: true, lastName: true } } },
          },
        },
      },
      client: {
        include: { user: { select: { id: true } } },
      },
    },
  });

  if (!request) {
    throw new AppError('REQUEST_NOT_FOUND', 'Reschedule request not found.', 404);
  }
  if (request.status !== 'PENDING') {
    throw new AppError(
      'REQUEST_ALREADY_REVIEWED',
      `This request has already been ${request.status.toLowerCase()}.`,
      409,
    );
  }

  const oldDate = request.sessionInstance.scheduledDate;
  const oldTime = request.sessionInstance.scheduledTime;

  // Update the session instance and mark request approved in a transaction
  await prisma.$transaction([
    prisma.sessionInstance.update({
      where: { id: request.sessionInstanceId },
      data: {
        scheduledDate: request.requestedDate,
        scheduledTime: request.requestedTime,
      },
    }),
    prisma.rescheduleRequest.update({
      where: { id: request.id },
      data: {
        status: 'APPROVED',
        reviewedByUserId: input.actorId,
        reviewedAt: new Date(),
        reviewNotes: input.reviewNotes ?? null,
      },
    }),
  ]);

  await auditLog({
    action: 'RESCHEDULE_REQUEST_APPROVED',
    actorId: input.actorId,
    subjectType: 'RescheduleRequest',
    subjectId: request.id,
    branchId: input.branchId,
    oldValue: { scheduledDate: oldDate, scheduledTime: oldTime },
    newValue: {
      scheduledDate: request.requestedDate,
      scheduledTime: request.requestedTime,
      reviewNotes: input.reviewNotes,
    },
  });

  // Notify the client
  const newDateStr = request.requestedDate.toISOString().split('T')[0];
  await sendNotification({
    branchId: input.branchId,
    recipientId: request.client.user.id,
    title: 'Reschedule Approved',
    body: `Your reschedule request has been approved. Your session is now on ${newDateStr} at ${request.requestedTime}.`,
    channel: 'IN_APP',
    metadata: { rescheduleRequestId: request.id, sessionInstanceId: request.sessionInstanceId },
  });

  return { success: true };
}

/**
 * Admin or trainer rejects a reschedule request.
 * The SessionInstance remains unchanged.
 */
export async function rejectReschedule(input: ReviewRescheduleRequestInput) {
  const request = await prisma.rescheduleRequest.findFirst({
    where: { id: input.id, branchId: input.branchId },
    include: {
      client: {
        include: { user: { select: { id: true } } },
      },
      sessionInstance: {
        select: { scheduledDate: true, scheduledTime: true },
      },
    },
  });

  if (!request) {
    throw new AppError('REQUEST_NOT_FOUND', 'Reschedule request not found.', 404);
  }
  if (request.status !== 'PENDING') {
    throw new AppError(
      'REQUEST_ALREADY_REVIEWED',
      `This request has already been ${request.status.toLowerCase()}.`,
      409,
    );
  }

  await prisma.rescheduleRequest.update({
    where: { id: request.id },
    data: {
      status: 'REJECTED',
      reviewedByUserId: input.actorId,
      reviewedAt: new Date(),
      reviewNotes: input.reviewNotes ?? null,
    },
  });

  await auditLog({
    action: 'RESCHEDULE_REQUEST_REJECTED',
    actorId: input.actorId,
    subjectType: 'RescheduleRequest',
    subjectId: request.id,
    branchId: input.branchId,
    newValue: { status: 'REJECTED', reviewNotes: input.reviewNotes },
  });

  // Notify the client
  const originalDate = request.sessionInstance.scheduledDate.toISOString().split('T')[0];
  await sendNotification({
    branchId: input.branchId,
    recipientId: request.client.user.id,
    title: 'Reschedule Request Declined',
    body: `Your request to reschedule the session on ${originalDate} at ${request.sessionInstance.scheduledTime} was not approved.${input.reviewNotes ? ` Reason: ${input.reviewNotes}` : ''}`,
    channel: 'IN_APP',
    metadata: { rescheduleRequestId: request.id },
  });

  return { success: true };
}

/**
 * List reschedule requests for the branch.
 * Supports filtering by status, client, trainer, and date range.
 */
export async function listRescheduleRequests(input: ListRescheduleRequestsInput) {
  const page = input.page ?? 1;
  const pageSize = input.pageSize ?? 20;

  const where: Record<string, unknown> = { branchId: input.branchId };

  if (input.status) where.status = input.status;
  if (input.clientId) where.clientProfileId = input.clientId;

  // Scope to a trainer's clients: filter via sessionInstance's trainerProfileId
  if (input.trainerProfileId) {
    where.sessionInstance = { trainerProfileId: input.trainerProfileId };
  }

  if (input.dateFrom || input.dateTo) {
    const range: Record<string, Date> = {};
    if (input.dateFrom) range.gte = new Date(input.dateFrom);
    if (input.dateTo) range.lte = new Date(input.dateTo);
    where.createdAt = range;
  }

  const [data, total] = await Promise.all([
    prisma.rescheduleRequest.findMany({
      where,
      include: RESCHEDULE_INCLUDE,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.rescheduleRequest.count({ where }),
  ]);

  return {
    data,
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  };
}

/**
 * Get a single reschedule request by ID.
 */
export async function getRescheduleRequestById(id: string, branchId: string) {
  const request = await prisma.rescheduleRequest.findFirst({
    where: { id, branchId },
    include: RESCHEDULE_INCLUDE,
  });
  if (!request) {
    throw new AppError('REQUEST_NOT_FOUND', 'Reschedule request not found.', 404);
  }
  return request;
}
