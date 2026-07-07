import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { getFeed } from '@/services/community.service';

// GET /api/community/feed?cursor=<id>&limit=20
export async function GET(req: NextRequest) {
  try {
    const session = await requireRole(['CLIENT', 'TRAINER', 'BRANCH_ADMIN', 'SUPER_ADMIN'], {
      matchAllRoles: true,
    });

    const { searchParams } = new URL(req.url);
    const cursor = searchParams.get('cursor') ?? undefined;
    const limit = Math.min(Number(searchParams.get('limit') ?? 20), 50);

    const result = await getFeed({ branchId: session.user.branchId, cursor, limit });

    return NextResponse.json({ data: result });
  } catch (error) {
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
