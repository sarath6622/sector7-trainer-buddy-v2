import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import {
  createKickboxingEnrollmentSchema,
  listKickboxingEnrollmentsSchema,
} from '@/lib/validators';
import * as kickboxingService from '@/services/kickboxing.service';

export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['SUPER_ADMIN', 'BRANCH_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const input = listKickboxingEnrollmentsSchema.parse({
      classId: searchParams.get('classId') ?? undefined,
      clientType: searchParams.get('clientType') ?? undefined,
    });

    const data = await kickboxingService.getKickboxingEnrollments({
      branchId: session.user.branchId,
      ...input,
    });

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
    const input = createKickboxingEnrollmentSchema.parse(body);

    const data = await kickboxingService.createKickboxingEnrollment({
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
