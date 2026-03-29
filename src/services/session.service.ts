import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';
import { AppError } from '@/lib/errors';
import { notifySessionStarted, notifyNoShow } from '@/services/notification.service';
import type { SessionStatus } from '@prisma/client';

interface StartSessionInput {
  sessionId: string;
  trainerProfileId: string;
  actorId: string;
  branchId: string;
}

interface EndSessionInput {
  sessionId: string;
  trainerProfileId: string;
  actorId: string;
  branchId: string;
  notes?: string;
}

interface MarkNoShowInput {
  sessionId: string;
  trainerProfileId: string;
  actorId: string;
  branchId: string;
}

interface GetSessionInput {
  sessionId: string;
  branchId: string;
  trainerProfileId?: string;
}

interface ListTrainerSessionsInput {
  trainerProfileId: string;
  branchId: string;
  date?: string;
  status?: SessionStatus;
}

interface ListClientSessionsInput {
  clientProfileId: string;
  branchId: string;
  month?: string;
}

interface SessionCountInput {
  clientProfileId: string;
  branchId: string;
  month: string; // YYYY-MM
}

/**
 * Start a session: set status to IN_PROGRESS, record startedAt
 */
export async function startSession({
  sessionId,
  trainerProfileId,
  actorId,
  branchId,
}: StartSessionInput) {
  const session = await prisma.sessionInstance.findFirst({
    where: { id: sessionId, branchId, trainerProfileId },
  });

  if (!session) {
    throw new AppError('SESSION_NOT_FOUND', 'Session not found', 404);
  }

  if (session.status !== 'SCHEDULED') {
    throw new AppError(
      'INVALID_STATUS',
      `Cannot start a session with status ${session.status}`,
      400,
    );
  }

  // Check if trainer already has an active session
  const activeSession = await prisma.sessionInstance.findFirst({
    where: {
      branchId,
      trainerProfileId,
      status: 'IN_PROGRESS',
    },
  });

  if (activeSession) {
    throw new AppError(
      'SESSION_ALREADY_ACTIVE',
      'You already have an active session. End it before starting a new one.',
      409,
    );
  }

  const now = new Date();
  const updated = await prisma.sessionInstance.update({
    where: { id: sessionId },
    data: {
      status: 'IN_PROGRESS',
      startedAt: now,
      startedByUserId: actorId,
    },
    include: {
      client: {
        include: { user: { select: { id: true, firstName: true, lastName: true } } },
      },
      trainer: {
        include: { user: { select: { id: true, firstName: true, lastName: true } } },
      },
    },
  });

  await auditLog({
    action: 'SESSION_STARTED',
    actorId,
    subjectType: 'SessionInstance',
    subjectId: sessionId,
    branchId,
    newValue: { status: 'IN_PROGRESS', startedAt: now.toISOString() },
    metadata: { clientProfileId: session.clientProfileId, trainerProfileId },
  });

  // Notify client (fire-and-forget)
  const trainerUser = updated.trainer.user;
  notifySessionStarted({
    branchId,
    clientUserId: updated.client.user.id,
    trainerName: `${trainerUser.firstName} ${trainerUser.lastName}`,
    scheduledTime: session.scheduledTime,
  });

  return {
    session: updated,
    timer: {
      startedAt: now.toISOString(),
      expectedDurationMin: session.durationMin,
    },
  };
}

/**
 * End a session: set status to COMPLETED, record endedAt and actual duration
 */
