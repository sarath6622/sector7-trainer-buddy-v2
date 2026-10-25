import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { routineProgramInputSchema } from '@/lib/validators';
import * as routineService from '@/services/routine.service';

/**
 * GET /api/routine-programs — library programs (ADR-053). Trainers + admins.
 * ?includeArchived=true also returns archived programs.
 * ?detail=true returns non-archived programs fully nested (ProgramDetail[]),
 * optionally capped with ?limit=N.
 */
export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    }
    const actor = routineService.toRoutineActor(session.user);
    if (!routineService.isRoutineStaff(actor.roles)) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const url = new URL(req.url);
    if (url.searchParams.get('detail') === 'true') {
      const limit = Number(url.searchParams.get('limit'));
      const data = await routineService.listLibraryProgramDetails({
        branchId: session.user.branchId,
        take: Number.isInteger(limit) && limit > 0 ? Math.min(limit, 50) : undefined,
      });
      return NextResponse.json({ data });
    }
    const data = await routineService.listLibraryPrograms({
      branchId: session.user.branchId,
      includeArchived: url.searchParams.get('includeArchived') === 'true',
    });
    return NextResponse.json({ data });
  } catch (error) {
    console.error('[GET /api/routine-programs] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}

/** POST /api/routine-programs — create a library program. Trainers + admins. */
export async function POST(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    }

    const parsed = routineProgramInputSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const data = await routineService.createLibraryProgram({
      input: parsed.data,
      branchId: session.user.branchId,
      actor: routineService.toRoutineActor(session.user),
    });
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/routine-programs] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
