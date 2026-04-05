import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { createBadgeDefinitionSchema, listBadgeDefinitionsSchema } from '@/lib/validators';
import { createBadgeDefinition, listBadgeDefinitions } from '@/services/badge.service';

export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['SUPER_ADMIN', 'BRANCH_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const parsed = listBadgeDefinitionsSchema.safeParse({
      page: searchParams.get('page') ?? undefined,
      pageSize: searchParams.get('pageSize') ?? undefined,
      type: searchParams.get('type') ?? undefined,
      search: searchParams.get('search') ?? undefined,
      genderFilter: searchParams.get('genderFilter') ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const result = await listBadgeDefinitions(parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    console.error('[GET /api/admin/badges] Error:', error);
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
    const parsed = createBadgeDefinitionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const badge = await createBadgeDefinition(parsed.data, session.user.id);
    return NextResponse.json({ data: badge }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/admin/badges] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
