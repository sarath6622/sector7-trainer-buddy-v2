import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import * as profileImageService from '@/services/profile-image.service';

export async function GET(_request: NextRequest) {
  try {
    const session = await requireRole(['CLIENT'], { matchAllRoles: true });

    const result = await profileImageService.getProfileImageUrl(
      session.user.id,
      session.user.branchId,
    );
    return NextResponse.json({ data: result });
  } catch (error) {
    console.error('[GET /api/client/profile/image]', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireRole(['CLIENT'], { matchAllRoles: true });

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
      userId: session.user.id,
      branchId: session.user.branchId,
      actorId: session.user.id,
      buffer,
      mimeType: file.type,
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    console.error('[POST /api/client/profile/image]', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}

export async function DELETE(_request: NextRequest) {
  try {
    const session = await requireRole(['CLIENT'], { matchAllRoles: true });

    const result = await profileImageService.removeProfileImage({
      userId: session.user.id,
      branchId: session.user.branchId,
      actorId: session.user.id,
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    console.error('[DELETE /api/client/profile/image]', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
