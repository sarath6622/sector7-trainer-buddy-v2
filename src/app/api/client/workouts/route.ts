import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { listClientWorkoutsSchema } from '@/lib/validators';
import * as workoutService from '@/services/workout.service';

export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['CLIENT'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const clientProfileId = session.user.clientProfileId;
    if (!clientProfileId) {
      return NextResponse.json({ error: 'No client profile', code: 'NO_PROFILE' }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const input = listClientWorkoutsSchema.parse({
      dateFrom: searchParams.get('dateFrom') ?? undefined,
      dateTo: searchParams.get('dateTo') ?? undefined,
      exerciseId: searchParams.get('exerciseId') ?? undefined,
      muscleGroup: searchParams.get('muscleGroup') ?? undefined,
    });

    const workouts = await workoutService.getClientWorkouts({
      clientProfileId,
      branchId: session.user.branchId,
      ...input,
    });

    return NextResponse.json({ data: workouts });
  } catch (error) {
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
