import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    clientUnavailability: {
      createMany: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock('@/lib/audit', () => ({ auditLog: vi.fn() }));

import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';
import * as unavailabilityService from '@/services/clientUnavailability.service';

const BRANCH = 'branch-1';
const ACTOR = 'actor-1';
const CLIENT = 'cp-1';

beforeEach(() => vi.clearAllMocks());

// ─── markUnavailable ───────────────────────────────

describe('markUnavailable', () => {
  it('should create records and audit', async () => {
    (prisma.clientUnavailability.createMany as ReturnType<typeof vi.fn>).mockResolvedValue({
      count: 2,
    });

    const records = [
      { id: 'ua-1', date: new Date('2026-03-25'), branchId: BRANCH, clientProfileId: CLIENT },
      { id: 'ua-2', date: new Date('2026-03-26'), branchId: BRANCH, clientProfileId: CLIENT },
    ];
    (prisma.clientUnavailability.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(records);

    const result = await unavailabilityService.markUnavailable({
      clientProfileId: CLIENT,
      dates: ['2026-03-25', '2026-03-26'],
      actorId: ACTOR,
      branchId: BRANCH,
    });

    expect(result).toHaveLength(2);
    expect(prisma.clientUnavailability.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    );
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CLIENT_UNAVAILABILITY_MARKED',
        branchId: BRANCH,
      }),
    );
  });
});

// ─── listUnavailability ────────────────────────────

describe('listUnavailability', () => {
  it('should return records for client', async () => {
    (prisma.clientUnavailability.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'ua-1', date: new Date('2026-03-25') },
    ]);

    const result = await unavailabilityService.listUnavailability({
      clientProfileId: CLIENT,
      branchId: BRANCH,
    });

    expect(result).toHaveLength(1);
  });

  it('should filter by month', async () => {
    (prisma.clientUnavailability.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await unavailabilityService.listUnavailability({
      clientProfileId: CLIENT,
      branchId: BRANCH,
      month: '2026-03',
    });

    expect(prisma.clientUnavailability.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          date: expect.objectContaining({ gte: expect.any(Date), lte: expect.any(Date) }),
        }),
      }),
    );
  });
});

// ─── removeUnavailability ──────────────────────────

describe('removeUnavailability', () => {
  it('should throw if record not found', async () => {
    (prisma.clientUnavailability.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(
      unavailabilityService.removeUnavailability({
        unavailabilityId: 'ua-1',
        clientProfileId: CLIENT,
        actorId: ACTOR,
        branchId: BRANCH,
      }),
    ).rejects.toThrow('Unavailability record not found');
  });

  it('should delete record and audit', async () => {
    (prisma.clientUnavailability.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'ua-1',
      date: new Date('2026-03-25'),
      clientProfileId: CLIENT,
    });
    (prisma.clientUnavailability.delete as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const result = await unavailabilityService.removeUnavailability({
      unavailabilityId: 'ua-1',
      clientProfileId: CLIENT,
      actorId: ACTOR,
      branchId: BRANCH,
    });

    expect(result.success).toBe(true);
    expect(prisma.clientUnavailability.delete).toHaveBeenCalledWith({
      where: { id: 'ua-1' },
    });
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CLIENT_UNAVAILABILITY_REMOVED',
      }),
    );
  });
});
