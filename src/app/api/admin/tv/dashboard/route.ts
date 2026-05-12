import { NextRequest, NextResponse } from 'next/server';
import { assertTvOrAdmin } from '@/lib/tv-auth';
import { toErrorResponse } from '@/lib/errors';
import { tvDashboardQuerySchema } from '@/lib/validators';
import * as tvDashboardService from '@/services/tv-dashboard.service';

export async function GET(request: NextRequest) {
  try {
    const ctx = await assertTvOrAdmin(request);
    const params = Object.fromEntries(request.nextUrl.searchParams);
    const parsed = tvDashboardQuerySchema.parse(params);

    const payload = await tvDashboardService.getTvDashboard({
      branchId: ctx.branchId,
      month: parsed.month,
    });

    return NextResponse.json({ data: payload });
  } catch (error) {
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
