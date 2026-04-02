import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import * as leaveService from '@/services/leave.service';

/**
 * GET /api/admin/leaves/balance?trainerProfileId=&month=YYYY-MM
 * Returns leave balance for a specific trainer (admin view).
 */
export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['SUPER_ADMIN', 'BRANCH_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const trainerProfileId = searchParams.get('trainerProfileId');
    if (!trainerProfileId) {
      return NextResponse.json(
        { error: 'trainerProfileId is required', code: 'VALIDATION' },
        { status: 400 },
      );
    }

    const now = new Date();
    const month =
      searchParams.get('month') ??
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const balance = await leaveService.getLeaveBalance({
      trainerProfileId,
      branchId: session.user.branchId,
      month,
    });

    return NextResponse.json({ data: balance });
  } catch (error) {
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
