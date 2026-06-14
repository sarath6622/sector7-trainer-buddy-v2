import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { listRescheduleRequestsSchema } from '@/lib/validators';
import * as rescheduleService from '@/services/reschedule.service';

/**
 * GET /api/trainer/reschedule-requests
 * List reschedule requests for the authenticated trainer's clients only.
 */
export async function GET(req: Request) {
  try {
    const session = await requireRole(['TRAINER']);

    const trainerProfileId = session.user.trainerProfileId;
    if (!trainerProfileId) {
      return NextResponse.json(
        { error: 'No trainer profile', code: 'NO_PROFILE' },
        { status: 400 },
      );
    }

    const { searchParams } = new URL(req.url);
    const parsed = listRescheduleRequestsSchema.safeParse({
      status: searchParams.get('status') ?? undefined,
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
      trainerProfileId,
      status: parsed.data.status,
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('[GET /api/trainer/reschedule-requests] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
