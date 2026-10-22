import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { updateClientMembershipSchema } from '@/lib/validators';
import { toErrorResponse } from '@/lib/errors';
import * as userService from '@/services/user.service';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/admin/users/[id]/membership — mark a client as left / reactivate (ADR-055)
 */
export async function PATCH(req: Request, { params }: RouteParams) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.roles, ['SUPER_ADMIN', 'BRANCH_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();
    const parsed = updateClientMembershipSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const result = await userService.updateClientMembership(
      id,
      parsed.data.isActive,
      session.user.branchId,
      session.user.id,
    );

    return NextResponse.json({ data: result });
  } catch (error) {
    console.error('[PATCH /api/admin/users/[id]/membership] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
