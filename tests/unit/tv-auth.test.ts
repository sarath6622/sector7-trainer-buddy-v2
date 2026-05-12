import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hash } from 'bcryptjs';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    tvDevice: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue(undefined),
    },
  },
}));

vi.mock('@/lib/auth', () => ({
  getServerSession: vi.fn(),
  hasRole: (userRole: string | string[], allowed: string[]) => {
    const roles = Array.isArray(userRole) ? userRole : [userRole];
    return roles.some((r) => allowed.includes(r));
  },
}));

import { prisma } from '@/lib/prisma';
import { getServerSession } from '@/lib/auth';
import { assertTvOrAdmin } from '@/lib/tv-auth';

const mockFindUnique = prisma.tvDevice.findUnique as ReturnType<typeof vi.fn>;
const mockGetSession = getServerSession as ReturnType<typeof vi.fn>;

function reqWithAuth(authHeader?: string): Request {
  return new Request('http://localhost/api/admin/tv/dashboard', {
    headers: authHeader ? { authorization: authHeader } : undefined,
  });
}

describe('assertTvOrAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('bearer token path', () => {
    it('accepts a valid {deviceId}.{secret} token and returns the device branch', async () => {
      const tokenHash = await hash('my-secret', 10);
      mockFindUnique.mockResolvedValue({
        id: 'dev-1',
        branchId: 'branch-a',
        tokenHash,
        revokedAt: null,
      });

      const ctx = await assertTvOrAdmin(reqWithAuth('Bearer dev-1.my-secret'));
      expect(ctx).toMatchObject({
        branchId: 'branch-a',
        source: 'device',
        actorId: 'dev-1',
        deviceId: 'dev-1',
      });
      expect(mockFindUnique).toHaveBeenCalledWith({ where: { id: 'dev-1' } });
    });

    it('rejects a token whose secret does not match the stored hash', async () => {
      const tokenHash = await hash('correct-secret', 10);
      mockFindUnique.mockResolvedValue({
        id: 'dev-1',
        branchId: 'branch-a',
        tokenHash,
        revokedAt: null,
      });

      await expect(assertTvOrAdmin(reqWithAuth('Bearer dev-1.wrong-secret'))).rejects.toMatchObject(
        { code: 'UNAUTHORIZED', statusCode: 401 },
      );
    });

    it('rejects a token for an unknown device id', async () => {
      mockFindUnique.mockResolvedValue(null);
      await expect(assertTvOrAdmin(reqWithAuth('Bearer dev-nope.whatever'))).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
        statusCode: 401,
      });
    });

    it('rejects a token for a revoked device even if the secret is correct', async () => {
      const tokenHash = await hash('still-known', 10);
      mockFindUnique.mockResolvedValue({
        id: 'dev-1',
        branchId: 'branch-a',
        tokenHash,
        revokedAt: new Date(),
      });

      await expect(assertTvOrAdmin(reqWithAuth('Bearer dev-1.still-known'))).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
        statusCode: 401,
      });
    });

    it.each(['Bearer no-dot-here', 'Bearer .startsWithDot', 'Bearer endsWithDot.'])(
      'rejects malformed token: %s',
      async (header) => {
        await expect(assertTvOrAdmin(reqWithAuth(header))).rejects.toMatchObject({
          code: 'UNAUTHORIZED',
        });
      },
    );
  });

  describe('session fallback path', () => {
    it('accepts a BRANCH_ADMIN session', async () => {
      mockGetSession.mockResolvedValue({
        user: {
          id: 'user-1',
          role: 'BRANCH_ADMIN',
          roles: ['BRANCH_ADMIN'],
          branchId: 'branch-b',
        },
      });
      const ctx = await assertTvOrAdmin(reqWithAuth());
      expect(ctx).toMatchObject({
        branchId: 'branch-b',
        source: 'session',
        actorId: 'user-1',
        deviceId: null,
      });
    });

    it('accepts a TV_DISPLAY session', async () => {
      mockGetSession.mockResolvedValue({
        user: {
          id: 'user-tv',
          role: 'TV_DISPLAY',
          roles: ['TV_DISPLAY'],
          branchId: 'branch-c',
        },
      });
      const ctx = await assertTvOrAdmin(reqWithAuth());
      expect(ctx.source).toBe('session');
      expect(ctx.branchId).toBe('branch-c');
    });

    it('rejects a CLIENT-only session', async () => {
      mockGetSession.mockResolvedValue({
        user: { id: 'user-c', role: 'CLIENT', roles: ['CLIENT'], branchId: 'branch-c' },
      });
      await expect(assertTvOrAdmin(reqWithAuth())).rejects.toMatchObject({
        code: 'FORBIDDEN',
        statusCode: 403,
      });
    });

    it('rejects a request with no session and no token', async () => {
      mockGetSession.mockResolvedValue(null);
      await expect(assertTvOrAdmin(reqWithAuth())).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
        statusCode: 401,
      });
    });
  });
});
