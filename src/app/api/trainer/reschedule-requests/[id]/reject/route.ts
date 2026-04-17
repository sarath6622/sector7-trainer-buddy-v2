import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse, AppError } from '@/lib/errors';
import { reviewRescheduleRequestSchema } from '@/lib/validators';
import * as rescheduleService from '@/services/reschedule.service';

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * PUT /api/trainer/reschedule-requests/[id]/reject
 * Trainer rejects a reschedule request for one of their own clients.
 * Guard: verifies the session's trainerProfileId matches the requesting trainer.
 */
export async function PUT(req: Request, { params }: Params) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['TRAINER'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const trainerProfileId = session.user.trainerProfileId;
    if (!trainerProfileId) {
      return NextResponse.json(
        { error: 'No trainer profile', code: 'NO_PROFILE' },
        { status: 400 },
      );
    }

    const { id } = await params;

    // Verify the request belongs to this trainer's client
    const request = await rescheduleService.getRescheduleRequestById(id, session.user.branchId);
    if (request.sessionInstance.trainer.id !== trainerProfileId) {
      throw new AppError('FORBIDDEN', 'This request is not for one of your clients.', 403);
    }

    const body = await req.json().catch(() => ({}));
    const input = reviewRescheduleRequestSchema.parse(body);

    await rescheduleService.rejectReschedule({
      id,
      branchId: session.user.branchId,
      actorId: session.user.id,
      reviewNotes: input.reviewNotes,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[PUT /api/trainer/reschedule-requests/[id]/reject] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
