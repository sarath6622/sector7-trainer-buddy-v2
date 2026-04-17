import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { listRescheduleRequestsSchema } from '@/lib/validators';
import * as rescheduleService from '@/services/reschedule.service';

/**
 * GET /api/admin/reschedule-requests
 * List all reschedule requests for this branch.
 * Filterable by status, clientId, trainerId, date range.
 */
export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['SUPER_ADMIN', 'BRANCH_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const parsed = listRescheduleRequestsSchema.safeParse({
      status: searchParams.get('status') ?? undefined,
      clientId: searchParams.get('clientId') ?? undefined,
      trainerId: searchParams.get('trainerId') ?? undefined,
      dateFrom: searchParams.get('dateFrom') ?? undefined,
      dateTo: searchParams.get('dateTo') ?? undefined,
      page: searchParams.get('page') ?? undefined,
      pageSize: searchParams.get('pageSize') ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const result = await rescheduleService.listRescheduleRequests({
      branchId: session.user.branchId,
      status: parsed.data.status,
      clientId: parsed.data.clientId,
      trainerProfileId: parsed.data.trainerId,
      dateFrom: parsed.data.dateFrom,
      dateTo: parsed.data.dateTo,
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('[GET /api/admin/reschedule-requests] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
