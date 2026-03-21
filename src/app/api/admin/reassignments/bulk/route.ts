import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { bulkReassignmentSchema } from '@/lib/validators';
import * as reassignmentService from '@/services/reassignment.service';

/**
 * POST /api/admin/reassignments/bulk — Bulk reassign sessions
 */
export async function POST(req: Request) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['SUPER_ADMIN', 'BRANCH_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const body = await req.json();
    const input = bulkReassignmentSchema.parse(body);

    const reassignments = await reassignmentService.bulkReassign({
      ...input,
      actorId: session.user.id,
      branchId: session.user.branchId,
    });

    return NextResponse.json({ data: reassignments }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/admin/reassignments/bulk] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
