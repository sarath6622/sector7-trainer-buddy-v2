import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { workoutCalendarQuerySchema } from '@/lib/validators';
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
    const { month } = workoutCalendarQuerySchema.parse({
      month: searchParams.get('month') ?? undefined,
    });

    const calendar = await workoutService.getWorkoutCalendar({
      clientProfileId,
      branchId: session.user.branchId,
      month,
    });

    return NextResponse.json({ data: calendar });
  } catch (error) {
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
