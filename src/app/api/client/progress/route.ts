import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { createProgressSchema } from '@/lib/validators';
import * as progressService from '@/services/progress.service';

/**
 * POST /api/client/progress — Create own progress entry
 */
export async function POST(req: Request) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['CLIENT'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const clientProfileId = session.user.clientProfileId;
    if (!clientProfileId) {
      return NextResponse.json({ error: 'No client profile', code: 'NO_PROFILE' }, { status: 400 });
    }

    const body = await req.json();
    const input = createProgressSchema.parse(body);

    const { entry, newBadges } = await progressService.createProgressEntry({
      clientProfileId,
      recordedByUserId: session.user.id,
      branchId: session.user.branchId,
      ...input,
    });

    return NextResponse.json({ data: entry, newBadges }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/client/progress] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}

/**
 * GET /api/client/progress — Get own progress entries
 */
export async function GET() {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['CLIENT'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const clientProfileId = session.user.clientProfileId;
    if (!clientProfileId) {
      return NextResponse.json({ error: 'No client profile', code: 'NO_PROFILE' }, { status: 400 });
    }

    const entries = await progressService.listProgressEntries({
      clientProfileId,
      branchId: session.user.branchId,
    });

    return NextResponse.json({ data: entries });
  } catch (error) {
    console.error('[GET /api/client/progress] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
