import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { getVacantTrainers } from '@/services/reassignment.service';

/**
 * GET /api/admin/reassignments/vacant-trainers
 * Query: date=YYYY-MM-DD, startTime=HH:MM, endTime=HH:MM
 * Returns trainers who are free for the given slot.
 */
export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['SUPER_ADMIN', 'BRANCH_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date');
    const startTime = searchParams.get('startTime');
    const endTime = searchParams.get('endTime');

    if (!date || !startTime || !endTime) {
      return NextResponse.json(
        { error: 'date, startTime, and endTime are required', code: 'VALIDATION_ERROR' },
        { status: 400 },
      );
    }

    const trainers = await getVacantTrainers({
      date,
      startTime,
      endTime,
      branchId: session.user.branchId,
    });

    return NextResponse.json({
      data: trainers.map((t) => ({
        id: t.id,
        firstName: t.user.firstName,
        lastName: t.user.lastName,
      })),
    });
  } catch (error) {
    console.error('[GET /api/admin/reassignments/vacant-trainers] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
