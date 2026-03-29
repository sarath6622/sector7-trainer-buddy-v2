import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { progressChartSchema } from '@/lib/validators';
import * as progressService from '@/services/progress.service';

/**
 * GET /api/trainer/clients/[id]/progress/charts
 * Trainer-accessible chart data for a specific client.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession();
    if (
      !session ||
      !hasRole(session.user.role, ['TRAINER', 'KICKBOXING_TRAINER', 'SUPER_ADMIN', 'BRANCH_ADMIN'])
    ) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const { id: clientProfileId } = await params;
    const url = new URL(req.url);
    const input = progressChartSchema.parse({
      metric: url.searchParams.get('metric'),
      exerciseId: url.searchParams.get('exerciseId') || undefined,
    });

    const chartData = await progressService.getChartData({
      clientProfileId,
      branchId: session.user.branchId,
      metric: input.metric,
      exerciseId: input.exerciseId,
    });

    return NextResponse.json({ data: chartData });
  } catch (error) {
    console.error('[GET /api/trainer/clients/[id]/progress/charts] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
