import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import * as XLSX from 'xlsx';
import * as analyticsService from '@/services/analytics.service';
import { getMonthRange } from '@/services/analytics.service'; // DateRange conversion helper

/**
 * GET /api/admin/analytics/export?report=<type>&month=YYYY-MM
 * Returns an Excel (.xlsx) file download.
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

    if (!report || !month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json(
        { error: 'report and month (YYYY-MM) are required', code: 'VALIDATION_ERROR' },
        { status: 400 },
      );
    }

    const branchId = session.user.branchId;
    const range = getMonthRange(month);
    let sheetData: Record<string, unknown>[] = [];
    let sheetName = report;

    switch (report) {
      case 'trainer-utilization': {
        const data = await analyticsService.getTrainerUtilization(branchId, range);
        sheetData = data.map((d) => ({
          Trainer: d.trainerName,
          'Total Sessions': d.totalSessions,
          Completed: d.completedSessions,
          'Utilization %': d.utilizationPercent,
        }));
        sheetName = 'Trainer Utilization';
        break;
      }
      case 'client-attendance': {
        const data = await analyticsService.getClientAttendance(branchId, range);
        sheetData = data.map((d) => ({
          Client: d.clientName,
          'Total Sessions': d.totalSessions,
          Attended: d.attended,
          'No-Show': d.noShow,
          Cancelled: d.cancelled,
          'Attendance %': d.attendancePercent,
        }));
        sheetName = 'Client Attendance';
        break;
      }
      case 'session-consumption': {
        const data = await analyticsService.getSessionConsumption(branchId, range);
        sheetData = data.map((d) => ({
          Client: d.clientName,
          'Sessions/Month': d.sessionsPerMonth,
          Completed: d.completed,
          'No-Show': d.noShow,
          Scheduled: d.scheduled,
          Cancelled: d.cancelled,
          'Carry-Forward': d.carryForward,
          'Consumption %': d.consumptionPercent,
        }));
        sheetName = 'Session Consumption';
        break;
      }
      case 'no-show-rate': {
        const data = await analyticsService.getNoShowRate(branchId, range);
        sheetData = data.map((d) => ({
          Trainer: d.trainerName,
          'Total Sessions': d.totalSessions,
          'No-Shows': d.noShowCount,
          'No-Show %': d.noShowPercent,
        }));
        sheetName = 'No-Show Rate';
        break;
      }
      case 'revenue': {
        const data = await analyticsService.getRevenueOverview(branchId, range);
        sheetData = [
          {
            'Total Revenue': data.totalRevenue,
            'Paid Count': data.paidCount,
            'Pending Count': data.pendingCount,
            'Pending Amount': data.pendingAmount,
          },
          ...data.byMethod.map((m) => ({
            Method: m.method,
            Amount: m.amount,
            Count: m.count,
          })),
        ];
        sheetName = 'Revenue';
        break;
      }
      default:
        return NextResponse.json(
          { error: `Unknown report: ${report}`, code: 'VALIDATION_ERROR' },
          { status: 400 },
        );
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(sheetData);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${report}-${month}.xlsx"`,
      },
    });
  } catch (error) {
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
