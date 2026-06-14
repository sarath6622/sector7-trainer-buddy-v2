import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { getUserBadges } from '@/services/badge.service';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole(['TRAINER', 'SUPER_ADMIN', 'BRANCH_ADMIN']);

    const { id: clientProfileId } = await params;
    const badges = await getUserBadges(clientProfileId, session.user.branchId);
    return NextResponse.json({ data: badges });
  } catch (error) {
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
