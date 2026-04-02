import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import * as analyticsService from '@/services/analytics.service';
import { getLeaveBalanceAllTrainers } from '@/services/leave.service';

/**
 * GET /api/admin/analytics?report=<type>&month=YYYY-MM&trainerId=&clientId=
 *
 * Reports:
 *   - trainer-utilization
 *   - client-attendance
 *   - session-consumption
 *   - no-show-rate
 *   - revenue
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
    const trainerId = searchParams.get('trainerId') ?? undefined;
    const clientId = searchParams.get('clientId') ?? undefined;

    if (!report || !month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json(
        { error: 'report and month (YYYY-MM) are required', code: 'VALIDATION_ERROR' },
        { status: 400 },
      );
    }

    const branchId = session.user.branchId;

    switch (report) {
      case 'trainer-utilization': {
        const data = await analyticsService.getTrainerUtilization(branchId, month, trainerId);
        return NextResponse.json({ data });
      }
      case 'client-attendance': {
        const data = await analyticsService.getClientAttendance(branchId, month, clientId);
        return NextResponse.json({ data });
      }
      case 'session-consumption': {
        const data = await analyticsService.getSessionConsumption(branchId, month);
        return NextResponse.json({ data });
      }
      case 'no-show-rate': {
        const data = await analyticsService.getNoShowRate(branchId, month);
        return NextResponse.json({ data });
      }
      case 'revenue': {
        const data = await analyticsService.getRevenueOverview(branchId, month);
        return NextResponse.json({ data });
      }
      case 'leave-quota': {
        const data = await getLeaveBalanceAllTrainers({ branchId, month });
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
