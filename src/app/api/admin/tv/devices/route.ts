import { NextRequest, NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { createTvDeviceSchema } from '@/lib/validators';
import * as tvDeviceService from '@/services/tv-device.service';

const ADMIN_ROLES = ['SUPER_ADMIN', 'BRANCH_ADMIN'];

export async function GET(_request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.roles ?? [session.user.role], ADMIN_ROLES)) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const devices = await tvDeviceService.listTvDevices(session.user.branchId);
    return NextResponse.json({ data: devices });
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
    const parsed = createTvDeviceSchema.parse(body);

    const result = await tvDeviceService.registerTvDevice({
      name: parsed.name,
      branchId: session.user.branchId,
      actorId: session.user.id,
    });

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
