import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import * as analyticsService from '@/services/analytics.service';
import { getLeaveBalanceAllTrainers } from '@/services/leave.service';

/**
 * GET /api/admin/analytics?report=<type>&month=YYYY-MM&trainerId=&clientId=
 *   OR ?report=<type>&startDate=ISO&endDate=ISO&trainerId=&clientId=
 *
 * Reports:
 *   - trainer-utilization
 *   - client-attendance
 *   - session-consumption
 *   - no-show-rate
 *   - revenue
 *   - leave-quota
 *   - crossfit-overview
 */
export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['SUPER_ADMIN', 'BRANCH_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const report = searchParams.get('report');
    const month = searchParams.get('month');
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');
    const trainerId = searchParams.get('trainerId') ?? undefined;
    const clientId = searchParams.get('clientId') ?? undefined;

    if (!report) {
      return NextResponse.json(
        { error: 'report is required', code: 'VALIDATION_ERROR' },
        { status: 400 },
      );
    }

    let dateRange: analyticsService.DateRange;
    let resolvedMonth: string | undefined;

    if (startDateParam && endDateParam) {
      const start = new Date(startDateParam);
      const end = new Date(endDateParam);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return NextResponse.json(
          { error: 'Invalid startDate or endDate', code: 'VALIDATION_ERROR' },
          { status: 400 },
        );
      }
      dateRange = { start, end };
    } else if (month && /^\d{4}-\d{2}$/.test(month)) {
      dateRange = analyticsService.getMonthRange(month);
      resolvedMonth = month;
    } else {
      return NextResponse.json(
        {
          error: 'Provide either month (YYYY-MM) or startDate + endDate',
          code: 'VALIDATION_ERROR',
        },
        { status: 400 },
      );
    }

    const branchId = session.user.branchId;

    switch (report) {
      case 'trainer-utilization': {
        const data = await analyticsService.getTrainerUtilization(branchId, dateRange, trainerId);
        return NextResponse.json({ data });
      }
      case 'client-attendance': {
        const data = await analyticsService.getClientAttendance(branchId, dateRange, clientId);
        return NextResponse.json({ data });
      }
      case 'session-consumption': {
        const data = await analyticsService.getSessionConsumption(branchId, dateRange);
        return NextResponse.json({ data });
      }
      case 'no-show-rate': {
        const data = await analyticsService.getNoShowRate(branchId, dateRange);
        return NextResponse.json({ data });
      }
      case 'revenue': {
        const data = await analyticsService.getRevenueOverview(branchId, dateRange);
        return NextResponse.json({ data });
      }
      case 'leave-quota': {
        // leave-quota still needs a month string — derive it from the range start
        const m =
          resolvedMonth ??
          `${dateRange.start.getFullYear()}-${String(dateRange.start.getMonth() + 1).padStart(2, '0')}`;
        const data = await getLeaveBalanceAllTrainers({ branchId, month: m });
        return NextResponse.json({ data });
      }
      case 'crossfit-overview': {
        const data = await analyticsService.getCrossfitAnalytics(branchId, dateRange);
        return NextResponse.json({ data });
      }
      default:
        return NextResponse.json(
          { error: `Unknown report type: ${report}`, code: 'VALIDATION_ERROR' },
          { status: 400 },
        );
    }
  } catch (error) {
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
