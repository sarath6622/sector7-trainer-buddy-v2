import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { getClientSessions } from '@/services/session.service';

export async function GET(req: Request) {
  try {
    const session = await requireRole(['CLIENT']);

    const clientProfileId = session.user.clientProfileId;
    if (!clientProfileId) {
      return NextResponse.json({ error: 'No client profile', code: 'NO_PROFILE' }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const month = searchParams.get('month') ?? undefined;

    const sessions = await getClientSessions({
      clientProfileId,
      branchId: session.user.branchId,
      month,
    });

    return NextResponse.json({ data: sessions });
  } catch (error) {
    console.error('[GET /api/client/sessions] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
