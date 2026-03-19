import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { updateUserSchema } from '@/lib/validators';
import { toErrorResponse } from '@/lib/errors';
import * as userService from '@/services/user.service';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, { params }: RouteParams) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['SUPER_ADMIN', 'BRANCH_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const { id } = await params;
    const user = await userService.getUserById(id, session.user.branchId);
    return NextResponse.json({ data: user });
  } catch (error) {
    console.error('[GET /api/admin/users/[id]] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}

export async function PUT(req: Request, { params }: RouteParams) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['SUPER_ADMIN', 'BRANCH_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();
    const parsed = updateUserSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const user = await userService.updateUser(
      id,
      parsed.data,
      session.user.branchId,
      session.user.id,
    );

    return NextResponse.json({ data: user });
  } catch (error) {
    console.error('[PUT /api/admin/users/[id]] Error:', error);
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
    const result = await userService.deleteUser(id, session.user.branchId, session.user.id);
    return NextResponse.json({ data: result });
  } catch (error) {
    console.error('[DELETE /api/admin/users/[id]] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
