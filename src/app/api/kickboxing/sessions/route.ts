import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { openKickboxingSessionSchema } from '@/lib/validators';
import * as kickboxingService from '@/services/kickboxing.service';

export async function POST(req: Request) {
  try {
    const session = await getServerSession();
    if (
      !session ||
      !hasRole(session.user.roles, ['KICKBOXING_TRAINER', 'TRAINER', 'SUPER_ADMIN', 'BRANCH_ADMIN'])
    ) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const body = await req.json();
    const parsed = openKickboxingSessionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const input = parsed.data;

    const data = await kickboxingService.getOrCreateKickboxingSession(
      input.classId,
      new Date(input.date),
      session.user.branchId,
      session.user.id,
    );

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
