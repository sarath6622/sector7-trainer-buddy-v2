import { NextRequest, NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { syncWorkoutsSchema } from '@/lib/validators';
import * as workoutService from '@/services/workout.service';

export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const { sessionInstanceId, logs } = syncWorkoutsSchema.parse(body);

    const synced: string[] = [];
    const conflicts: { localId: string; error: string }[] = [];

    // Process each log entry individually for resilience
    for (const log of logs) {
      try {
        await workoutService.createWorkoutLogs({
          sessionInstanceId,
          exercises: [
            {
              exerciseId: log.exerciseId,
              orderIndex: log.orderIndex,
              sets: log.sets,
            },
          ],
          actorUserId: session.user.id,
          actorTrainerProfileId: trainerProfileId,
          actorClientProfileId: null,
          branchId: session.user.branchId,
        });
        synced.push(log.localId);
      } catch (err) {
        conflicts.push({
          localId: log.localId,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    return NextResponse.json({
      data: {
        synced: synced.length,
        failed: conflicts.length,
        syncedIds: synced,
        conflicts,
      },
    });
  } catch (error) {
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
