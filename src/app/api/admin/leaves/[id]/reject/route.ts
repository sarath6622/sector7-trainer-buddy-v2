import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { reviewLeaveSchema } from '@/lib/validators';
import * as leaveService from '@/services/leave.service';
import { triggerUserEvent } from '@/lib/pusher';

/**
 * PUT /api/admin/leaves/[id]/reject — Reject a leave request
 */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['SUPER_ADMIN', 'BRANCH_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();
    const input = reviewLeaveSchema.parse(body);

    const leave = await leaveService.reviewLeave({
      leaveId: id,
      status: 'REJECTED',
      notes: input.notes,
      actorId: session.user.id,
      branchId: session.user.branchId,
    });

    // Pusher: notify the trainer in real-time
    void triggerUserEvent(leave.trainer.user.id, 'LEAVE_STATUS_CHANGED', {
      leaveId: id,
      status: 'REJECTED',
      notes: input.notes ?? null,
    });

    return NextResponse.json({ data: leave });
  } catch (error) {
    console.error('[PUT /api/admin/leaves/[id]/reject] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
