import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { toErrorResponse } from '@/lib/errors';

export async function GET() {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['SUPER_ADMIN', 'BRANCH_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const count = await prisma.leaveRequest.count({
      where: { branchId: session.user.branchId, status: 'PENDING' },
    });

    return NextResponse.json({ count });
  } catch (error) {
    console.error('[GET /api/admin/leaves/pending-count] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
