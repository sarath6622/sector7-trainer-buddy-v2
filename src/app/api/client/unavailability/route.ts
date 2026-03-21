import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { createUnavailabilitySchema } from '@/lib/validators';
import * as unavailabilityService from '@/services/clientUnavailability.service';

/**
 * POST /api/client/unavailability — Mark dates as unavailable
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
    const input = createUnavailabilitySchema.parse(body);

    const records = await unavailabilityService.markUnavailable({
      clientProfileId,
      dates: input.dates,
      actorId: session.user.id,
      branchId: session.user.branchId,
    });

    return NextResponse.json({ data: records }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/client/unavailability] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}

/**
 * GET /api/client/unavailability — List own unavailability dates
 */
export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['CLIENT'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const clientProfileId = session.user.clientProfileId;
    if (!clientProfileId) {
      return NextResponse.json({ error: 'No client profile', code: 'NO_PROFILE' }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const month = searchParams.get('month') || undefined;

    const records = await unavailabilityService.listUnavailability({
      clientProfileId,
      branchId: session.user.branchId,
      month,
    });

    return NextResponse.json({ data: records });
  } catch (error) {
    console.error('[GET /api/client/unavailability] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
