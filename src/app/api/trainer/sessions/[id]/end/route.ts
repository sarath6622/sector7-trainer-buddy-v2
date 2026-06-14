import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { endSession } from '@/services/session.service';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    // 401 for no/expired session vs 403 for wrong role — lets the mobile client
    // tell "token expired → refresh & retry" from "logged in but not allowed".
    const session = await requireRole(['TRAINER', 'KICKBOXING_TRAINER']);

    const trainerProfileId = session.user.trainerProfileId;
    if (!trainerProfileId) {
      return NextResponse.json(
        { error: 'No trainer profile', code: 'NO_PROFILE' },
        { status: 400 },
      );
    }

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const notes = typeof body.notes === 'string' ? body.notes.slice(0, 1000) : undefined;

    const result = await endSession({
      sessionId: id,
      trainerProfileId,
      actorId: session.user.id,
      branchId: session.user.branchId,
      notes,
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
