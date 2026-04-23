import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { createTrainerShiftApiSchema, listTrainerShiftsSchema } from '@/lib/validators';
import { toErrorResponse } from '@/lib/errors';
import * as shiftService from '@/services/shift.service';

export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['SUPER_ADMIN', 'BRANCH_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const parsed = listTrainerShiftsSchema.safeParse({
      trainerId: searchParams.get('trainerId') ?? undefined,
      includeScheduled: searchParams.get('includeScheduled') ?? undefined,
      includeExpired: searchParams.get('includeExpired') ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const shifts = await shiftService.listShifts(session.user.branchId, parsed.data.trainerId, {
      includeScheduled: parsed.data.includeScheduled,
      includeExpired: parsed.data.includeExpired,
    });

    return NextResponse.json({ data: shifts });
  } catch (error) {
    console.error('[GET /api/admin/shifts] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['SUPER_ADMIN', 'BRANCH_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const body = await req.json();
    const parsed = createTrainerShiftApiSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const shift = await shiftService.createShift({
      branchId: session.user.branchId,
      trainerProfileId: parsed.data.trainerProfileId,
      label: parsed.data.label,
      startTime: parsed.data.startTime,
      endTime: parsed.data.endTime,
      days: parsed.data.days,
      effectiveFrom: parsed.data.effectiveFrom,
      actorId: session.user.id,
    });

    return NextResponse.json({ data: shift }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/admin/shifts] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
