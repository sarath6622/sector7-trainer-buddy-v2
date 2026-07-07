import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { progressChartSchema } from '@/lib/validators';
import * as progressService from '@/services/progress.service';

/**
 * GET /api/client/progress/charts — Get chart data for a metric
 */
export async function GET(req: Request) {
  try {
    const session = await requireRole(['CLIENT']);

    const clientProfileId = session.user.clientProfileId;
    if (!clientProfileId) {
      return NextResponse.json({ error: 'No client profile', code: 'NO_PROFILE' }, { status: 400 });
    }

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
    console.error('[GET /api/client/progress/charts] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
