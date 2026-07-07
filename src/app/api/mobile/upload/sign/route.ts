import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { signUpload } from '@/lib/cloudinary';
import { signUploadSchema } from '@/lib/validators';
import { MOBILE_ALLOWED_ROLES } from '@/lib/mobile-auth';

/**
 * POST /api/mobile/upload/sign
 *
 * Returns Cloudinary signed-upload params so the Flutter app can upload an image
 * **directly** to Cloudinary without ever holding the API secret. The folder is
 * branch-scoped server-side; the app echoes the returned params (folder,
 * timestamp, public_id) plus the file + api_key + signature to Cloudinary, then
 * persists the resulting `secure_url` (avatar → profile-image route; progress
 * photos → progress POST). See docs/flutter-migration-plan.md §3.3.
 *
 * Mobile-only (TRAINER / CLIENT roles); admins use the web upload path.
 */
export async function POST(req: Request) {
  try {
    const session = await requireRole([...MOBILE_ALLOWED_ROLES], { matchAllRoles: true });

    const body = await req.json().catch(() => ({}));
    const parsed = signUploadSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const signed = signUpload({
      branchId: session.user.branchId,
      userId: session.user.id,
      kind: parsed.data.kind,
    });

    return NextResponse.json({ data: signed });
  } catch (error) {
    console.error('[POST /api/mobile/upload/sign]', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
