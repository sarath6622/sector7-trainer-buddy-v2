import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { listConflictsSchema } from '@/lib/validators';
import { toErrorResponse } from '@/lib/errors';
import * as sessionGenService from '@/services/session-generation.service';

export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['SUPER_ADMIN', 'BRANCH_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const parsed = listConflictsSchema.safeParse({
      date: searchParams.get('date') ?? undefined,
      trainerId: searchParams.get('trainerId') ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const result = await sessionGenService.detectConflicts(
      session.user.branchId,
      parsed.data.date,
      parsed.data.trainerId,
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error('[GET /api/admin/conflicts] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
