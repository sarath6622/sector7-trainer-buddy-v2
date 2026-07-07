import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { verifyRefreshToken } from '@/lib/mobile-auth';
import { rotateMobileSession, toMobileTokenUser } from '../_issue';

const refreshSchema = z.object({ refreshToken: z.string().min(1) });

const UNAUTHORIZED = NextResponse.json(
  { error: 'Invalid or expired refresh token', code: 'INVALID_REFRESH_TOKEN' },
  { status: 401 },
);

/** Revoke every still-active token in a rotation family (reuse-detection nuke). */
async function revokeFamily(familyId: string): Promise<void> {
  await prisma.mobileRefreshToken.updateMany({
    where: { familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/**
 * POST /api/mobile/auth/refresh
 * Body: { refreshToken }
 * → { data: { accessToken, refreshToken } }
 *
 * Rotating refresh with reuse detection: presenting an already-revoked token
 * means it leaked (or a race) — we revoke the entire family and force re-login.
 * See docs/flutter-migration-plan.md §10.
 */
export async function POST(req: NextRequest) {
  try {
    const parsed = refreshSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', code: 'VALIDATION_ERROR' },
        { status: 400 },
      );
    }

    const claims = await verifyRefreshToken(parsed.data.refreshToken);
    if (!claims) return UNAUTHORIZED;

    const stored = await prisma.mobileRefreshToken.findUnique({ where: { jti: claims.jti } });
    if (!stored || stored.familyId !== claims.familyId) return UNAUTHORIZED;

    // Reuse detection: a revoked token being presented → revoke the whole family.
    if (stored.revokedAt) {
      await revokeFamily(stored.familyId);
      return UNAUTHORIZED;
    }

    if (stored.expiresAt < new Date()) {
      await prisma.mobileRefreshToken
        .update({ where: { jti: stored.jti }, data: { revokedAt: new Date() } })
        .catch(() => {});
      return UNAUTHORIZED;
    }

    const user = await prisma.user.findFirst({
      where: { id: claims.sub },
      include: {
        trainerProfile: { select: { id: true } },
        clientProfile: { select: { id: true } },
      },
    });

    // User gone, deactivated, or soft-deleted → kill the family.
    if (!user || !user.isActive || user.deletedAt) {
      await revokeFamily(stored.familyId);
      return UNAUTHORIZED;
    }

    const { accessToken, refreshToken } = await rotateMobileSession({
      user: toMobileTokenUser(user),
      currentJti: stored.jti,
      familyId: stored.familyId,
      platform: stored.platform,
      deviceId: stored.deviceId,
      userAgent: req.headers.get('user-agent'),
    });

    return NextResponse.json({ data: { accessToken, refreshToken } });
  } catch (error) {
    console.error('[POST /api/mobile/auth/refresh] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 },
    );
  }
}
