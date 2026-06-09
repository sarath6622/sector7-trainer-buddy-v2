import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { createUserSchema, listUsersSchema } from '@/lib/validators';
import { toErrorResponse } from '@/lib/errors';
import * as userService from '@/services/user.service';
import type { UserRole } from '@prisma/client';

export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['SUPER_ADMIN', 'BRANCH_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const parsed = listUsersSchema.safeParse({
      role: searchParams.get('role') ?? undefined,
      page: searchParams.get('page') ?? undefined,
      pageSize: searchParams.get('pageSize') ?? undefined,
      search: searchParams.get('search') ?? undefined,
      status: searchParams.get('status') ?? undefined,
      attention: searchParams.get('attention') ?? undefined,
      trainerId: searchParams.get('trainerId') ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const result = await userService.getUsers({
      branchId: session.user.branchId,
      role: parsed.data.role as UserRole | undefined,
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
      search: parsed.data.search,
      status: parsed.data.status,
      attention: parsed.data.attention,
      trainerId: parsed.data.trainerId,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('[GET /api/admin/users] Error:', error);
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
    const parsed = createUserSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const user = await userService.createUser({
      ...parsed.data,
      branchId: session.user.branchId,
      actorId: session.user.id,
    });

    return NextResponse.json({ data: user }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/admin/users] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
