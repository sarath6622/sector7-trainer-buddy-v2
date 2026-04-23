import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { createShiftSwapSchema, listShiftSwapsSchema } from '@/lib/validators';
import { toErrorResponse } from '@/lib/errors';
import * as shiftService from '@/services/shift.service';

export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['SUPER_ADMIN', 'BRANCH_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const parsed = listShiftSwapsSchema.safeParse({
      trainerId: searchParams.get('trainerId') ?? undefined,
      status: searchParams.get('status') ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const swaps = await shiftService.listShiftSwaps(session.user.branchId, {
      trainerId: parsed.data.trainerId,
      status: parsed.data.status,
    });

    return NextResponse.json({ data: swaps });
  } catch (error) {
    console.error('[GET /api/admin/shifts/swaps] Error:', error);
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
    const parsed = createShiftSwapSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const swap = await shiftService.createShiftSwap({
      branchId: session.user.branchId,
      trainerAProfileId: parsed.data.trainerAProfileId,
      trainerBProfileId: parsed.data.trainerBProfileId,
      swapFrom: parsed.data.swapFrom,
      swapUntil: parsed.data.swapUntil,
      notes: parsed.data.notes,
      actorId: session.user.id,
    });

    return NextResponse.json({ data: swap }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/admin/shifts/swaps] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
