import { NextRequest, NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { updateTvAnnouncementSchema } from '@/lib/validators';
import * as announcementService from '@/services/tv-announcement.service';

const ADMIN_ROLES = ['SUPER_ADMIN', 'BRANCH_ADMIN'];

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.roles ?? [session.user.role], ADMIN_ROLES)) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const parsed = updateTvAnnouncementSchema.parse(body);

    const row = await announcementService.updateAnnouncement({
      id,
      branchId: session.user.branchId,
      actorId: session.user.id,
      title: parsed.title,
      body: parsed.body,
      icon: parsed.icon,
      sortOrder: parsed.sortOrder,
      isActive: parsed.isActive,
      expiresAt:
        parsed.expiresAt === undefined
          ? undefined
          : parsed.expiresAt === null
            ? null
            : new Date(parsed.expiresAt),
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
    await announcementService.deleteAnnouncement({
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
