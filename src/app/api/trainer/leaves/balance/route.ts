import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { getLeaveBalance } from '@/services/leave.service';

/**
 * GET /api/trainer/leaves/balance?month=YYYY-MM
 * Returns the current trainer's leave quota usage for the given month (defaults to current month).
 */
export async function GET(req: Request) {
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

    const { searchParams } = new URL(req.url);
    const now = new Date();
    const month =
      searchParams.get('month') ??
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const balance = await getLeaveBalance({
      trainerProfileId,
      branchId: session.user.branchId,
      month,
    });

    return NextResponse.json({ data: balance });
  } catch (error) {
    console.error('[GET /api/trainer/leaves/balance] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
