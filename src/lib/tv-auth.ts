import { compare } from 'bcryptjs';
import { getServerSession, hasRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { AppError } from '@/lib/errors';

/**
 * Result of a successful TV-or-admin auth check. `source` tells the caller
 * which credential proved access:
 *   - 'session' — a NextAuth session with TV_DISPLAY | BRANCH_ADMIN | SUPER_ADMIN
 *   - 'device'  — a valid Bearer token belonging to a non-revoked TvDevice
 */
export interface TvAuthContext {
  branchId: string;
  source: 'session' | 'device';
  actorId: string; // user id for session; device id for device
  deviceId: string | null;
}

const TV_READ_ROLES = ['TV_DISPLAY', 'BRANCH_ADMIN', 'SUPER_ADMIN'] as const;

/**
 * Authorize a request that may originate from the unattended TV (bearer token)
 * OR an admin / TV operator browser (NextAuth session). Returns the resolved
 * branch context. Throws AppError on failure — caller maps to HTTP status.
 *
 * Token format: `${deviceId}.${secret}`. The deviceId lets us look up exactly
 * one row instead of bcrypt-scanning the table; the secret is bcrypt-compared
 * against `tokenHash`.
 */
export async function assertTvOrAdmin(req: Request): Promise<TvAuthContext> {
  // 1. Try Bearer token first — TV devices are the primary caller
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length).trim();
    return verifyDeviceToken(token);
  }

  // 2. Fall back to session auth (admin browsers, /admin/tv preview, etc.)
  const session = await getServerSession();
  if (!session) {
    throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
  }
  const userRoles = session.user.roles ?? [session.user.role];
  if (!hasRole(userRoles, [...TV_READ_ROLES])) {
    throw new AppError('FORBIDDEN', 'Insufficient role for TV dashboard', 403);
  }
  return {
    branchId: session.user.branchId,
    source: 'session',
    actorId: session.user.id,
    deviceId: null,
  };
}

/**
 * Lookup + bcrypt-verify a `${deviceId}.${secret}` bearer token. Returns the
 * device's branch context. Bumps `lastSeenAt` as a side effect (best-effort).
 */
export async function verifyDeviceToken(token: string): Promise<TvAuthContext> {
  const dot = token.indexOf('.');
  if (dot <= 0 || dot === token.length - 1) {
    throw new AppError('UNAUTHORIZED', 'Malformed token', 401);
  }
  const deviceId = token.slice(0, dot);
  const secret = token.slice(dot + 1);

  const device = await prisma.tvDevice.findUnique({ where: { id: deviceId } });
  if (!device || device.revokedAt) {
    throw new AppError('UNAUTHORIZED', 'Invalid or revoked token', 401);
  }

  const ok = await compare(secret, device.tokenHash);
  if (!ok) {
    throw new AppError('UNAUTHORIZED', 'Invalid or revoked token', 401);
  }

  // Heartbeat — never fail the request on this
  prisma.tvDevice
    .update({ where: { id: device.id }, data: { lastSeenAt: new Date() } })
    .catch((err) => console.error('[tv-auth] failed to bump lastSeenAt:', err));

  return {
    branchId: device.branchId,
    source: 'device',
    actorId: device.id,
    deviceId: device.id,
  };
}
