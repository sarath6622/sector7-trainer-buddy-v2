import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { editTrainerShiftApiSchema } from '@/lib/validators';
import { toErrorResponse } from '@/lib/errors';
import * as shiftService from '@/services/shift.service';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PUT(req: Request, { params }: RouteParams) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['SUPER_ADMIN', 'BRANCH_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();
    const parsed = editTrainerShiftApiSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const shift = await shiftService.editShift(id, session.user.branchId, session.user.id, {
      label: parsed.data.label,
      startTime: parsed.data.startTime,
      endTime: parsed.data.endTime,
      days: parsed.data.days,
      effectiveFrom: parsed.data.effectiveFrom,
    });

    return NextResponse.json({ data: shift });
  } catch (error) {
    console.error('[PUT /api/admin/shifts/[id]] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}

export async function DELETE(_req: Request, { params }: RouteParams) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['SUPER_ADMIN', 'BRANCH_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const { id } = await params;
    const result = await shiftService.deleteShift(id, session.user.branchId, session.user.id);
    return NextResponse.json({ data: result });
  } catch (error) {
    console.error('[DELETE /api/admin/shifts/[id]] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
