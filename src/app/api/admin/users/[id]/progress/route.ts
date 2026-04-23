import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { AppError } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import * as progressService from '@/services/progress.service';

/**
 * GET /api/admin/users/[id]/progress — List progress entries for a client (admin view)
 * [id] is the User ID; we resolve it to clientProfileId internally.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['SUPER_ADMIN', 'BRANCH_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const { id: userId } = await params;
    const branchId = session.user.branchId;

    const user = await prisma.user.findFirst({
      where: { id: userId, branchId, deletedAt: null },
      select: { clientProfile: { select: { id: true } } },
    });

    if (!user?.clientProfile) {
      throw new AppError('NOT_FOUND', 'Client profile not found for this user', 404);
    }

    const entries = await progressService.listProgressEntries({
      clientProfileId: user.clientProfile.id,
      branchId,
    });

    return NextResponse.json({ data: entries });
  } catch (error) {
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
