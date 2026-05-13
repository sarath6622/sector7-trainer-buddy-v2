import { NextRequest, NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { updateTvEventSchema } from '@/lib/validators';
import * as eventService from '@/services/tv-event.service';

const ADMIN_ROLES = ['SUPER_ADMIN', 'BRANCH_ADMIN'];

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.roles ?? [session.user.role], ADMIN_ROLES)) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const parsed = updateTvEventSchema.parse(body);

    const row = await eventService.updateEvent({
      id,
      branchId: session.user.branchId,
      actorId: session.user.id,
      title: parsed.title,
      description: parsed.description,
      location: parsed.location,
      icon: parsed.icon,
      eventAt: parsed.eventAt ? new Date(parsed.eventAt) : undefined,
      sortOrder: parsed.sortOrder,
      isActive: parsed.isActive,
    });

    return NextResponse.json({ data: row });
  } catch (error) {
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.roles ?? [session.user.role], ADMIN_ROLES)) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const { id } = await params;
    await eventService.deleteEvent({
      id,
      branchId: session.user.branchId,
      actorId: session.user.id,
    });

    return NextResponse.json({ data: { id, deleted: true } });
  } catch (error) {
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
