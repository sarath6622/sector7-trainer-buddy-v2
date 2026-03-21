import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { listExercisesSchema } from '@/lib/validators';
import * as exerciseService from '@/services/exercise.service';

/**
 * Public exercise search — accessible to all authenticated users (trainers use this during workout logging)
 */
export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
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
