import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { assignRoutineProgramSchema } from '@/lib/validators';
import * as routineService from '@/services/routine.service';

/**
 * POST /api/routine-programs/[id]/assign — deep-copy a library program to a
 * client and deactivate their previous copy (ADR-053). Admins for any client
 * in the branch; trainers only for clients they hold an active package with.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    }
    const { id } = await params;

    const parsed = assignRoutineProgramSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const data = await routineService.assignProgram({
      programId: id,
      clientProfileId: parsed.data.clientProfileId,
      branchId: session.user.branchId,
      actor: routineService.toRoutineActor(session.user),
    });
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/routine-programs/[id]/assign] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
