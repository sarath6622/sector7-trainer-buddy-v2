import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getServerSession } from '@/lib/auth';
import { auditLog } from '@/lib/audit';
import { verifyRefreshToken } from '@/lib/mobile-auth';

const logoutSchema = z.object({ refreshToken: z.string().min(1).optional() });

/**
 * POST /api/mobile/auth/logout   (Authorization: Bearer <accessToken>)
 * Body: { refreshToken? }   Query: ?all=true
 *
 * Revokes the presented refresh token, or all of the user's refresh tokens when
 * `?all=true`. Idempotent — always 200, even if nothing matched. The access
 * token itself is short-lived and simply expires.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    }
    const userId = session.user.id;

    const all = new URL(req.url).searchParams.get('all') === 'true';
    const parsed = logoutSchema.safeParse(await req.json().catch(() => ({})));
    const refreshToken = parsed.success ? parsed.data.refreshToken : undefined;

    let revoked = 0;
    if (all) {
      const res = await prisma.mobileRefreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      revoked = res.count;
    } else if (refreshToken) {
      const claims = await verifyRefreshToken(refreshToken);
      // Only revoke a row that actually belongs to the caller.
      if (claims && claims.sub === userId) {
        const res = await prisma.mobileRefreshToken.updateMany({
          where: { jti: claims.jti, userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        revoked = res.count;
      }
    }

    await auditLog({
      action: 'MOBILE_LOGOUT',
      actorId: userId,
      subjectType: 'User',
      subjectId: userId,
      branchId: session.user.branchId,
      metadata: { all, revoked },
      userAgent: req.headers.get('user-agent') ?? undefined,
    });

    return NextResponse.json({ data: { success: true, revoked } });
  } catch (error) {
    console.error('[POST /api/mobile/auth/logout] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 },
    );
  }
}
