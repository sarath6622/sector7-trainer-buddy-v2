import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { applyLeaveSchema } from '@/lib/validators';
import * as leaveService from '@/services/leave.service';

/**
 * POST /api/trainer/leaves — Apply for leave
 */
export async function POST(req: Request) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['TRAINER', 'KICKBOXING_TRAINER'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const trainerProfileId = session.user.trainerProfileId;
    if (!trainerProfileId) {
      return NextResponse.json(
        { error: 'No trainer profile', code: 'NO_PROFILE' },
        { status: 400 },
      );
    }

    const body = await req.json();
    const input = applyLeaveSchema.parse(body);

    const leave = await leaveService.applyLeave({
      trainerProfileId,
      startDate: input.startDate,
      endDate: input.endDate,
      leaveType: input.leaveType,
      startTime: input.startTime,
      endTime: input.endTime,
      reason: input.reason,
      actorId: session.user.id,
      branchId: session.user.branchId,
    });

    return NextResponse.json({ data: leave }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/trainer/leaves] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}

/**
 * GET /api/trainer/leaves — Get own leave requests
 */
export async function GET() {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['TRAINER', 'KICKBOXING_TRAINER'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const trainerProfileId = session.user.trainerProfileId;
    if (!trainerProfileId) {
      return NextResponse.json(
        { error: 'No trainer profile', code: 'NO_PROFILE' },
        { status: 400 },
      );
    }

    const leaves = await leaveService.getTrainerLeaves({
      trainerProfileId,
      branchId: session.user.branchId,
    });

    return NextResponse.json({ data: leaves });
  } catch (error) {
    console.error('[GET /api/trainer/leaves] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
