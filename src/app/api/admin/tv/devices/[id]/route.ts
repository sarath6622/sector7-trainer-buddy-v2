import { NextRequest, NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import * as tvDeviceService from '@/services/tv-device.service';

const ADMIN_ROLES = ['SUPER_ADMIN', 'BRANCH_ADMIN'];

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.roles ?? [session.user.role], ADMIN_ROLES)) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const { id } = await params;
    const result = await tvDeviceService.revokeTvDevice({
      id,
      branchId: session.user.branchId,
      actorId: session.user.id,
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
