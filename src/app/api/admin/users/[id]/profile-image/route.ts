import { NextRequest, NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import * as profileImageService from '@/services/profile-image.service';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession();
    if (
      !session ||
      !hasRole(session.user.roles ?? [session.user.role], ['SUPER_ADMIN', 'BRANCH_ADMIN'])
    ) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const { id } = await params;

    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: 'Missing file', code: 'VALIDATION_ERROR' },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    const result = await profileImageService.setProfileImage({
      userId: id,
      branchId: session.user.branchId,
      actorId: session.user.id,
      buffer,
      mimeType: file.type,
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    console.error('[POST /api/admin/users/[id]/profile-image]', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession();
    if (
      !session ||
      !hasRole(session.user.roles ?? [session.user.role], ['SUPER_ADMIN', 'BRANCH_ADMIN'])
    ) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const { id } = await params;

    const result = await profileImageService.removeProfileImage({
      userId: id,
      branchId: session.user.branchId,
      actorId: session.user.id,
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    console.error('[DELETE /api/admin/users/[id]/profile-image]', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
