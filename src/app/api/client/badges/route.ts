import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { getUserBadges } from '@/services/badge.service';

export async function GET() {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['CLIENT'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const clientProfileId = session.user.clientProfileId;
    if (!clientProfileId) {
      return NextResponse.json({ error: 'No client profile', code: 'NO_PROFILE' }, { status: 400 });
    }

    const badges = await getUserBadges(clientProfileId, session.user.branchId);
    return NextResponse.json({ data: badges });
  } catch (error) {
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
