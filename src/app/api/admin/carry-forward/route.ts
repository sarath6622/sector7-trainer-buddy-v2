import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import * as carryforwardService from '@/services/carryforward.service';

/**
 * GET /api/admin/carry-forward?month=2026-03
 * Returns session consumption summary per client for the given month.
 */
export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['SUPER_ADMIN', 'BRANCH_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const month = searchParams.get('month');

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json(
        { error: 'month query parameter required (YYYY-MM)', code: 'VALIDATION_ERROR' },
        { status: 400 },
      );
    }

    const data = await carryforwardService.getConsumptionSummary(session.user.branchId, month);

    return NextResponse.json({ data });
  } catch (error) {
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}

/**
 * POST /api/admin/carry-forward
 * Trigger month-end processing for a given month.
 * Body: { month: "2026-03" }
 */
export async function POST(req: Request) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['SUPER_ADMIN', 'BRANCH_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const body = await req.json();
    const month = body.month;

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json(
        { error: 'month is required (YYYY-MM)', code: 'VALIDATION_ERROR' },
        { status: 400 },
      );
    }

    const data = await carryforwardService.processMonthEnd(
      session.user.branchId,
      month,
      session.user.id,
    );

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
