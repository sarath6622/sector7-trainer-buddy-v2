import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { updateOwnProfileSchema } from '@/lib/validators';
import { getUserById, updateUser } from '@/services/user.service';

/**
 * GET /api/client/profile
 * Returns the caller's own editable profile fields (name + phone) for the
 * mobile Settings form. CLIENT only — admins/trainers edit users elsewhere.
 */
export async function GET() {
  try {
    const session = await requireRole(['CLIENT']);
    const user = await getUserById(session.user.id, session.user.branchId);
    return NextResponse.json({
      data: {
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
      },
    });
  } catch (error) {
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}

/**
 * PATCH /api/client/profile
 * Self-service edit of the caller's own name / phone. Reuses the audited,
 * branch-scoped `updateUser` service; the narrow `updateOwnProfileSchema`
 * guarantees a client can never escalate roles or change email here.
 */
export async function PATCH(req: Request) {
  try {
    const session = await requireRole(['CLIENT']);
    const input = updateOwnProfileSchema.parse(await req.json());

    const updated = await updateUser(
      session.user.id,
      input,
      session.user.branchId,
      session.user.id,
    );

    return NextResponse.json({
      data: {
        firstName: updated?.firstName,
        lastName: updated?.lastName,
        phone: updated?.phone,
      },
    });
  } catch (error) {
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
