import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { updateProgressSchema } from '@/lib/validators';
import * as progressService from '@/services/progress.service';

/**
 * PUT /api/client/progress/[id] — Client updates their own progress entry
 */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['CLIENT'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const { id: progressId } = await params;
    const body = await req.json();
    const input = updateProgressSchema.parse(body);

    const entry = await progressService.updateProgressEntry({
      progressId,
      actorId: session.user.id,
      branchId: session.user.branchId,
      ...input,
    });

    return NextResponse.json({ data: entry });
  } catch (error) {
    console.error('[PUT /api/client/progress/[id]] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
