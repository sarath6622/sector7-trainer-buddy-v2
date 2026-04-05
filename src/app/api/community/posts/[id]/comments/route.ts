import { NextRequest, NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { addComment } from '@/services/community.service';
import { z } from 'zod';

const addCommentSchema = z.object({
  content: z.string().min(1).max(500),
});

// POST /api/community/posts/[id]/comments — add a comment
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
    const { content } = addCommentSchema.parse(await req.json());

    const comment = await addComment({
      postId: id,
      branchId: session.user.branchId,
      clientProfileId: session.user.clientProfileId,
      content,
      actorId: session.user.id,
    });

    return NextResponse.json({ data: comment }, { status: 201 });
  } catch (error) {
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
