import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { generateSessionsSchema } from '@/lib/validators';
import { toErrorResponse } from '@/lib/errors';
import * as sessionGenService from '@/services/session-generation.service';

export async function POST(req: Request) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['SUPER_ADMIN', 'BRANCH_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const body = await req.json();
    const parsed = generateSessionsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const result = await sessionGenService.generateSessions({
      ...parsed.data,
      branchId: session.user.branchId,
      actorId: session.user.id,
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    console.error('[POST /api/admin/schedules/generate] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
