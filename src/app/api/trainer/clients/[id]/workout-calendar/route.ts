import { NextResponse } from 'next/server';
import { getServerSession, canReadClientTrainingData } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { workoutCalendarQuerySchema } from '@/lib/validators';
import * as workoutService from '@/services/workout.service';

/**
 * GET /api/trainer/clients/[id]/workout-calendar?month=YYYY-MM
 * Month grid of a client's completed PT days + PR days — the same data the
 * client sees on their own dashboard, exposed to the assigned trainer/admin.
 *
 * Auth: trainer/admin in branch, OR the client themselves (ADR-036).
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession();
    const { id: clientProfileId } = await params;
    if (!session || !canReadClientTrainingData(session.user, clientProfileId)) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
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
