import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { createExerciseSchema, listExercisesSchema } from '@/lib/validators';
import * as exerciseService from '@/services/exercise.service';

export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['TRAINER'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const input = listExercisesSchema.parse({
      search: searchParams.get('search') ?? undefined,
      muscleGroup: searchParams.get('muscleGroup') ?? undefined,
      category: searchParams.get('category') ?? undefined,
      page: searchParams.get('page') ?? 1,
      pageSize: searchParams.get('pageSize') ?? 20,
    });

    const result = await exerciseService.listExercises(input);
    return NextResponse.json(result);
  } catch (error) {
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['TRAINER'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const body = await req.json();
    const input = createExerciseSchema.parse(body);

    const exercise = await exerciseService.createExercise({
      ...input,
      actorId: session.user.id,
      branchId: session.user.branchId,
    });

    return NextResponse.json({ data: exercise }, { status: 201 });
  } catch (error) {
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
