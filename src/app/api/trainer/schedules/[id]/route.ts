import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { updateTrainerScheduleSchema } from '@/lib/validators';
import * as scheduleService from '@/services/schedule.service';

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * PUT /api/trainer/schedules/[id]
 * Update a trainer-owned schedule (day, time, duration, validity window).
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
    const body = await req.json();
    const input = updateTrainerScheduleSchema.parse(body);

    // Verify the schedule belongs to this trainer before updating
    const existing = await scheduleService.getScheduleById(id, session.user.branchId);
    if (existing.trainerProfileId !== trainerProfileId) {
      return NextResponse.json(
        { error: 'You can only update your own schedules.', code: 'FORBIDDEN' },
        { status: 403 },
      );
    }

    const updated = await scheduleService.updateSchedule(
      id,
      session.user.branchId,
      session.user.id,
      input,
    );

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error('[PUT /api/trainer/schedules/[id]] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}

/**
 * DELETE /api/trainer/schedules/[id]
 * Deactivate a trainer-owned schedule.
 */
export async function DELETE(req: Request, { params }: Params) {
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

    await scheduleService.deleteTrainerSchedule(
      id,
      session.user.branchId,
      trainerProfileId,
      session.user.id,
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[DELETE /api/trainer/schedules/[id]] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
