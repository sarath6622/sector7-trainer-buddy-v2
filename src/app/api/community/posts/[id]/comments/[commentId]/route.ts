import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { deleteComment } from '@/services/community.service';

// DELETE /api/community/posts/[id]/comments/[commentId]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> },
) {
  try {
    const session = await requireRole(['CLIENT', 'TRAINER', 'BRANCH_ADMIN', 'SUPER_ADMIN'], {
      matchAllRoles: true,
    });

    if (!session.user.clientProfileId) {
      return NextResponse.json(
        { error: 'Client profile required', code: 'FORBIDDEN' },
        { status: 403 },
      );
    }

    const { commentId } = await params;
    await deleteComment({
      commentId,
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
