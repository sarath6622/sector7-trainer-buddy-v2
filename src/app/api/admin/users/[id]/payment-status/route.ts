import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import * as userService from '@/services/user.service';
import { z } from 'zod';

const paymentStatusSchema = z.object({
  paymentStatus: z.enum(['PAID', 'PENDING']),
});

/**
 * PUT /api/admin/users/[id]/payment-status — Toggle client payment status
 */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['SUPER_ADMIN', 'BRANCH_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const { id: clientProfileId } = await params;
    const body = await req.json();
    const parsed = paymentStatusSchema.parse(body);

    const result = await userService.updatePaymentStatus(
      clientProfileId,
      parsed.paymentStatus,
      session.user.branchId,
      session.user.id,
    );

    return NextResponse.json({ data: result });
  } catch (error) {
    console.error('[PUT /api/admin/users/[id]/payment-status] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
