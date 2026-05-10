import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import {
  assertSessionAccess,
  getSessionPauseState,
  pauseSession,
  resumeSession,
} from '@/services/session.service';
import { AppError, toErrorResponse } from '@/lib/errors';

// ─── Wire shape ──────────────────────────────────────────────────────────────
// Same field names as the Pusher payload + a serverNow stamp so clients can
// compute their skew (mirrors the rest-timer endpoint).

export interface SessionPausePayload {
  pausedAt: number | null;
  accumulatedPausedSec: number;
  updatedAt: number;
}

function toWire(snapshot: {
  pausedAt: Date | null;
  accumulatedPausedSec: number;
  pauseUpdatedAt: Date | null;
}): SessionPausePayload {
  return {
    pausedAt: snapshot.pausedAt ? snapshot.pausedAt.getTime() : null,
    accumulatedPausedSec: snapshot.accumulatedPausedSec,
    updatedAt: snapshot.pauseUpdatedAt ? snapshot.pauseUpdatedAt.getTime() : 0,
  };
}

async function authorize(sessionId: string) {
  const session = await getServerSession();
  if (!session) throw new AppError('UNAUTHORIZED', 'Unauthorized', 401);
  const { branchId, trainerProfileId, clientProfileId, id: userId } = session.user;
  if (!branchId) throw new AppError('NO_BRANCH', 'User has no branch', 400);
  await assertSessionAccess({
    sessionId,
    branchId,
    trainerProfileId: trainerProfileId ?? null,
    clientProfileId: clientProfileId ?? null,
  });
  return { userId, branchId };
}

/**
 * GET /api/sessions/[id]/pause
 * Returns current pause state. Used by the hook on mount + 30s keepalive.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { branchId } = await authorize(id);
    const snapshot = await getSessionPauseState({ sessionId: id, branchId });
    return NextResponse.json({ data: toWire(snapshot), serverNow: Date.now() });
  } catch (err) {
    const r = toErrorResponse(err);
    return NextResponse.json({ error: r.error, code: r.code }, { status: r.status });
  }
}

/**
 * POST /api/sessions/[id]/pause
 * Toggles pause: pauses when running, resumes when paused. The server is the
 * single source of truth for the current state, so the client doesn't need
 * to send a desired state — it just asks for "the other side."
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { userId, branchId } = await authorize(id);

    const current = await getSessionPauseState({ sessionId: id, branchId });
    const isPaused = current.pausedAt !== null;
    const updated = isPaused
      ? await resumeSession({ sessionId: id, branchId, actorId: userId })
      : await pauseSession({ sessionId: id, branchId, actorId: userId });

    return NextResponse.json({ data: toWire(updated), serverNow: Date.now() });
  } catch (err) {
    const r = toErrorResponse(err);
    return NextResponse.json({ error: r.error, code: r.code }, { status: r.status });
  }
}
