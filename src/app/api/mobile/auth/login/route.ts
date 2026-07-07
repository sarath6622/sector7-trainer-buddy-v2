import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { compare } from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { computePrimaryRole } from '@/lib/auth';
import { auditLog } from '@/lib/audit';
import { isMobileAllowed, newJti } from '@/lib/mobile-auth';
import { issueMobileSession, toMobileTokenUser, toResponseUser } from '../_issue';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  platform: z.enum(['ios', 'android']).optional(),
  deviceId: z.string().max(200).optional(),
});

const INVALID = NextResponse.json(
  { error: 'Invalid email or password', code: 'INVALID_CREDENTIALS' },
  { status: 401 },
);

/**
 * POST /api/mobile/auth/login
 * Body: { email, password, platform?, deviceId? }
 * → { data: { accessToken, refreshToken, user } }
 *
 * Reuses the same credential check as the web (case-insensitive email,
 * isActive/deletedAt guard, bcrypt). Admin-only accounts are rejected — they
 * use the web console. See docs/flutter-migration-plan.md §3.1.
 */
export async function POST(req: NextRequest) {
  try {
    const parsed = loginSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', code: 'VALIDATION_ERROR', details: parsed.error?.flatten() },
        { status: 400 },
      );
    }
    const { email, password, platform, deviceId } = parsed.data;

    const user = await prisma.user.findFirst({
      where: { email: { equals: email.trim(), mode: 'insensitive' } },
      include: {
        trainerProfile: { select: { id: true } },
        clientProfile: { select: { id: true } },
      },
    });

    if (!user || !user.isActive || user.deletedAt) return INVALID;

    const passwordValid = await compare(password, user.passwordHash);
    if (!passwordValid) return INVALID;

    if (!isMobileAllowed(user.roles)) {
      return NextResponse.json(
        {
          error: 'This account cannot sign in on mobile. Use the Sector 7 web console.',
          code: 'MOBILE_NOT_ALLOWED',
        },
        { status: 403 },
      );
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const tokenUser = toMobileTokenUser(user);
    const familyId = newJti();
    const { accessToken, refreshToken } = await issueMobileSession({
      user: tokenUser,
      familyId,
      platform,
      deviceId,
      userAgent: req.headers.get('user-agent'),
    });

    await auditLog({
      action: 'MOBILE_LOGIN',
      actorId: user.id,
      subjectType: 'User',
      subjectId: user.id,
      branchId: user.branchId,
      metadata: { platform: platform ?? null, role: computePrimaryRole(user.roles) },
      userAgent: req.headers.get('user-agent') ?? undefined,
    });

    return NextResponse.json({
      data: { accessToken, refreshToken, user: toResponseUser(tokenUser) },
    });
  } catch (error) {
    console.error('[POST /api/mobile/auth/login] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 },
    );
  }
}
