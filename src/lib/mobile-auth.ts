import { createHash, randomUUID } from 'crypto';
import { SignJWT, jwtVerify } from 'jose';
import type { Session } from 'next-auth';

/**
 * Mobile (Flutter) JWT auth — Phase 0 of the mobile migration.
 *
 * Native apps cannot ride NextAuth's cookie + CSRF flow, so the Flutter client
 * authenticates with a short-lived access JWT (Bearer header) plus a long-lived
 * rotating refresh JWT. This module owns signing/verifying those tokens and
 * turning a valid access token into the same `Session` shape `getServerSession()`
 * returns for the web — so the existing route handlers work unchanged.
 *
 * The Bearer header is read in `getServerSession()` (src/lib/auth.ts); this module
 * stays free of `next/headers` so it is pure and unit-testable.
 *
 * Tokens are signed with MOBILE_JWT_SECRET (distinct from NEXTAUTH_SECRET).
 * See docs/flutter-migration-plan.md §3.
 */

const ALG = 'HS256';
export const ACCESS_TOKEN_TTL = '15m';
export const REFRESH_TOKEN_TTL_DAYS = 30;
const REFRESH_TOKEN_TTL = `${REFRESH_TOKEN_TTL_DAYS}d`;

/** Claims carried by the access token — mirrors the NextAuth JWT/session user. */
export interface MobileTokenUser {
  id: string;
  email: string;
  role: string; // primary role (computePrimaryRole)
  roles: string[];
  branchId: string;
  firstName: string;
  lastName: string;
  trainerProfileId: string | null;
  clientProfileId: string | null;
}

export interface RefreshClaims {
  sub: string; // userId
  jti: string;
  familyId: string;
}

/**
 * Roles allowed to use the Flutter mobile app. Admins (SUPER_ADMIN /
 * BRANCH_ADMIN) and TV_DISPLAY stay on the web — mobile login rejects an
 * account that holds none of these.
 */
export const MOBILE_ALLOWED_ROLES = [
  'TRAINER',
  'KICKBOXING_TRAINER',
  'CROSSFIT_TRAINER',
  'CLIENT',
] as const;

/** True when the user holds at least one role permitted on mobile. */
export function isMobileAllowed(roles: string[]): boolean {
  return roles.some((r) => (MOBILE_ALLOWED_ROLES as readonly string[]).includes(r));
}

function secretKey(): Uint8Array {
  const secret = process.env.MOBILE_JWT_SECRET;
  if (!secret) {
    throw new Error('MOBILE_JWT_SECRET is not set — mobile auth cannot sign/verify tokens.');
  }
  return new TextEncoder().encode(secret);
}

/** sha256 hex of a raw refresh token. The raw token is never persisted. */
export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export function newJti(): string {
  return randomUUID();
}

// ── Access token ────────────────────────────────────────────────────────────

export async function signAccessToken(user: MobileTokenUser): Promise<string> {
  return new SignJWT({
    typ: 'access',
    email: user.email,
    role: user.role,
    roles: user.roles,
    branchId: user.branchId,
    firstName: user.firstName,
    lastName: user.lastName,
    trainerProfileId: user.trainerProfileId,
    clientProfileId: user.clientProfileId,
  })
    .setProtectedHeader({ alg: ALG })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_TTL)
    .sign(secretKey());
}

/**
 * Verify an access token and rebuild the `Session` shape. Returns null on any
 * failure (bad signature, expired, wrong type, missing secret) so callers can
 * treat it as "unauthenticated".
 */
export async function sessionFromAccessToken(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: [ALG] });
    if (payload.typ !== 'access' || typeof payload.sub !== 'string') return null;

    const firstName = (payload.firstName as string) ?? '';
    const lastName = (payload.lastName as string) ?? '';

    return {
      // NextAuth's Session type requires `expires`; mirror the token's exp.
      expires: payload.exp ? new Date(payload.exp * 1000).toISOString() : '',
      user: {
        id: payload.sub,
        email: (payload.email as string) ?? '',
        name: `${firstName} ${lastName}`.trim(),
        role: (payload.role as string) ?? 'CLIENT',
        roles: (payload.roles as string[]) ?? [],
        branchId: (payload.branchId as string) ?? '',
        firstName,
        lastName,
        trainerProfileId: (payload.trainerProfileId as string | null) ?? null,
        clientProfileId: (payload.clientProfileId as string | null) ?? null,
      },
    } satisfies Session;
  } catch {
    return null;
  }
}

// ── Refresh token ─────────────────────────────────────────────────────────────

export async function signRefreshToken(params: RefreshClaims): Promise<string> {
  return new SignJWT({ typ: 'refresh', familyId: params.familyId })
    .setProtectedHeader({ alg: ALG })
    .setSubject(params.sub)
    .setJti(params.jti)
    .setIssuedAt()
    .setExpirationTime(REFRESH_TOKEN_TTL)
    .sign(secretKey());
}

export async function verifyRefreshToken(token: string): Promise<RefreshClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: [ALG] });
    if (
      payload.typ !== 'refresh' ||
      typeof payload.sub !== 'string' ||
      typeof payload.jti !== 'string' ||
      typeof payload.familyId !== 'string'
    ) {
      return null;
    }
    return { sub: payload.sub, jti: payload.jti, familyId: payload.familyId };
  } catch {
    return null;
  }
}
