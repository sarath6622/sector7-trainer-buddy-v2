// @vitest-environment node
// jose's WebCrypto signing requires Node's Uint8Array realm; the default jsdom
// environment produces a cross-realm Uint8Array that jose rejects.
import { describe, it, expect, beforeAll } from 'vitest';
import { SignJWT } from 'jose';
import {
  signAccessToken,
  sessionFromAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
  newJti,
  isMobileAllowed,
  type MobileTokenUser,
} from '@/lib/mobile-auth';

// mobile-auth reads MOBILE_JWT_SECRET at call time.
beforeAll(() => {
  process.env.MOBILE_JWT_SECRET = 'test-mobile-secret-which-is-long-enough-32b';
});

const user: MobileTokenUser = {
  id: 'u_123',
  email: 'client@sector7.com',
  role: 'CLIENT',
  roles: ['CLIENT'],
  branchId: 'b_1',
  firstName: 'Casey',
  lastName: 'Client',
  trainerProfileId: null,
  clientProfileId: 'cp_1',
};

describe('access token', () => {
  it('round-trips into the same Session.user shape', async () => {
    const token = await signAccessToken(user);
    const session = await sessionFromAccessToken(token);

    expect(session).not.toBeNull();
    expect(session!.user).toMatchObject({
      id: 'u_123',
      email: 'client@sector7.com',
      name: 'Casey Client',
      role: 'CLIENT',
      roles: ['CLIENT'],
      branchId: 'b_1',
      firstName: 'Casey',
      lastName: 'Client',
      trainerProfileId: null,
      clientProfileId: 'cp_1',
    });
    expect(typeof session!.expires).toBe('string');
  });

  it('returns null for a token signed with a different secret', async () => {
    const token = await signAccessToken(user);
    process.env.MOBILE_JWT_SECRET = 'a-totally-different-secret-value-here-32b';
    const session = await sessionFromAccessToken(token);
    process.env.MOBILE_JWT_SECRET = 'test-mobile-secret-which-is-long-enough-32b';
    expect(session).toBeNull();
  });

  it('returns null for a malformed token', async () => {
    expect(await sessionFromAccessToken('not-a-jwt')).toBeNull();
    expect(await sessionFromAccessToken('')).toBeNull();
  });

  it('returns null for an expired token', async () => {
    const secret = new TextEncoder().encode(process.env.MOBILE_JWT_SECRET);
    const expired = await new SignJWT({ typ: 'access', email: user.email })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user.id)
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(secret);
    expect(await sessionFromAccessToken(expired)).toBeNull();
  });
});

describe('refresh token', () => {
  it('round-trips its claims', async () => {
    const jti = newJti();
    const familyId = newJti();
    const token = await signRefreshToken({ sub: user.id, jti, familyId });
    const claims = await verifyRefreshToken(token);

    expect(claims).toEqual({ sub: user.id, jti, familyId });
  });

  it('rejects an access token presented as a refresh token (typ guard)', async () => {
    const accessToken = await signAccessToken(user);
    expect(await verifyRefreshToken(accessToken)).toBeNull();
  });

  it('rejects a refresh token presented as an access token (typ guard)', async () => {
    const refresh = await signRefreshToken({ sub: user.id, jti: newJti(), familyId: newJti() });
    expect(await sessionFromAccessToken(refresh)).toBeNull();
  });
});

describe('hashToken', () => {
  it('is deterministic and input-sensitive', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'));
    expect(hashToken('abc')).not.toBe(hashToken('abd'));
    expect(hashToken('abc')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('isMobileAllowed', () => {
  it('allows trainers and clients', () => {
    expect(isMobileAllowed(['CLIENT'])).toBe(true);
    expect(isMobileAllowed(['TRAINER'])).toBe(true);
    expect(isMobileAllowed(['KICKBOXING_TRAINER'])).toBe(true);
    expect(isMobileAllowed(['CROSSFIT_TRAINER'])).toBe(true);
    expect(isMobileAllowed(['BRANCH_ADMIN', 'CLIENT'])).toBe(true);
  });

  it('rejects admin-only accounts', () => {
    expect(isMobileAllowed(['SUPER_ADMIN'])).toBe(false);
    expect(isMobileAllowed(['BRANCH_ADMIN'])).toBe(false);
    expect(isMobileAllowed(['TV_DISPLAY'])).toBe(false);
    expect(isMobileAllowed([])).toBe(false);
  });
});
