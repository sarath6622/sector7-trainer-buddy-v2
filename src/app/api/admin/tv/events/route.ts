import { NextRequest, NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { createTvEventSchema } from '@/lib/validators';
import * as eventService from '@/services/tv-event.service';

const ADMIN_ROLES = ['SUPER_ADMIN', 'BRANCH_ADMIN'];

export async function GET() {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.roles ?? [session.user.role], ADMIN_ROLES)) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const rows = await eventService.listAllEvents(session.user.branchId);
    return NextResponse.json({ data: rows });
  } catch (error) {
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.roles ?? [session.user.role], ADMIN_ROLES)) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = createTvEventSchema.parse(body);

    const row = await eventService.createEvent({
      branchId: session.user.branchId,
      actorId: session.user.id,
      title: parsed.title,
      description: parsed.description ?? null,
      location: parsed.location ?? null,
      icon: parsed.icon ?? null,
      eventAt: new Date(parsed.eventAt),
      sortOrder: parsed.sortOrder,
      isActive: parsed.isActive,
    });

    return NextResponse.json({ data: row }, { status: 201 });
  } catch (error) {
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
