import { NextResponse } from 'next/server';
import { ZodError, z } from 'zod';
import { getServerSession } from '@/lib/auth';
import { toErrorResponse, AppError } from '@/lib/errors';
import { workoutSetSchema } from '@/lib/validators';
import { triggerWorkoutUpdatedEvent } from '@/lib/pusher';
import * as workoutService from '@/services/workout.service';

const updateBodySchema = z.object({
  sets: z.array(workoutSetSchema).optional(),
});

/**
 * PUT /api/sessions/[id]/workouts/[logId]
 *
 * Replace the sets on a single workout log. Trainer or client of the session
 * may call (assertSessionAccess in the service enforces ownership).
 */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string; logId: string }> },
) {
  try {
    const { id: sessionInstanceId, logId } = await params;
    const auth = await getServerSession();
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    }
    const { id: actorUserId, branchId, trainerProfileId, clientProfileId } = auth.user;
    if (!branchId) {
      throw new AppError('NO_BRANCH', 'User has no branch', 400);
    }

    const body = await req.json();
    const input = updateBodySchema.parse(body);

    // sessionInstanceId is not needed by the service (it derives it from the
    // log row), but we use it to broadcast WORKOUT_UPDATED below.

    const updated = await workoutService.updateWorkoutLog({
      workoutLogId: logId,
      sets: input.sets,
      actorUserId,
      actorTrainerProfileId: trainerProfileId ?? null,
      actorClientProfileId: clientProfileId ?? null,
      branchId,
    });

    void triggerWorkoutUpdatedEvent(sessionInstanceId, {
      sessionId: sessionInstanceId,
      actorUserId,
      updatedAt: Date.now(),
    });

    return NextResponse.json({ data: updated });
  } catch (err) {
    if (err instanceof ZodError) {
      console.error(
        '[PUT /api/sessions/[id]/workouts/[logId]] Invalid payload:',
        JSON.stringify(err.issues),
      );
      return NextResponse.json(
        { error: 'Invalid payload', code: 'VALIDATION_ERROR', issues: err.issues },
        { status: 422 },
      );
    }
    const r = toErrorResponse(err);
    return NextResponse.json({ error: r.error, code: r.code }, { status: r.status });
  }
}

/**
 * DELETE /api/sessions/[id]/workouts/[logId]
 *
 * Remove a single workout log (and its sets). Trainer or client of the
 * session may call.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; logId: string }> },
) {
  try {
    const { id: sessionInstanceId, logId } = await params;
    const auth = await getServerSession();
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    }
    const { id: actorUserId, branchId, trainerProfileId, clientProfileId } = auth.user;
    if (!branchId) {
      throw new AppError('NO_BRANCH', 'User has no branch', 400);
    }

    const result = await workoutService.deleteWorkoutLog({
      workoutLogId: logId,
      actorUserId,
      actorTrainerProfileId: trainerProfileId ?? null,
      actorClientProfileId: clientProfileId ?? null,
      branchId,
    });

    void triggerWorkoutUpdatedEvent(sessionInstanceId, {
      sessionId: sessionInstanceId,
      actorUserId,
      updatedAt: Date.now(),
    });

    return NextResponse.json({ data: result });
  } catch (err) {
    const r = toErrorResponse(err);
    return NextResponse.json({ error: r.error, code: r.code }, { status: r.status });
  }
}
