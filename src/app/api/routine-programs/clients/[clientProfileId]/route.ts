import { NextResponse } from 'next/server';
import { getServerSession, canReadClientTrainingData } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import * as routineService from '@/services/routine.service';

type Params = { params: Promise<{ clientProfileId: string }> };

/**
 * GET /api/routine-programs/clients/[clientProfileId] — the client's active
 * program copy plus the "Next up" rotation pointer, or null (ADR-053).
 * Staff, or the client reading their own program.
 */
export async function GET(_req: Request, { params }: Params) {
  try {
    const session = await getServerSession();
    const { clientProfileId } = await params;
    if (!session || !canReadClientTrainingData(session.user, clientProfileId)) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }
    const data = await routineService.getActiveClientProgram({
      clientProfileId,
      branchId: session.user.branchId,
    });
    return NextResponse.json({ data });
  } catch (error) {
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}

/** DELETE — unassign (deactivate) the client's active program. */
export async function DELETE(_req: Request, { params }: Params) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    }
    const { clientProfileId } = await params;
    const data = await routineService.unassignClientProgram({
      clientProfileId,
      branchId: session.user.branchId,
      actor: routineService.toRoutineActor(session.user),
    });
    return NextResponse.json({ data });
  } catch (error) {
    console.error('[DELETE /api/routine-programs/clients/[clientProfileId]] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
