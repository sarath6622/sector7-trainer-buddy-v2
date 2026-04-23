import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import * as shiftService from '@/services/shift.service';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** PUT /api/admin/shifts/swaps/[id] — approve or cancel a swap */
export async function PUT(req: Request, { params }: RouteParams) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['SUPER_ADMIN', 'BRANCH_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const { id } = await params;
    const body = (await req.json()) as { action: string };
    const { action } = body;

    if (action !== 'approve' && action !== 'cancel') {
      return NextResponse.json(
        { error: 'action must be "approve" or "cancel"', code: 'VALIDATION_ERROR' },
        { status: 400 },
      );
    }

    const swap =
      action === 'approve'
        ? await shiftService.approveShiftSwap(id, session.user.branchId, session.user.id)
        : await shiftService.cancelShiftSwap(id, session.user.branchId, session.user.id);

    return NextResponse.json({ data: swap });
  } catch (error) {
    console.error('[PUT /api/admin/shifts/swaps/[id]] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
