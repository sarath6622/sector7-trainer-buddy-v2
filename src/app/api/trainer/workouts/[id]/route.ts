import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { workoutSetSchema } from '@/lib/validators';
import { z } from 'zod';
import * as workoutService from '@/services/workout.service';

/**
 * @deprecated Prefer PUT /api/sessions/[sessionId]/workouts/[logId].
 */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['TRAINER', 'KICKBOXING_TRAINER'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const trainerProfileId = session.user.trainerProfileId;
    if (!trainerProfileId) {
      return NextResponse.json(
        { error: 'No trainer profile', code: 'NO_PROFILE' },
        { status: 400 },
      );
    }

    const { id } = await params;
    const body = await req.json();
    const input = z.object({ sets: z.array(workoutSetSchema).optional() }).parse(body);

    const workoutLog = await workoutService.updateWorkoutLog({
      workoutLogId: id,
      sets: input.sets,
      actorUserId: session.user.id,
      actorTrainerProfileId: trainerProfileId,
      actorClientProfileId: null,
      branchId: session.user.branchId,
    });

    return NextResponse.json({ data: workoutLog });
  } catch (error) {
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}

/**
 * @deprecated Prefer DELETE /api/sessions/[sessionId]/workouts/[logId].
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['TRAINER', 'KICKBOXING_TRAINER'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const trainerProfileId = session.user.trainerProfileId;
    if (!trainerProfileId) {
      return NextResponse.json(
        { error: 'No trainer profile', code: 'NO_PROFILE' },
        { status: 400 },
      );
    }

    const { id } = await params;
    const result = await workoutService.deleteWorkoutLog({
      workoutLogId: id,
      actorUserId: session.user.id,
      actorTrainerProfileId: trainerProfileId,
      actorClientProfileId: null,
      branchId: session.user.branchId,
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
