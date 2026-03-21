import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { vacantTrainersSchema } from '@/lib/validators';
import * as reassignmentService from '@/services/reassignment.service';

/**
 * GET /api/admin/trainers/vacant — Find available trainers for a time slot
 */
export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['SUPER_ADMIN', 'BRANCH_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const input = vacantTrainersSchema.parse({
      date: searchParams.get('date'),
      startTime: searchParams.get('startTime'),
      endTime: searchParams.get('endTime'),
    });

    const trainers = await reassignmentService.getVacantTrainers({
      ...input,
      branchId: session.user.branchId,
    });

    return NextResponse.json({ data: trainers });
  } catch (error) {
    console.error('[GET /api/admin/trainers/vacant] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
