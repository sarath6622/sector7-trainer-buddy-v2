import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { submitRescheduleRequestSchema, listRescheduleRequestsSchema } from '@/lib/validators';
import * as rescheduleService from '@/services/reschedule.service';

/**
 * POST /api/client/reschedule-requests
 * Client submits a request to reschedule one of their sessions.
 */
export async function POST(req: Request) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['CLIENT'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const clientProfileId = session.user.clientProfileId;
    if (!clientProfileId) {
      return NextResponse.json(
        { error: 'No client profile found', code: 'NO_PROFILE' },
        { status: 400 },
      );
    }

    const body = await req.json();
    const input = submitRescheduleRequestSchema.parse(body);

    const request = await rescheduleService.submitRescheduleRequest({
      branchId: session.user.branchId,
      sessionInstanceId: input.sessionInstanceId,
      clientProfileId,
      actorId: session.user.id,
      requestedDate: input.requestedDate,
      requestedTime: input.requestedTime,
      reason: input.reason,
    });

    return NextResponse.json({ data: request }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/client/reschedule-requests] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}

/**
 * GET /api/client/reschedule-requests
 * List the authenticated client's own reschedule request history.
 */
export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['CLIENT'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const clientProfileId = session.user.clientProfileId;
    if (!clientProfileId) {
      return NextResponse.json(
        { error: 'No client profile found', code: 'NO_PROFILE' },
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
      clientId: clientProfileId,
      status: parsed.data.status,
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('[GET /api/client/reschedule-requests] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
