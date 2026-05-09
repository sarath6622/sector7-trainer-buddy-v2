import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import * as progressService from '@/services/progress.service';
import { CURATED_MUSCLE_GROUPS, type CuratedMuscleGroupId } from '@/lib/muscle-groups';

const VALID_IDS = new Set<string>(CURATED_MUSCLE_GROUPS.map((g) => g.id));

/**
 * GET /api/trainer/clients/[id]/recent-exercises-by-muscle?groups=chest,legs&perGroup=5
 *
 * Powers the "today's focus" picker on the active session screen. Returns the
 * top N exercises this client has recently performed in each curated muscle
 * group, with the most recent set attached as a progression hint.
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

    const groupsParam = url.searchParams.get('groups') ?? '';
    const curatedGroupIds = groupsParam
      .split(',')
      .map((s) => s.trim())
      .filter((s) => VALID_IDS.has(s)) as CuratedMuscleGroupId[];

    if (curatedGroupIds.length === 0) {
      return NextResponse.json(
        { error: 'At least one valid muscle group is required', code: 'INVALID_INPUT' },
        { status: 400 },
      );
    }

    const perGroupParam = url.searchParams.get('perGroup');
    const perGroup = perGroupParam ? Math.min(Math.max(parseInt(perGroupParam, 10), 1), 20) : 5;

    const data = await progressService.getRecentExercisesByMuscleGroup({
      clientProfileId,
      branchId: session.user.branchId,
      curatedGroupIds,
      perGroup,
    });

    return NextResponse.json({ data });
  } catch (error) {
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
