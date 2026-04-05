import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { toggleBadgeDisplay } from '@/services/badge.service';
import { z } from 'zod';

const schema = z.object({ displayOnProfile: z.boolean() });

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['CLIENT'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const clientProfileId = session.user.clientProfileId;
    if (!clientProfileId) {
      return NextResponse.json({ error: 'No client profile', code: 'NO_PROFILE' }, { status: 400 });
    }

    const { id } = await params;
    const body = await req.json();
    const { displayOnProfile } = schema.parse(body);

    const updated = await toggleBadgeDisplay(id, clientProfileId, displayOnProfile);
    return NextResponse.json({ data: updated });
  } catch (error) {
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
