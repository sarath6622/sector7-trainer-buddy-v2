import { NextResponse } from 'next/server';
import { getServerSession, canReadClientTrainingData } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { AppError } from '@/lib/errors';
import { getChartData } from '@/services/progress.service';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/trainer/clients/[id]/exercise-progress?exerciseId=xxx
 * Returns weight/duration progression for a client's exercise.
 *
 * Auth: trainer/admin in branch, OR the client themselves (ADR-036).
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession();
    const { id: clientProfileId } = await params;
    if (!session || !canReadClientTrainingData(session.user, clientProfileId)) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }
    const url = new URL(req.url);
    const exerciseId = url.searchParams.get('exerciseId');
    if (!exerciseId) {
      return NextResponse.json(
        { error: 'exerciseId is required', code: 'MISSING_PARAM' },
        { status: 400 },
      );
    }

    // Verify the client belongs to the same branch
    const client = await prisma.clientProfile.findFirst({
      where: { id: clientProfileId, branchId: session.user.branchId },
      select: { id: true },
    });
    if (!client) {
      throw new AppError('CLIENT_NOT_FOUND', 'Client not found', 404);
    }

    const data = await getChartData({
      clientProfileId,
      branchId: session.user.branchId,
      metric: 'exercise',
      exerciseId,
    });

    return NextResponse.json({ data });
  } catch (error) {
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
