import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse, AppError } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import * as progressService from '@/services/progress.service';

/**
 * GET /api/admin/users/[id]/workout-history — Recent workout sessions (admin view)
 * [id] is the User ID; we resolve it to clientProfileId internally.
 *
 * Mirrors GET /api/trainer/clients/[id]/workout-history so admins see the same
 * workout history (sessions + exercises + sets) that trainers do.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
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

    const url = new URL(req.url);
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10), 1), 100) : 20;

    const data = await progressService.listWorkoutHistory({
      clientProfileId: user.clientProfile.id,
      branchId,
      limit,
    });

    return NextResponse.json({ data });
  } catch (error) {
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
