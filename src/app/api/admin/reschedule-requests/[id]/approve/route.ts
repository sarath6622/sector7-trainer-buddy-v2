import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { reviewRescheduleRequestSchema } from '@/lib/validators';
import * as rescheduleService from '@/services/reschedule.service';

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * PUT /api/admin/reschedule-requests/[id]/approve
 * Admin approves a reschedule request — updates the session to the new date/time.
 */
export async function PUT(req: Request, { params }: Params) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['SUPER_ADMIN', 'BRANCH_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const input = reviewRescheduleRequestSchema.parse(body);

    await rescheduleService.approveReschedule({
      id,
      branchId: session.user.branchId,
      actorId: session.user.id,
      reviewNotes: input.reviewNotes,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[PUT /api/admin/reschedule-requests/[id]/approve] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
