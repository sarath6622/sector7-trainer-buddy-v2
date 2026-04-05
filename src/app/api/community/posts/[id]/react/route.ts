import { NextRequest, NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { toggleReaction } from '@/services/community.service';

// POST /api/community/posts/[id]/react — toggle praise reaction
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession();
    if (
      !session ||
      !hasRole(session.user.roles, ['CLIENT', 'TRAINER', 'BRANCH_ADMIN', 'SUPER_ADMIN'])
    ) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    if (!session.user.clientProfileId) {
      return NextResponse.json(
        { error: 'Client profile required', code: 'FORBIDDEN' },
        { status: 403 },
      );
    }

    const { id } = await params;
    const result = await toggleReaction({
      postId: id,
      branchId: session.user.branchId,
      clientProfileId: session.user.clientProfileId,
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
