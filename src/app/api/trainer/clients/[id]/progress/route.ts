import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { createProgressSchema } from '@/lib/validators';
import * as progressService from '@/services/progress.service';

/**
 * POST /api/trainer/clients/[id]/progress — Create a progress entry for a client
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['TRAINER', 'KICKBOXING_TRAINER'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const { id: clientProfileId } = await params;
    const body = await req.json();
    const input = createProgressSchema.parse(body);

    const entry = await progressService.createProgressEntry({
      clientProfileId,
      recordedByUserId: session.user.id,
      branchId: session.user.branchId,
      ...input,
    });

    return NextResponse.json({ data: entry }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/trainer/clients/[id]/progress] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}

/**
 * GET /api/trainer/clients/[id]/progress — List progress entries for a client
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['TRAINER', 'KICKBOXING_TRAINER'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const { id: clientProfileId } = await params;

    const entries = await progressService.listProgressEntries({
      clientProfileId,
      branchId: session.user.branchId,
    });

    return NextResponse.json({ data: entries });
  } catch (error) {
    console.error('[GET /api/trainer/clients/[id]/progress] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
