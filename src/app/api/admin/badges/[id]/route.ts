import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { updateBadgeDefinitionSchema } from '@/lib/validators';
import {
  getBadgeDefinitionById,
  updateBadgeDefinition,
  deleteBadgeDefinition,
} from '@/services/badge.service';

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
    const badge = await getBadgeDefinitionById(id);
    return NextResponse.json({ data: badge });
  } catch (error) {
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
    const parsed = updateBadgeDefinitionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const updated = await updateBadgeDefinition(id, parsed.data, session.user.id);
    return NextResponse.json({ data: updated });
  } catch (error) {
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
    const result = await deleteBadgeDefinition(id, session.user.id);
    return NextResponse.json({ data: result });
  } catch (error) {
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
