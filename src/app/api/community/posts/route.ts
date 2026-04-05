import { NextRequest, NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { createPost } from '@/services/community.service';
import { z } from 'zod';

const createPostSchema = z.object({
  content: z.string().max(500).optional(),
  exerciseId: z.string().optional(),
  weightKg: z.number().positive().optional(),
  reps: z.number().int().positive().optional(),
});

// POST /api/community/posts — client creates a post
export async function POST(req: NextRequest) {
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

    const body = createPostSchema.parse(await req.json());

    const post = await createPost({
      branchId: session.user.branchId,
      clientProfileId: session.user.clientProfileId,
      actorId: session.user.id,
      ...body,
    });

    return NextResponse.json({ data: post }, { status: 201 });
  } catch (error) {
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
