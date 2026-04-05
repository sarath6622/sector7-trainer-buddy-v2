import { NextRequest, NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { deletePost } from '@/services/community.service';

// DELETE /api/community/posts/[id] — post owner removes (hides) a post
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
    await deletePost({
      postId: id,
      branchId: session.user.branchId,
      actorClientProfileId: session.user.clientProfileId,
      actorId: session.user.id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
