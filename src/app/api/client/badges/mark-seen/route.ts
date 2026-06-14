import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { markBadgesSeen } from '@/services/badge.service';

export async function POST() {
  try {
    const session = await requireRole(['CLIENT']);

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
