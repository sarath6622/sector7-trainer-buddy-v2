import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { listLeavesSchema } from '@/lib/validators';
import * as leaveService from '@/services/leave.service';

/**
 * GET /api/admin/leaves — List leave requests with filters
 */
export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['SUPER_ADMIN', 'BRANCH_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const input = listLeavesSchema.parse({
      status: searchParams.get('status') || undefined,
      trainerId: searchParams.get('trainerId') || undefined,
      page: searchParams.get('page') || undefined,
      pageSize: searchParams.get('pageSize') || undefined,
    });

    const result = await leaveService.listLeaves({
      branchId: session.user.branchId,
      ...input,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('[GET /api/admin/leaves] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
