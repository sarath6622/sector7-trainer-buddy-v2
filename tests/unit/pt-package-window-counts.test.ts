import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    ptPackage: {
      findFirst: vi.fn(),
    },
    sessionInstance: {
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from '@/lib/prisma';
import * as ptPackageService from '@/services/pt-package.service';

const BRANCH = 'branch-1';
type Mock = ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

function makePackage(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'pkg-1',
    clientProfileId: 'client-1',
    trainerProfileId: 'trainer-1',
    sessionsPerMonth: 12,
    totalSessions: 36,
    onboardingUsedSessions: 0,
    onboardingNotes: null,
    startDate: new Date('2026-04-23T00:00:00.000Z'),
    endDate: new Date('2026-07-22T23:59:59.999Z'),
    isActive: true,
    plan: { id: 'plan-1', name: 'Standard 3', durationDays: 90 },
    ...overrides,
  };
}

describe('getPackageWindowCounts', () => {
  it('throws 404 when package not found', async () => {
    (prisma.ptPackage.findFirst as Mock).mockResolvedValue(null);

    await expect(ptPackageService.getPackageWindowCounts('pkg-x', BRANCH)).rejects.toMatchObject({
      code: 'PT_PACKAGE_NOT_FOUND',
      statusCode: 404,
    });
  });

  it('counts COMPLETED + NO_SHOW as used, SCHEDULED + IN_PROGRESS as upcoming', async () => {
    (prisma.ptPackage.findFirst as Mock).mockResolvedValue(makePackage());
    (prisma.sessionInstance.findMany as Mock).mockResolvedValue([
      { status: 'COMPLETED' },
      { status: 'COMPLETED' },
      { status: 'COMPLETED' },
      { status: 'NO_SHOW' },
      { status: 'SCHEDULED' },
      { status: 'SCHEDULED' },
      { status: 'IN_PROGRESS' },
      { status: 'CANCELLED' },
    ]);

    const result = await ptPackageService.getPackageWindowCounts('pkg-1', BRANCH);

    expect(result.completed).toBe(3);
    expect(result.noShow).toBe(1);
    expect(result.scheduled).toBe(2);
    expect(result.inProgress).toBe(1);
    expect(result.cancelled).toBe(1);
    expect(result.used).toBe(4); // 3 completed + 1 no-show + 0 onboarding
    expect(result.upcoming).toBe(3); // 2 scheduled + 1 in-progress
    expect(result.remaining).toBe(36 - 4 - 3); // 29
  });

  it('adds onboardingUsedSessions to the used count', async () => {
    (prisma.ptPackage.findFirst as Mock).mockResolvedValue(
      makePackage({ onboardingUsedSessions: 6 }),
    );
    (prisma.sessionInstance.findMany as Mock).mockResolvedValue([{ status: 'COMPLETED' }]);

    const result = await ptPackageService.getPackageWindowCounts('pkg-1', BRANCH);

    expect(result.used).toBe(7); // 1 completed + 6 onboarding
    expect(result.remaining).toBe(36 - 7 - 0); // 29
  });

  it('clamps remaining to zero when usage exceeds total', async () => {
    (prisma.ptPackage.findFirst as Mock).mockResolvedValue(
      makePackage({ totalSessions: 5, onboardingUsedSessions: 10 }),
    );
    (prisma.sessionInstance.findMany as Mock).mockResolvedValue([]);

    const result = await ptPackageService.getPackageWindowCounts('pkg-1', BRANCH);

    expect(result.remaining).toBe(0);
  });

  it('CANCELLED sessions do not count toward used or upcoming', async () => {
    (prisma.ptPackage.findFirst as Mock).mockResolvedValue(makePackage());
    (prisma.sessionInstance.findMany as Mock).mockResolvedValue([
      { status: 'CANCELLED' },
      { status: 'CANCELLED' },
      { status: 'CANCELLED' },
    ]);

    const result = await ptPackageService.getPackageWindowCounts('pkg-1', BRANCH);

    expect(result.cancelled).toBe(3);
    expect(result.used).toBe(0);
    expect(result.upcoming).toBe(0);
    expect(result.remaining).toBe(36);
  });

  it('returns window timing math (totalDays, daysElapsed, daysRemaining)', async () => {
    // Freeze time to mid-window so we can assert math precisely
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-23T12:00:00.000Z')); // 30 days into a 90-day window

    (prisma.ptPackage.findFirst as Mock).mockResolvedValue(makePackage());
    (prisma.sessionInstance.findMany as Mock).mockResolvedValue([]);

    const result = await ptPackageService.getPackageWindowCounts('pkg-1', BRANCH);

    expect(result.window.totalDays).toBe(91); // Apr 23 → Jul 22 inclusive
    expect(result.window.daysElapsed).toBe(30);
    expect(result.window.daysRemaining).toBe(61);

    vi.useRealTimers();
  });

  it('queries sessions across the package window only', async () => {
    const pkg = makePackage();
    (prisma.ptPackage.findFirst as Mock).mockResolvedValue(pkg);
    (prisma.sessionInstance.findMany as Mock).mockResolvedValue([]);

    await ptPackageService.getPackageWindowCounts('pkg-1', BRANCH);

    expect(prisma.sessionInstance.findMany).toHaveBeenCalledWith({
      where: {
        branchId: BRANCH,
        clientProfileId: 'client-1',
        scheduledDate: { gte: pkg.startDate, lte: pkg.endDate },
      },
      select: { status: true },
    });
  });

  it('falls back to startDate + 30 days when endDate is null', async () => {
    const start = new Date('2026-05-01T00:00:00.000Z');
    (prisma.ptPackage.findFirst as Mock).mockResolvedValue(
      makePackage({ startDate: start, endDate: null }),
    );
    (prisma.sessionInstance.findMany as Mock).mockResolvedValue([]);

    const result = await ptPackageService.getPackageWindowCounts('pkg-1', BRANCH);

    const expectedEnd = new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000);
    expect(new Date(result.window.end).getTime()).toBe(expectedEnd.getTime());
  });

  it('exposes onboardingNotes through the response', async () => {
    (prisma.ptPackage.findFirst as Mock).mockResolvedValue(
      makePackage({
        onboardingUsedSessions: 4,
        onboardingNotes: 'Confirmed by manager Apr 23–May 5',
      }),
    );
    (prisma.sessionInstance.findMany as Mock).mockResolvedValue([]);

    const result = await ptPackageService.getPackageWindowCounts('pkg-1', BRANCH);

    expect(result.onboardingUsedSessions).toBe(4);
    expect(result.onboardingNotes).toBe('Confirmed by manager Apr 23–May 5');
  });
});
