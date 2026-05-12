import { NextRequest, NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { updateTvControlSchema } from '@/lib/validators';
import * as tvControlService from '@/services/tv-control.service';

const ADMIN_ROLES = ['SUPER_ADMIN', 'BRANCH_ADMIN'];

export async function GET(_request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.roles ?? [session.user.role], ADMIN_ROLES)) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const state = await tvControlService.getTvControlState(session.user.branchId);
    return NextResponse.json({ data: state });
  } catch (error) {
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.roles ?? [session.user.role], ADMIN_ROLES)) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = updateTvControlSchema.parse(body);

    const result = await tvControlService.updateTvControlState({
      branchId: session.user.branchId,
      actorId: session.user.id,
      pinnedPanel: parsed.pinnedPanel,
      shoutout: parsed.shoutout,
      shoutoutTtlSec: parsed.shoutoutTtlSec,
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
