import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import * as progressService from '@/services/progress.service';

/**
 * GET /api/client/progress/exercises
 * Returns exercises the client has weight-based progression data for.
 */
export async function GET() {
  try {
    const session = await requireRole(['CLIENT']);

    const clientProfileId = session.user.clientProfileId;
    if (!clientProfileId) {
      return NextResponse.json({ error: 'No client profile', code: 'NO_PROFILE' }, { status: 400 });
    }

    const exercises = await progressService.listExercisesWithProgressData({
      clientProfileId,
      branchId: session.user.branchId,
    });

    return NextResponse.json({ data: exercises });
  } catch (error) {
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
