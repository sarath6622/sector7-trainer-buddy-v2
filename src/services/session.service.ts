import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';
import { AppError } from '@/lib/errors';
import {
  notifySessionStarted,
  notifyNoShow,
  notifySessionBooked,
} from '@/services/notification.service';
import {
  evaluateStreakBadges,
  evaluateSessionMilestoneBadges,
  type NewBadge,
} from '@/services/badge.service';
import { triggerSessionEvent, triggerSessionPauseEvent } from '@/lib/pusher';
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

  // Pusher real-time: broadcast to session channel and client user channel
  void triggerSessionEvent(sessionId, 'SESSION_STARTED', {
    sessionId,
    startedAt: now.toISOString(),
    expectedDurationMin: session.durationMin,
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

  // Finalize any in-flight pause so accumulatedPausedSec is current. The
  // duration formula then subtracts paused time → actualDurationMin reflects
  // ACTIVE training, not wall-clock elapsed. Matters for billing/streaks.
  let totalPausedSec = session.accumulatedPausedSec ?? 0;
  if (session.pausedAt) {
    totalPausedSec += Math.max(0, Math.floor((now.getTime() - session.pausedAt.getTime()) / 1000));
  }
  const elapsedSec = Math.max(0, Math.floor((now.getTime() - startedAt.getTime()) / 1000));
  const activeSec = Math.max(0, elapsedSec - totalPausedSec);
  const actualDurationMin = Math.round(activeSec / 60);

  const updateData: Record<string, unknown> = {
    status: 'COMPLETED',
    endedAt: now,
    endedByUserId: actorId,
    actualDurationMin,
    // Snapshot pause state at end so the row's a faithful audit record:
    // pausedAt cleared, accumulator reflects total pause time across cycles.
    pausedAt: null,
    accumulatedPausedSec: totalPausedSec,
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

  // Evaluate badges after session completes (non-blocking — failures silently ignored)
  const newBadges: NewBadge[] = [];
  try {
    const [streakBadges, milestoneBadges] = await Promise.all([
      evaluateStreakBadges(session.clientProfileId, branchId, actorId),
      evaluateSessionMilestoneBadges(session.clientProfileId, branchId, actorId),
    ]);
    newBadges.push(...streakBadges, ...milestoneBadges);
  } catch {
    // badge evaluation failure must never break session end
  }

  // Pusher real-time: broadcast session ended to session channel
  void triggerSessionEvent(sessionId, 'SESSION_ENDED', {
    sessionId,
    endedAt: now.toISOString(),
    actualDurationMin,
  });

  return {
    session: updated,
    actualDurationMin,
    newBadges,
  };
}

// ─── Session pause / resume ──────────────────────────────────────────────────
//
// Mirrors the rest-timer pattern: server-driven state, both trainer and
// client subscribe to Pusher. Audit log entries fire on every transition so
// we have a paper trail of who paused when.

export interface SessionPauseSnapshot {
  pausedAt: Date | null;
  accumulatedPausedSec: number;
  pauseUpdatedAt: Date | null;
}

interface PauseSessionInput {
  sessionId: string;
  branchId: string;
  actorId: string;
}

export async function getSessionPauseState({
  sessionId,
  branchId,
}: {
  sessionId: string;
  branchId: string;
}): Promise<SessionPauseSnapshot> {
  const row = await prisma.sessionInstance.findFirst({
    where: { id: sessionId, branchId },
    select: { pausedAt: true, accumulatedPausedSec: true, pauseUpdatedAt: true },
  });
  if (!row) throw new AppError('SESSION_NOT_FOUND', 'Session not found', 404);
  return row;
}

export async function pauseSession({ sessionId, branchId, actorId }: PauseSessionInput) {
  const session = await prisma.sessionInstance.findFirst({
    where: { id: sessionId, branchId },
    select: {
      id: true,
      status: true,
      pausedAt: true,
      accumulatedPausedSec: true,
    },
  });
  if (!session) throw new AppError('SESSION_NOT_FOUND', 'Session not found', 404);
  if (session.status !== 'IN_PROGRESS') {
    throw new AppError('INVALID_STATUS', `Cannot pause a ${session.status} session`, 400);
  }
  // Idempotent: pausing an already-paused session is a no-op echo.
  if (session.pausedAt) {
    return await getSessionPauseState({ sessionId, branchId });
  }

  const now = new Date();
  const updated = await prisma.sessionInstance.update({
    where: { id: sessionId },
    data: { pausedAt: now, pausedByUserId: actorId, pauseUpdatedAt: now },
    select: { pausedAt: true, accumulatedPausedSec: true, pauseUpdatedAt: true },
  });

  await Promise.all([
    auditLog({
      action: 'SESSION_PAUSED',
      actorId,
      subjectType: 'SessionInstance',
      subjectId: sessionId,
      branchId,
      newValue: { pausedAt: now.toISOString() },
    }),
    triggerSessionPauseEvent(sessionId, {
      pausedAt: updated.pausedAt!.getTime(),
      accumulatedPausedSec: updated.accumulatedPausedSec,
      updatedAt: updated.pauseUpdatedAt!.getTime(),
      serverNow: Date.now(),
    }),
  ]);

  return updated;
}

export async function resumeSession({ sessionId, branchId, actorId }: PauseSessionInput) {
  const session = await prisma.sessionInstance.findFirst({
    where: { id: sessionId, branchId },
    select: {
      id: true,
      status: true,
      pausedAt: true,
      accumulatedPausedSec: true,
    },
  });
  if (!session) throw new AppError('SESSION_NOT_FOUND', 'Session not found', 404);
  if (session.status !== 'IN_PROGRESS') {
    throw new AppError('INVALID_STATUS', `Cannot resume a ${session.status} session`, 400);
  }
  // Idempotent: resuming a non-paused session just echoes current state.
  if (!session.pausedAt) {
    return await getSessionPauseState({ sessionId, branchId });
  }

  const now = new Date();
  const newAccumulated =
    session.accumulatedPausedSec +
    Math.max(0, Math.floor((now.getTime() - session.pausedAt.getTime()) / 1000));

  const updated = await prisma.sessionInstance.update({
    where: { id: sessionId },
    data: {
      pausedAt: null,
      pausedByUserId: null,
      accumulatedPausedSec: newAccumulated,
      pauseUpdatedAt: now,
    },
    select: { pausedAt: true, accumulatedPausedSec: true, pauseUpdatedAt: true },
  });

  await Promise.all([
    auditLog({
      action: 'SESSION_RESUMED',
      actorId,
      subjectType: 'SessionInstance',
      subjectId: sessionId,
      branchId,
      oldValue: { pausedAt: session.pausedAt.toISOString() },
      newValue: { accumulatedPausedSec: newAccumulated },
    }),
    triggerSessionPauseEvent(sessionId, {
      pausedAt: null,
      accumulatedPausedSec: updated.accumulatedPausedSec,
      updatedAt: updated.pauseUpdatedAt!.getTime(),
      serverNow: Date.now(),
    }),
  ]);

  return updated;
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
              secondaryMetric: true,
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

interface BookSessionByTrainerInput {
  trainerProfileId: string;
  clientProfileId: string;
  branchId: string;
  actorId: string;
  scheduledDate: string; // YYYY-MM-DD
  scheduledTime: string; // HH:MM
  durationMin: number;
  notes?: string;
}

/**
 * Book a single session instance directly — trainer-initiated manual booking.
 * Guards: PtPackage assignment, no double-booking on the same slot.
 */
export async function bookSessionByTrainer({
  trainerProfileId,
  clientProfileId,
  branchId,
  actorId,
  scheduledDate,
  scheduledTime,
  durationMin,
  notes,
}: BookSessionByTrainerInput) {
  // Verify the trainer is assigned to this client via an active PtPackage
  const assignment = await prisma.ptPackage.findFirst({
    where: {
      branchId,
      clientProfileId,
      trainerProfileId,
      isActive: true,
    },
  });
  if (!assignment) {
    throw new AppError(
      'NOT_ASSIGNED',
      'You are not assigned to this client or the package is not active.',
      403,
    );
  }

  const dateObj = new Date(scheduledDate);
  const dayStart = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
  const dayEnd = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate(), 23, 59, 59);

  // Check trainer doesn't already have a session overlapping this slot
  const trainerConflicts = await prisma.sessionInstance.findMany({
    where: {
      branchId,
      trainerProfileId,
      scheduledDate: { gte: dayStart, lte: dayEnd },
      status: { notIn: ['CANCELLED'] },
    },
    select: { scheduledTime: true, durationMin: true },
  });

  const [newH, newM] = scheduledTime.split(':').map(Number);
  const newStart = (newH ?? 0) * 60 + (newM ?? 0);
  const newEnd = newStart + durationMin;

  for (const existing of trainerConflicts) {
    const [exH, exM] = existing.scheduledTime.split(':').map(Number);
    const exStart = (exH ?? 0) * 60 + (exM ?? 0);
    const exEnd = exStart + existing.durationMin;
    if (newStart < exEnd && newEnd > exStart) {
      throw new AppError(
        'TRAINER_CONFLICT',
        `You already have a session at ${existing.scheduledTime} on this date that overlaps with the requested time.`,
        409,
      );
    }
  }

  // Check client doesn't have a conflicting session
  const clientConflicts = await prisma.sessionInstance.findMany({
    where: {
      branchId,
      clientProfileId,
      scheduledDate: { gte: dayStart, lte: dayEnd },
      status: { notIn: ['CANCELLED'] },
    },
    select: { scheduledTime: true, durationMin: true },
  });

  for (const existing of clientConflicts) {
    const [exH, exM] = existing.scheduledTime.split(':').map(Number);
    const exStart = (exH ?? 0) * 60 + (exM ?? 0);
    const exEnd = exStart + existing.durationMin;
    if (newStart < exEnd && newEnd > exStart) {
      throw new AppError(
        'CLIENT_CONFLICT',
        `This client already has a session at ${existing.scheduledTime} on this date that overlaps.`,
        409,
      );
    }
  }

  const session = await prisma.sessionInstance.create({
    data: {
      branchId,
      clientProfileId,
      trainerProfileId,
      scheduledDate: dayStart,
      scheduledTime,
      durationMin,
      status: 'SCHEDULED',
      notes: notes ?? null,
    },
    include: {
      client: { include: { user: { select: { id: true, firstName: true, lastName: true } } } },
      trainer: { include: { user: { select: { firstName: true, lastName: true } } } },
    },
  });

  await auditLog({
    action: 'SESSION_BOOKED_BY_TRAINER',
    actorId,
    subjectType: 'SessionInstance',
    subjectId: session.id,
    branchId,
    newValue: { clientProfileId, scheduledDate, scheduledTime, durationMin },
    metadata: { trainerProfileId },
  });

  // Notify the client their session has been booked (fire-and-forget)
  const trainerUser = session.trainer.user;
  notifySessionBooked({
    branchId,
    clientUserId: session.client.user.id,
    trainerName: `${trainerUser.firstName} ${trainerUser.lastName}`,
    date: scheduledDate,
    time: scheduledTime,
  });

  return session;
}

/**
 * Assert that the caller (trainer or client) is allowed to read/write
 * a given session and that the session belongs to their branch. Returns
 * the lightweight session row on success; throws AppError otherwise.
 *
 * Used by ephemeral-state routes (e.g. rest timer) where a 403 must be
 * raised before any side effect — Rule #2 from CLAUDE.md.
 */
export async function assertSessionAccess({
  sessionId,
  branchId,
  trainerProfileId,
  clientProfileId,
}: {
  sessionId: string;
  branchId: string;
  trainerProfileId: string | null;
  clientProfileId: string | null;
}) {
  const session = await prisma.sessionInstance.findFirst({
    where: { id: sessionId, branchId },
    select: {
      id: true,
      branchId: true,
      trainerProfileId: true,
      clientProfileId: true,
      status: true,
    },
  });

  if (!session) {
    throw new AppError('SESSION_NOT_FOUND', 'Session not found', 404);
  }

  const isTrainer = !!trainerProfileId && session.trainerProfileId === trainerProfileId;
  const isClient = !!clientProfileId && session.clientProfileId === clientProfileId;

  if (!isTrainer && !isClient) {
    throw new AppError('SESSION_FORBIDDEN', 'Not allowed to access this session', 403);
  }

  return session;
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
              secondaryMetric: true,
            },
          },
          sets: { orderBy: { setNumber: 'asc' } },
        },
        orderBy: [{ orderIndex: 'asc' }, { id: 'asc' }],
      },
    },
  });
}