export async function endSession({
  sessionId,
  trainerProfileId,
  actorId,
  branchId,
  notes,
}: EndSessionInput) {
  const session = await prisma.sessionInstance.findFirst({
    where: { id: sessionId, branchId, trainerProfileId },
  });

  if (!session) {
    throw new AppError('SESSION_NOT_FOUND', 'Session not found', 404);
  }

  if (session.status !== 'IN_PROGRESS') {
    throw new AppError('INVALID_STATUS', `Cannot end a session with status ${session.status}`, 400);
  }

  const now = new Date();
  const startedAt = session.startedAt!;
  const actualDurationMin = Math.round((now.getTime() - startedAt.getTime()) / 60000);

  const updateData: Record<string, unknown> = {
    status: 'COMPLETED',
    endedAt: now,
    endedByUserId: actorId,
    actualDurationMin,
  };

  if (notes !== undefined) {
    updateData.notes = notes;
  }

  const updated = await prisma.sessionInstance.update({
    where: { id: sessionId },
    data: updateData,
    include: {
      client: {
        include: { user: { select: { firstName: true, lastName: true } } },
      },
      trainer: {
        include: { user: { select: { firstName: true, lastName: true } } },
      },
    },
  });

  await auditLog({
    action: 'SESSION_ENDED',
    actorId,
    subjectType: 'SessionInstance',
    subjectId: sessionId,
    branchId,
    oldValue: { status: 'IN_PROGRESS', startedAt: startedAt.toISOString() },
    newValue: { status: 'COMPLETED', endedAt: now.toISOString(), actualDurationMin },
    metadata: { clientProfileId: session.clientProfileId, trainerProfileId },
  });

  return {
    session: updated,
    actualDurationMin,
  };
}

/**
 * Mark a session as no-show
 */
export async function markNoShow({
  sessionId,
  trainerProfileId,
  actorId,
  branchId,
}: MarkNoShowInput) {
  const session = await prisma.sessionInstance.findFirst({
    where: { id: sessionId, branchId, trainerProfileId },
  });

  if (!session) {
    throw new AppError('SESSION_NOT_FOUND', 'Session not found', 404);
  }

  if (session.status !== 'SCHEDULED') {
    throw new AppError(
      'INVALID_STATUS',
      `Cannot mark no-show on a session with status ${session.status}`,
      400,
    );
  }

  const now = new Date();
  const updated = await prisma.sessionInstance.update({
    where: { id: sessionId },
    data: {
      status: 'NO_SHOW',
      noShowMarkedAt: now,
      noShowMarkedByUserId: actorId,
    },
    include: {
      client: {
        include: { user: { select: { id: true, firstName: true, lastName: true } } },
      },
      trainer: {
        include: { user: { select: { id: true, firstName: true, lastName: true } } },
      },
    },
  });

  await auditLog({
    action: 'SESSION_NO_SHOW',
    actorId,
    subjectType: 'SessionInstance',
    subjectId: sessionId,
    branchId,
    newValue: { status: 'NO_SHOW', noShowMarkedAt: now.toISOString() },
    metadata: { clientProfileId: session.clientProfileId, trainerProfileId },
  });

  // Notify client (fire-and-forget)
  notifyNoShow({
    branchId,
    clientUserId: updated.client.user.id,
    date: session.scheduledDate.toISOString().slice(0, 10),
    time: session.scheduledTime,
  });

  return { session: updated };
}

/**
 * Get a single session instance with relations
 */
export async function getSessionById({ sessionId, branchId, trainerProfileId }: GetSessionInput) {
  const where: Record<string, unknown> = { id: sessionId, branchId };
  if (trainerProfileId) {
    where.trainerProfileId = trainerProfileId;
  }

  const session = await prisma.sessionInstance.findFirst({
    where,
    include: {
      client: {
        include: {
          user: { select: { firstName: true, lastName: true, email: true, phone: true } },
        },
      },
      trainer: {
        include: { user: { select: { firstName: true, lastName: true } } },
      },
      workoutLogs: {
        include: {
          exercise: {
            select: {
              id: true,
              name: true,
              targetMuscleGroup: true,
              category: true,
              exerciseType: true,
            },
          },
          sets: { orderBy: { setNumber: 'asc' } },
        },
        orderBy: [{ orderIndex: 'asc' }, { id: 'asc' }],
      },
    },
  });

  if (!session) {
    throw new AppError('SESSION_NOT_FOUND', 'Session not found', 404);
  }

  return session;
}

