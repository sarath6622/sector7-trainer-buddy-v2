import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import * as progressService from '@/services/progress.service';

/**
 * GET /api/trainer/clients/[id]/muscle-group-recency?excludeSessionId=X
 *
 * Returns the most recent date each curated muscle group was trained for this
 * client. Drives the "X days ago" hint on the muscle-group picker so the
 * trainer can see at a glance what's overdue when planning the session.
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
    const excludeSessionId = url.searchParams.get('excludeSessionId') ?? undefined;

    const data = await progressService.getMuscleGroupRecency({
      clientProfileId,
      branchId: session.user.branchId,
      excludeSessionId,
    });

    return NextResponse.json({ data });
  } catch (error) {
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
