import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import * as progressService from '@/services/progress.service';

/**
 * GET /api/trainer/clients/[id]/workout-history
 * Returns recent workout sessions (with exercises + sets) for a client.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession();
    if (
      !session ||
      !hasRole(session.user.role, ['TRAINER', 'KICKBOXING_TRAINER', 'SUPER_ADMIN', 'BRANCH_ADMIN'])
    ) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const { id: clientProfileId } = await params;
    const url = new URL(req.url);
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10), 1), 100) : 20;

    const data = await progressService.listWorkoutHistory({
      clientProfileId,
      branchId: session.user.branchId,
      limit,
    });

    return NextResponse.json({ data });
  } catch (error) {
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
