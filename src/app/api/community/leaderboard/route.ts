import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { getCompoundLeaderboard, getCompoundExercises } from '@/services/leaderboard.service';

// GET /api/community/leaderboard?exerciseId=<id>
// GET /api/community/leaderboard (no exerciseId) → returns list of compound exercises
export async function GET(req: NextRequest) {
  try {
    const session = await requireRole(['CLIENT', 'TRAINER', 'BRANCH_ADMIN', 'SUPER_ADMIN'], {
      matchAllRoles: true,
    });

    const { searchParams } = new URL(req.url);
    const exerciseId = searchParams.get('exerciseId');

    if (!exerciseId) {
      // Return compound exercises list for tab rendering
      const exercises = await getCompoundExercises();
      return NextResponse.json({ data: exercises });
    }

    const leaderboard = await getCompoundLeaderboard({
      branchId: session.user.branchId,
      exerciseId,
    });

    return NextResponse.json({ data: leaderboard });
  } catch (error) {
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