/**
 * List sessions for a trainer (today or filtered)
 */
export async function getTrainerSessions({
  trainerProfileId,
  branchId,
  date,
  status,
}: ListTrainerSessionsInput) {
  const where: Record<string, unknown> = { branchId, trainerProfileId };

  if (date) {
    const d = new Date(date);
    where.scheduledDate = {
      gte: new Date(d.getFullYear(), d.getMonth(), d.getDate()),
      lte: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59),
    };
  }

  if (status) {
    where.status = status;
  }

  return prisma.sessionInstance.findMany({
    where,
    include: {
      client: {
        include: { user: { select: { firstName: true, lastName: true } } },
      },
    },
    orderBy: [{ scheduledDate: 'asc' }, { scheduledTime: 'asc' }],
  });
}

/**
 * List sessions for a client
 */
export async function getClientSessions({
  clientProfileId,
  branchId,
  month,
}: ListClientSessionsInput) {
  const where: Record<string, unknown> = { branchId, clientProfileId };

  if (month) {
    const [yearStr, monthStr] = month.split('-');
    const year = parseInt(yearStr!, 10);
    const m = parseInt(monthStr!, 10);
    where.scheduledDate = {
      gte: new Date(year, m - 1, 1),
      lte: new Date(year, m, 0, 23, 59, 59),
    };
  }

  return prisma.sessionInstance.findMany({
    where,
    include: {
      trainer: {
        include: { user: { select: { firstName: true, lastName: true } } },
      },
    },
    orderBy: [{ scheduledDate: 'asc' }, { scheduledTime: 'asc' }],
  });
}

/**
 * Get session counts for a client in a given month
 */
export async function getSessionCounts({ clientProfileId, branchId, month }: SessionCountInput) {
  const [yearStr, monthStr] = month.split('-');
  const year = parseInt(yearStr!, 10);
  const m = parseInt(monthStr!, 10);

  const sessions = await prisma.sessionInstance.findMany({
    where: {
      branchId,
      clientProfileId,
      scheduledDate: {
        gte: new Date(year, m - 1, 1),
        lte: new Date(year, m, 0, 23, 59, 59),
      },
    },
    select: { status: true, isCarryForward: true },
  });

  const total = sessions.length;
  const completed = sessions.filter((s) => s.status === 'COMPLETED').length;
  const noShow = sessions.filter((s) => s.status === 'NO_SHOW').length;
  const cancelled = sessions.filter((s) => s.status === 'CANCELLED').length;
  const scheduled = sessions.filter((s) => s.status === 'SCHEDULED').length;
  const inProgress = sessions.filter((s) => s.status === 'IN_PROGRESS').length;
  const carryForward = sessions.filter((s) => s.isCarryForward).length;
  const used = completed + noShow;
  const remaining = scheduled + inProgress;

  return {
    total,
    completed,
    noShow,
    cancelled,
    scheduled,
    inProgress,
    carryForward,
    used,
    remaining,
  };
}

/**
 * Get the active (IN_PROGRESS) session for a trainer
 */
export async function getActiveSession(trainerProfileId: string, branchId: string) {
  return prisma.sessionInstance.findFirst({
    where: {
      branchId,
      trainerProfileId,
      status: 'IN_PROGRESS',
    },
    include: {
      client: {
        include: { user: { select: { firstName: true, lastName: true } } },
      },
      trainer: {
        include: { user: { select: { firstName: true, lastName: true } } },
      },
      workoutLogs: {
        include: {
          exercise: {
            select: {
              id: true,
              name: true,
              targetMuscleGroup: true,
              category: true,
              exerciseType: true,
            },
          },
          sets: { orderBy: { setNumber: 'asc' } },
        },
        orderBy: [{ orderIndex: 'asc' }, { id: 'asc' }],
      },
    },
  });
}
