import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { createCrossfitClassSchema } from '@/lib/validators';
import * as crossfitService from '@/services/crossfit.service';

export async function GET() {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['SUPER_ADMIN', 'BRANCH_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const data = await crossfitService.getCrossfitClasses(session.user.branchId);
    return NextResponse.json({ data });
  } catch (error) {
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['SUPER_ADMIN', 'BRANCH_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const body = await req.json();
    const input = createCrossfitClassSchema.parse(body);

    const data = await crossfitService.createCrossfitClass({
      ...input,
      branchId: session.user.branchId,
      actorId: session.user.id,
    });

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
