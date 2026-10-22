import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { updateStaffAccessSchema } from '@/lib/validators';
import { toErrorResponse } from '@/lib/errors';
import * as staffService from '@/services/staff.service';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: Request, { params }: RouteParams) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.roles, ['SUPER_ADMIN', 'BRANCH_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();
    const parsed = updateStaffAccessSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const member = await staffService.updateStaffAccess({
      id,
      branchId: session.user.branchId,
      actorId: session.user.id,
      ...parsed.data,
    });

    return NextResponse.json({ data: member });
  } catch (error) {
    console.error('[PATCH /api/admin/staff/[id]] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
