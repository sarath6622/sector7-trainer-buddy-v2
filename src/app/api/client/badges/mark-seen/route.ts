import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { markBadgesSeen } from '@/services/badge.service';

export async function POST() {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['CLIENT'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const clientProfileId = session.user.clientProfileId;
    if (!clientProfileId) {
      return NextResponse.json({ error: 'No client profile', code: 'NO_PROFILE' }, { status: 400 });
    }

    await markBadgesSeen(clientProfileId, session.user.branchId);
    return NextResponse.json({ success: true });
  } catch (error) {
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
