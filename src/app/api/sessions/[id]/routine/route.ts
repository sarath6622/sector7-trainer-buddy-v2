import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { triggerWorkoutUpdatedEvent } from '@/lib/pusher';
import { applySessionRoutineSchema } from '@/lib/validators';
import * as routineService from '@/services/routine.service';

/**
 * POST /api/sessions/[id]/routine — apply one of the client's routines to an
 * in-progress session (ADR-053). Trainer of the session only: clients see the
 * targets but cannot start a routine (operator decision 2026-10-18).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    }
    const { id: sessionId } = await params;

    const parsed = applySessionRoutineSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const data = await routineService.applyRoutineToSession({
      sessionId,
      routineId: parsed.data.routineId,
      branchId: session.user.branchId,
      actor: routineService.toRoutineActor(session.user),
    });

    // The client's page refetches on this; the trainer's own page skips the
    // echo and refetches from the POST response instead.
    void triggerWorkoutUpdatedEvent(sessionId, {
      sessionId,
      actorUserId: session.user.id,
      updatedAt: Date.now(),
    });

    return NextResponse.json({ data });
  } catch (error) {
    console.error('[POST /api/sessions/[id]/routine] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}

/** DELETE /api/sessions/[id]/routine — unlink the routine; logs untouched. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    }
    const { id: sessionId } = await params;
    const data = await routineService.detachRoutineFromSession({
      sessionId,
      branchId: session.user.branchId,
      actor: routineService.toRoutineActor(session.user),
    });
    void triggerWorkoutUpdatedEvent(sessionId, {
      sessionId,
      actorUserId: session.user.id,
      updatedAt: Date.now(),
    });
    return NextResponse.json({ data });
  } catch (error) {
    console.error('[DELETE /api/sessions/[id]/routine] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
