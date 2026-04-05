import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { openCrossfitSessionSchema } from '@/lib/validators';
import * as crossfitService from '@/services/crossfit.service';

export async function POST(req: Request) {
  try {
    const session = await getServerSession();
    if (
      !session ||
      !hasRole(session.user.roles, ['CROSSFIT_TRAINER', 'SUPER_ADMIN', 'BRANCH_ADMIN'])
    ) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const body = await req.json();
    const input = openCrossfitSessionSchema.parse(body);

    const data = await crossfitService.getOrCreateCrossfitSession(
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
