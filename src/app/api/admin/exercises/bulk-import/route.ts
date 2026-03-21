import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { bulkImportExercisesSchema } from '@/lib/validators';
import * as exerciseService from '@/services/exercise.service';

export async function POST(req: Request) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['SUPER_ADMIN', 'BRANCH_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const body = await req.json();
    const input = bulkImportExercisesSchema.parse(body);

    const result = await exerciseService.bulkImportExercises({
      exercises: input.exercises,
      actorId: session.user.id,
      branchId: session.user.branchId,
    });

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
