import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { createTrainerScheduleSchema } from '@/lib/validators';
import * as scheduleService from '@/services/schedule.service';
import type { DayOfWeek } from '@prisma/client';

/**
 * POST /api/trainer/schedules
 * Trainer creates a recurring schedule for one of their assigned clients.
 * Enforces: active PtPackage, working-day/hour bounds, conflict detection.
 */
export async function POST(req: Request) {
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

    const body = await req.json();
    const input = createTrainerScheduleSchema.parse(body);

    const schedule = await scheduleService.createScheduleByTrainer({
      branchId: session.user.branchId,
      clientProfileId: input.clientProfileId,
      trainerProfileId,
      actorId: session.user.id,
      dayOfWeek: input.dayOfWeek as DayOfWeek,
      startTime: input.startTime,
      durationMin: input.durationMin,
      validFrom: input.validFrom,
      validUntil: input.validUntil,
    });

    return NextResponse.json({ data: schedule }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/trainer/schedules] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}

/**
 * GET /api/trainer/schedules
 * List all recurring schedules for the authenticated trainer.
 */
export async function GET(req: Request) {
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

    // Optional: filter by clientId
    const { searchParams } = new URL(req.url);
    const clientId = searchParams.get('clientId') ?? undefined;

    const result = clientId
      ? await scheduleService.getSchedules({
          branchId: session.user.branchId,
          trainerId: trainerProfileId,
          clientId,
        })
      : await scheduleService.getTrainerOwnSchedules(trainerProfileId, session.user.branchId);

    return NextResponse.json(result);
  } catch (error) {
    console.error('[GET /api/trainer/schedules] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
