import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { routineProgramInputSchema } from '@/lib/validators';
import * as routineService from '@/services/routine.service';

/**
 * GET /api/routine-programs/[id] — one program, fully nested (ADR-053).
 * Library: trainers + admins. Client copy: staff, or the owning client.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    }
    const { id } = await params;
    const data = await routineService.getProgram({
      programId: id,
      branchId: session.user.branchId,
      actor: routineService.toRoutineActor(session.user),
    });
    return NextResponse.json({ data });
  } catch (error) {
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}

/**
 * PUT /api/routine-programs/[id] — replace the whole nested document.
 * Library: trainers + admins. Client copy: admins, or a trainer with an
 * active package for that client.
 */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    }
    const { id } = await params;

    const parsed = routineProgramInputSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const data = await routineService.updateProgram({
      programId: id,
      input: parsed.data,
      branchId: session.user.branchId,
      actor: routineService.toRoutineActor(session.user),
    });
    return NextResponse.json({ data });
  } catch (error) {
    console.error('[PUT /api/routine-programs/[id]] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}

/** DELETE /api/routine-programs/[id] — soft-archive a library program. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    }
    const { id } = await params;
    const data = await routineService.archiveLibraryProgram({
      programId: id,
      branchId: session.user.branchId,
      actor: routineService.toRoutineActor(session.user),
    });
    return NextResponse.json({ data });
  } catch (error) {
    console.error('[DELETE /api/routine-programs/[id]] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
