import { NextResponse } from 'next/server';
import { getServerSession, canReadClientTrainingData } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import * as progressService from '@/services/progress.service';

/**
 * GET /api/trainer/clients/[id]/last-sets?exerciseIds=a,b,c&excludeSessionId=X
 *
 * Returns the most recent prior set for each requested exerciseId. Powers
 * placeholder hints in the workout logger so empty rows show "what they did
 * last time." `excludeSessionId` keeps the current in-progress session's
 * partial logs from shadowing the real progression reference.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession();
    const { id: clientProfileId } = await params;
    if (!session || !canReadClientTrainingData(session.user, clientProfileId)) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }
    const url = new URL(req.url);

    const idsParam = url.searchParams.get('exerciseIds') ?? '';
    const exerciseIds = idsParam
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (exerciseIds.length === 0) {
      return NextResponse.json({ data: [] });
    }

    const excludeSessionId = url.searchParams.get('excludeSessionId') ?? undefined;

    const data = await progressService.getLastSetsByExercise({
      clientProfileId,
      branchId: session.user.branchId,
      exerciseIds,
      excludeSessionId,
    });

    return NextResponse.json({ data });
  } catch (error) {
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
