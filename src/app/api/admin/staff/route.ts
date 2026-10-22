import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import * as staffService from '@/services/staff.service';

export async function GET() {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.roles, ['SUPER_ADMIN', 'BRANCH_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const result = await staffService.listStaff(session.user.branchId);
    return NextResponse.json(result);
  } catch (error) {
    console.error('[GET /api/admin/staff] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
