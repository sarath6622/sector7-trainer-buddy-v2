import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { AppError } from '@/lib/errors';
import { getUserBadges } from '@/services/badge.service';
import { prisma } from '@/lib/prisma';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['SUPER_ADMIN', 'BRANCH_ADMIN', 'TRAINER'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const { id: userId } = await params;
    const branchId = session.user.branchId;

    // Resolve userId → clientProfileId
    const user = await prisma.user.findFirst({
      where: { id: userId, branchId, deletedAt: null },
      select: { clientProfile: { select: { id: true } } },
    });

    if (!user?.clientProfile) {
      throw new AppError('NOT_FOUND', 'Client profile not found for this user', 404);
    }

    const badges = await getUserBadges(user.clientProfile.id, branchId);
    return NextResponse.json({ data: badges });
  } catch (error) {
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
