import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import * as crossfitService from '@/services/crossfit.service';

export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    if (
      !session ||
      !hasRole(session.user.roles, ['CROSSFIT_TRAINER', 'SUPER_ADMIN', 'BRANCH_ADMIN'])
    ) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q') ?? '';
    const classId = searchParams.get('classId') ?? undefined;

    if (q.length < 2) {
      return NextResponse.json({ data: [] });
    }

    const data = await crossfitService.searchCrossfitClients(q, session.user.branchId, classId);
    return NextResponse.json({ data });
  } catch (error) {
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
