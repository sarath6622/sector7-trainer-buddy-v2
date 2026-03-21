import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import * as leaveService from '@/services/leave.service';

/**
 * GET /api/admin/leaves/[id] — Get leave request with affected clients
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['SUPER_ADMIN', 'BRANCH_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const { id } = await params;
    const leave = await leaveService.getLeaveById({
      leaveId: id,
      branchId: session.user.branchId,
    });

    return NextResponse.json({ data: leave });
  } catch (error) {
    console.error('[GET /api/admin/leaves/[id]] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
