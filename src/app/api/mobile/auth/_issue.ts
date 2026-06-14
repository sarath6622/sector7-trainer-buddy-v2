import { prisma } from '@/lib/prisma';
import { computePrimaryRole } from '@/lib/auth';
import {
  signAccessToken,
  signRefreshToken,
  hashToken,
  newJti,
  REFRESH_TOKEN_TTL_DAYS,
  type MobileTokenUser,
} from '@/lib/mobile-auth';

/** A Prisma User joined with its profile ids — what login/refresh load. */
export interface UserForToken {
  id: string;
  email: string;
  roles: string[];
  branchId: string;
  firstName: string;
  lastName: string;
  trainerProfile: { id: string } | null;
  clientProfile: { id: string } | null;
}

/** Map a DB user to the access-token claim set (primary role computed). */
export function toMobileTokenUser(user: UserForToken): MobileTokenUser {
  return {
    id: user.id,
    email: user.email,
    role: computePrimaryRole(user.roles),
    roles: user.roles,
    branchId: user.branchId,
    firstName: user.firstName,
    lastName: user.lastName,
    trainerProfileId: user.trainerProfile?.id ?? null,
    clientProfileId: user.clientProfile?.id ?? null,
  };
}

/** The `user` object returned to the client (matches AuthUser.fromJson). */
export function toResponseUser(u: MobileTokenUser) {
  return {
    id: u.id,
    email: u.email,
    role: u.role,
    branchId: u.branchId,
    firstName: u.firstName,
    lastName: u.lastName,
    trainerProfileId: u.trainerProfileId,
    clientProfileId: u.clientProfileId,
  };
}

function refreshExpiry(): Date {
  return new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
}

interface IssueParams {
  user: MobileTokenUser;
  familyId: string;
  platform?: string | null;
  deviceId?: string | null;
  userAgent?: string | null;
}

/**
 * Sign a fresh access + refresh pair and persist the refresh token's row.
 * Used at login (a brand-new family). Returns the raw tokens.
 */
export async function issueMobileSession({
  user,
  familyId,
  platform,
  deviceId,
  userAgent,
}: IssueParams): Promise<{ accessToken: string; refreshToken: string; jti: string }> {
  const jti = newJti();
  const accessToken = await signAccessToken(user);
  const refreshToken = await signRefreshToken({ sub: user.id, jti, familyId });

  await prisma.mobileRefreshToken.create({
    data: {
      userId: user.id,
      jti,
      familyId,
      tokenHash: hashToken(refreshToken),
      platform: platform ?? null,
      deviceId: deviceId ?? null,
      userAgent: userAgent ?? null,
      expiresAt: refreshExpiry(),
    },
  });

  return { accessToken, refreshToken, jti };
}

/**
 * Rotate a refresh token: in one transaction, revoke the presented row
 * (recording its successor) and insert the successor row in the same family.
 * Signs and returns the new access + refresh pair.
 */
export async function rotateMobileSession(params: {
  user: MobileTokenUser;
  currentJti: string;
  familyId: string;
  platform?: string | null;
  deviceId?: string | null;
  userAgent?: string | null;
}): Promise<{ accessToken: string; refreshToken: string }> {
  const newJtiValue = newJti();
  const accessToken = await signAccessToken(params.user);
  const refreshToken = await signRefreshToken({
    sub: params.user.id,
    jti: newJtiValue,
    familyId: params.familyId,
  });

  await prisma.$transaction([
    prisma.mobileRefreshToken.update({
      where: { jti: params.currentJti },
      data: { revokedAt: new Date(), replacedByJti: newJtiValue },
    }),
    prisma.mobileRefreshToken.create({
      data: {
        userId: params.user.id,
        jti: newJtiValue,
        familyId: params.familyId,
        tokenHash: hashToken(refreshToken),
        platform: params.platform ?? null,
        deviceId: params.deviceId ?? null,
        userAgent: params.userAgent ?? null,
        expiresAt: refreshExpiry(),
      },
    }),
  ]);

  return { accessToken, refreshToken };
}
