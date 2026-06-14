import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { getSessionById } from '@/services/session.service';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    // 401 for no/expired session vs 403 for wrong role — lets the mobile client
    // tell "token expired → refresh & retry" from "logged in but not allowed".
    const session = await requireRole(['TRAINER', 'KICKBOXING_TRAINER']);

    const { id } = await params;
    const trainerProfileId = session.user.trainerProfileId;
    if (!trainerProfileId) {
      return NextResponse.json(
        { error: 'No trainer profile', code: 'NO_PROFILE' },
        { status: 400 },
      );
    }

    const instance = await getSessionById({
      sessionId: id,
      branchId: session.user.branchId,
      trainerProfileId,
    });

    return NextResponse.json({ data: instance });
  } catch (error) {
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
