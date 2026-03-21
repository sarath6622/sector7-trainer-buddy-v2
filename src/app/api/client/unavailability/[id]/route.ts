import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import * as unavailabilityService from '@/services/clientUnavailability.service';

/**
 * DELETE /api/client/unavailability/[id] — Remove an unavailability date
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
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
    const result = await unavailabilityService.removeUnavailability({
      unavailabilityId: id,
      clientProfileId,
      actorId: session.user.id,
      branchId: session.user.branchId,
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    console.error('[DELETE /api/client/unavailability/[id]] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
