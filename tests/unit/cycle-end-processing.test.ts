import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    ptPackage: {
      findMany: vi.fn(),
      update: vi.fn(),
      fields: {
        // Phase 24 cycle-end query uses prisma.ptPackage.fields.endDate as a column reference
        endDate: { name: 'endDate' },
      },
    },
    branchSettings: {
      findUnique: vi.fn(),
    },
    sessionInstance: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('@/lib/audit', () => ({ auditLog: vi.fn() }));

import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';
import * as carryforward from '@/services/carryforward.service';

const ACTOR = 'cron';
type Mock = ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

function makeExpiredPackage(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'pkg-1',
    branchId: 'branch-1',
    clientProfileId: 'client-1',
    trainerProfileId: 'trainer-1',
    sessionsPerMonth: 12,
    totalSessions: 36,
    onboardingUsedSessions: 0,
    onboardingNotes: null,
    carryForwardLimit: null,
    sessionChargeAmount: null,
    isActive: true,
    startDate: new Date('2026-02-01T00:00:00.000Z'),
    endDate: new Date('2026-04-30T23:59:59.999Z'),
    lastProcessedAt: null,
    client: { user: { firstName: 'Alice', lastName: 'A' } },
    ...overrides,
  };
}

describe('processCycleEndsForPackages', () => {
  it('returns empty result when no packages have expired', async () => {
    (prisma.ptPackage.findMany as Mock).mockResolvedValue([]);

    const result = await carryforward.processCycleEndsForPackages(null, ACTOR);

    expect(result.processed).toBe(0);
    expect(result.totalCarriedForward).toBe(0);
    expect(result.totalExpired).toBe(0);
    expect(result.details).toEqual([]);
  });

  it('carries forward unused sessions up to the per-package limit', async () => {
    (prisma.ptPackage.findMany as Mock).mockResolvedValue([
      makeExpiredPackage({ totalSessions: 36, carryForwardLimit: 3 }),
    ]);
    // 30 used (10 completed + 20 no-show); 6 unused; per-package cap 3
    (prisma.sessionInstance.findMany as Mock).mockResolvedValue([
      ...Array(10).fill({ status: 'COMPLETED' }),
      ...Array(20).fill({ status: 'NO_SHOW' }),
    ]);
    (prisma.ptPackage.update as Mock).mockResolvedValue({});

    const result = await carryforward.processCycleEndsForPackages(null, ACTOR);

    expect(result.processed).toBe(1);
    expect(result.totalCarriedForward).toBe(3);
    expect(result.totalExpired).toBe(3); // 6 unused − 3 carried = 3 expired
    expect(prisma.ptPackage.update).toHaveBeenCalledWith({
      where: { id: 'pkg-1' },
      data: expect.objectContaining({
        carryForwardOutSessions: 3,
        lastProcessedAt: expect.any(Date),
      }),
    });
  });

  it('falls back to branch default when carryForwardLimit is null', async () => {
    (prisma.ptPackage.findMany as Mock).mockResolvedValue([
      makeExpiredPackage({ totalSessions: 36, carryForwardLimit: null }),
    ]);
    (prisma.sessionInstance.findMany as Mock).mockResolvedValue([
      ...Array(28).fill({ status: 'COMPLETED' }),
    ]);
    (prisma.branchSettings.findUnique as Mock).mockResolvedValue({ carryForwardLimit: 5 });
    (prisma.ptPackage.update as Mock).mockResolvedValue({});

    const result = await carryforward.processCycleEndsForPackages(null, ACTOR);

    // 36 - 28 = 8 unused; branch limit 5 → carry 5, expire 3
    expect(result.totalCarriedForward).toBe(5);
    expect(result.totalExpired).toBe(3);
  });

  it('uses the global default of 3 when neither package nor branch defines a limit', async () => {
    (prisma.ptPackage.findMany as Mock).mockResolvedValue([
      makeExpiredPackage({ totalSessions: 12, carryForwardLimit: null }),
    ]);
    (prisma.sessionInstance.findMany as Mock).mockResolvedValue([]); // 12 unused
    (prisma.branchSettings.findUnique as Mock).mockResolvedValue(null);
    (prisma.ptPackage.update as Mock).mockResolvedValue({});

    const result = await carryforward.processCycleEndsForPackages(null, ACTOR);

    expect(result.totalCarriedForward).toBe(3); // capped at global default
    expect(result.totalExpired).toBe(9);
  });

  it('counts onboardingUsedSessions toward used (less to carry forward)', async () => {
    (prisma.ptPackage.findMany as Mock).mockResolvedValue([
      makeExpiredPackage({
        totalSessions: 36,
        onboardingUsedSessions: 6,
        carryForwardLimit: 100, // unlimited
      }),
    ]);
    // 24 in-app completed + 6 onboarding = 30 used → 6 unused
    (prisma.sessionInstance.findMany as Mock).mockResolvedValue([
      ...Array(24).fill({ status: 'COMPLETED' }),
    ]);
    (prisma.ptPackage.update as Mock).mockResolvedValue({});

    const result = await carryforward.processCycleEndsForPackages(null, ACTOR);

    expect(result.totalCarriedForward).toBe(6);
    expect(result.totalExpired).toBe(0);
  });

  it('clamps carry-forward to zero when usage exceeds total', async () => {
    (prisma.ptPackage.findMany as Mock).mockResolvedValue([
      makeExpiredPackage({ totalSessions: 12, carryForwardLimit: 5 }),
    ]);
    (prisma.sessionInstance.findMany as Mock).mockResolvedValue([
      ...Array(15).fill({ status: 'COMPLETED' }), // over-used
    ]);
    (prisma.ptPackage.update as Mock).mockResolvedValue({});

    const result = await carryforward.processCycleEndsForPackages(null, ACTOR);

    expect(result.totalCarriedForward).toBe(0);
    expect(result.totalExpired).toBe(0);
  });

  it('cancelled sessions do not count toward used', async () => {
    (prisma.ptPackage.findMany as Mock).mockResolvedValue([
      makeExpiredPackage({ totalSessions: 12, carryForwardLimit: 3 }),
    ]);
    (prisma.sessionInstance.findMany as Mock).mockResolvedValue([
      ...Array(8).fill({ status: 'CANCELLED' }),
      ...Array(2).fill({ status: 'COMPLETED' }),
    ]);
    (prisma.ptPackage.update as Mock).mockResolvedValue({});

    const result = await carryforward.processCycleEndsForPackages(null, ACTOR);

    // 2 used → 10 unused → carry 3, expire 7
    expect(result.totalCarriedForward).toBe(3);
    expect(result.totalExpired).toBe(7);
  });

  it('writes an audit entry per package with full context', async () => {
    (prisma.ptPackage.findMany as Mock).mockResolvedValue([
      makeExpiredPackage({ totalSessions: 12, carryForwardLimit: 5 }),
    ]);
    (prisma.sessionInstance.findMany as Mock).mockResolvedValue([
      ...Array(8).fill({ status: 'COMPLETED' }),
    ]);
    (prisma.ptPackage.update as Mock).mockResolvedValue({});

    await carryforward.processCycleEndsForPackages(null, ACTOR);

    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PT_PACKAGE_CYCLE_PROCESSED',
        actorId: ACTOR,
        subjectType: 'PtPackage',
        subjectId: 'pkg-1',
        branchId: 'branch-1',
        newValue: expect.objectContaining({
          totalSessions: 12,
          used: 8,
          unused: 4,
          carryForwardOutSessions: 4,
          expired: 0,
        }),
      }),
    );
  });

  it('processes multiple packages in one run, summing totals', async () => {
    (prisma.ptPackage.findMany as Mock).mockResolvedValue([
      makeExpiredPackage({ id: 'pkg-1', totalSessions: 12, carryForwardLimit: 3 }),
      makeExpiredPackage({
        id: 'pkg-2',
        clientProfileId: 'client-2',
        totalSessions: 24,
        carryForwardLimit: 5,
      }),
    ]);
    // pkg-1: 8 used → 4 unused → carry 3, expire 1
    // pkg-2: 18 used → 6 unused → carry 5, expire 1
    (prisma.sessionInstance.findMany as Mock)
      .mockResolvedValueOnce(Array(8).fill({ status: 'COMPLETED' }))
      .mockResolvedValueOnce(Array(18).fill({ status: 'COMPLETED' }));
    (prisma.ptPackage.update as Mock).mockResolvedValue({});

    const result = await carryforward.processCycleEndsForPackages(null, ACTOR);

    expect(result.processed).toBe(2);
    expect(result.totalCarriedForward).toBe(3 + 5);
    expect(result.totalExpired).toBe(1 + 1);
  });

  it('caches branch defaults so multiple packages in the same branch only fetch settings once', async () => {
    (prisma.ptPackage.findMany as Mock).mockResolvedValue([
      makeExpiredPackage({ id: 'pkg-1', carryForwardLimit: null }),
      makeExpiredPackage({
        id: 'pkg-2',
        clientProfileId: 'client-2',
        carryForwardLimit: null,
      }),
    ]);
    (prisma.sessionInstance.findMany as Mock).mockResolvedValue([]);
    (prisma.branchSettings.findUnique as Mock).mockResolvedValue({ carryForwardLimit: 5 });
    (prisma.ptPackage.update as Mock).mockResolvedValue({});

    await carryforward.processCycleEndsForPackages(null, ACTOR);

    // Two packages, same branch → only one branchSettings lookup
    expect(prisma.branchSettings.findUnique).toHaveBeenCalledTimes(1);
  });

  it('scopes lookup to a single branch when branchId is supplied', async () => {
    (prisma.ptPackage.findMany as Mock).mockResolvedValue([]);

    await carryforward.processCycleEndsForPackages('branch-x', ACTOR);

    expect(prisma.ptPackage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ branchId: 'branch-x' }),
      }),
    );
  });

  it('omits branchId filter when called with null (cron mode)', async () => {
    (prisma.ptPackage.findMany as Mock).mockResolvedValue([]);

    await carryforward.processCycleEndsForPackages(null, ACTOR);

    const where = (prisma.ptPackage.findMany as Mock).mock.calls[0][0].where;
    expect(where.branchId).toBeUndefined();
  });
});
