import { NextRequest, NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { createTvAnnouncementSchema } from '@/lib/validators';
import * as announcementService from '@/services/tv-announcement.service';

const ADMIN_ROLES = ['SUPER_ADMIN', 'BRANCH_ADMIN'];

export async function GET() {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.roles ?? [session.user.role], ADMIN_ROLES)) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const rows = await announcementService.listAllAnnouncements(session.user.branchId);
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
    const parsed = createTvAnnouncementSchema.parse(body);

    const row = await announcementService.createAnnouncement({
      branchId: session.user.branchId,
      actorId: session.user.id,
      title: parsed.title,
      body: parsed.body,
      icon: parsed.icon ?? null,
      sortOrder: parsed.sortOrder,
      isActive: parsed.isActive,
      expiresAt: parsed.expiresAt ? new Date(parsed.expiresAt) : null,
    });

    return NextResponse.json({ data: row }, { status: 201 });
  } catch (error) {
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
