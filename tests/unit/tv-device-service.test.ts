import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    tvDevice: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('@/lib/audit', () => ({
  auditLog: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';
import { registerTvDevice, listTvDevices, revokeTvDevice } from '@/services/tv-device.service';
import { compare } from 'bcryptjs';

const mockCreate = prisma.tvDevice.create as ReturnType<typeof vi.fn>;
const mockFindFirst = prisma.tvDevice.findFirst as ReturnType<typeof vi.fn>;
const mockFindMany = prisma.tvDevice.findMany as ReturnType<typeof vi.fn>;
const mockUpdate = prisma.tvDevice.update as ReturnType<typeof vi.fn>;
const mockAudit = auditLog as ReturnType<typeof vi.fn>;

const BRANCH = 'branch-1';
const ACTOR = 'user-admin';

describe('tv-device.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('registerTvDevice', () => {
    it('returns a plaintext token in deviceId.secret form and audits the registration', async () => {
      mockCreate.mockImplementation(({ data }) =>
        Promise.resolve({
          id: 'dev-1',
          branchId: data.branchId,
          name: data.name,
          lastSeenAt: null,
          revokedAt: null,
          createdAt: new Date('2026-05-11T00:00:00Z'),
        }),
      );

      const result = await registerTvDevice({
        name: 'Main Floor TV',
        branchId: BRANCH,
        actorId: ACTOR,
      });

      expect(result.device.id).toBe('dev-1');
      expect(result.token.startsWith('dev-1.')).toBe(true);
      expect(result.token.length).toBeGreaterThan('dev-1.'.length + 20);
      expect(mockAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'TV_DEVICE_REGISTERED',
          subjectType: 'TvDevice',
          subjectId: 'dev-1',
          branchId: BRANCH,
          actorId: ACTOR,
        }),
      );
    });

    it('stores the secret as a bcrypt hash that verifies against the returned plaintext', async () => {
      let storedHash = '';
      mockCreate.mockImplementation(({ data }) => {
        storedHash = data.tokenHash;
        return Promise.resolve({
          id: 'dev-2',
          branchId: data.branchId,
          name: data.name,
          lastSeenAt: null,
          revokedAt: null,
          createdAt: new Date(),
        });
      });

      const result = await registerTvDevice({
        name: 'TV',
        branchId: BRANCH,
        actorId: ACTOR,
      });

      const secret = result.token.slice(result.token.indexOf('.') + 1);
      const ok = await compare(secret, storedHash);
      expect(ok).toBe(true);

      const wrongOk = await compare('not-the-secret', storedHash);
      expect(wrongOk).toBe(false);
    });
  });

  describe('listTvDevices', () => {
    it('queries by branchId and never selects tokenHash', async () => {
      mockFindMany.mockResolvedValue([]);
      await listTvDevices(BRANCH);
      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { branchId: BRANCH },
          select: expect.not.objectContaining({ tokenHash: true }),
          orderBy: { createdAt: 'desc' },
        }),
      );
    });
  });

  describe('revokeTvDevice', () => {
    it('stamps revokedAt and writes a TV_DEVICE_REVOKED audit row', async () => {
      mockFindFirst.mockResolvedValue({
        id: 'dev-1',
        branchId: BRANCH,
        revokedAt: null,
      });
      mockUpdate.mockResolvedValue({});

      const result = await revokeTvDevice({
        id: 'dev-1',
        branchId: BRANCH,
        actorId: ACTOR,
      });

      expect(result).toEqual({ success: true });
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'dev-1' },
          data: expect.objectContaining({ revokedAt: expect.any(Date) }),
        }),
      );
      expect(mockAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'TV_DEVICE_REVOKED',
          subjectId: 'dev-1',
          branchId: BRANCH,
        }),
      );
    });

    it('returns success without re-revoking an already-revoked device', async () => {
      mockFindFirst.mockResolvedValue({
        id: 'dev-1',
        branchId: BRANCH,
        revokedAt: new Date('2026-05-01T00:00:00Z'),
      });

      const result = await revokeTvDevice({
        id: 'dev-1',
        branchId: BRANCH,
        actorId: ACTOR,
      });

      expect(result).toEqual({ success: true });
      expect(mockUpdate).not.toHaveBeenCalled();
      expect(mockAudit).not.toHaveBeenCalled();
    });

    it('refuses to revoke a device that belongs to a different branch', async () => {
      mockFindFirst.mockResolvedValue(null);

      await expect(
        revokeTvDevice({ id: 'dev-x', branchId: BRANCH, actorId: ACTOR }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 });
      expect(mockUpdate).not.toHaveBeenCalled();
    });
  });
});
