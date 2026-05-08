import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    clientProfile: { findFirst: vi.fn() },
    trainerProfile: { findFirst: vi.fn() },
    ptPackagePlan: { findFirst: vi.fn() },
    ptPackage: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn() }));
vi.mock('@/lib/notifications', () => ({ sendNotification: vi.fn().mockResolvedValue(undefined) }));

import { prisma } from '@/lib/prisma';
import * as ptPackageService from '@/services/pt-package.service';

const BRANCH = 'branch-1';
const ACTOR = 'actor-1';
type Mock = ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

const baseInput = {
  branchId: BRANCH,
  clientProfileId: 'client-1',
  trainerProfileId: 'trainer-1',
  sessionsPerMonth: 12,
  sessionCharge: 500,
  startDate: '2026-04-23',
  actorId: ACTOR,
};

function setupHappyPath(plan?: { isActive: boolean; durationDays: number } | null) {
  (prisma.clientProfile.findFirst as Mock).mockResolvedValue({ id: 'client-1' });
  (prisma.trainerProfile.findFirst as Mock).mockResolvedValue({ id: 'trainer-1' });
  (prisma.ptPackage.findFirst as Mock).mockResolvedValue(null);
  (prisma.ptPackagePlan.findFirst as Mock).mockResolvedValue(plan ?? null);
  (prisma.ptPackage.create as Mock).mockImplementation(async ({ data }: { data: unknown }) => ({
    id: 'pkg-new',
    ...(data as Record<string, unknown>),
    client: { user: { id: 'cu', firstName: 'C', lastName: 'L', email: 'c@x' } },
    trainer: { user: { id: 'tu', firstName: 'T', lastName: 'L', email: 't@x' } },
    plan: null,
  }));
}

describe('createPtPackage with plan', () => {
  it('auto-computes totalSessions from plan duration when not provided', async () => {
    setupHappyPath({ isActive: true, durationDays: 90 });

    await ptPackageService.createPtPackage({
      ...baseInput,
      planId: 'plan-1',
    });

    expect(prisma.ptPackage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          planId: 'plan-1',
          totalSessions: 36, // 12 × round(90 / 30)
        }),
      }),
    );
  });

  it('respects an explicit totalSessions override even when plan is set', async () => {
    setupHappyPath({ isActive: true, durationDays: 90 });

    await ptPackageService.createPtPackage({
      ...baseInput,
      planId: 'plan-1',
      totalSessions: 40,
    });

    expect(prisma.ptPackage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ totalSessions: 40 }),
      }),
    );
  });

  it('falls back to sessionsPerMonth when no plan is selected', async () => {
    setupHappyPath(null);

    await ptPackageService.createPtPackage(baseInput);

    expect(prisma.ptPackage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ planId: null, totalSessions: 12 }),
      }),
    );
  });

  it('persists onboardingUsedSessions and onboardingNotes', async () => {
    setupHappyPath(null);

    await ptPackageService.createPtPackage({
      ...baseInput,
      onboardingUsedSessions: 6,
      onboardingNotes: 'Confirmed by manager',
    });

    expect(prisma.ptPackage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          onboardingUsedSessions: 6,
          onboardingNotes: 'Confirmed by manager',
        }),
      }),
    );
  });

  it('rejects with PLAN_NOT_FOUND when plan does not belong to this branch', async () => {
    (prisma.clientProfile.findFirst as Mock).mockResolvedValue({ id: 'client-1' });
    (prisma.trainerProfile.findFirst as Mock).mockResolvedValue({ id: 'trainer-1' });
    (prisma.ptPackage.findFirst as Mock).mockResolvedValue(null);
    (prisma.ptPackagePlan.findFirst as Mock).mockResolvedValue(null);

    await expect(
      ptPackageService.createPtPackage({ ...baseInput, planId: 'plan-x' }),
    ).rejects.toMatchObject({ code: 'PLAN_NOT_FOUND', statusCode: 404 });
    expect(prisma.ptPackage.create).not.toHaveBeenCalled();
  });

  it('rejects with PLAN_INACTIVE when plan is deactivated', async () => {
    (prisma.clientProfile.findFirst as Mock).mockResolvedValue({ id: 'client-1' });
    (prisma.trainerProfile.findFirst as Mock).mockResolvedValue({ id: 'trainer-1' });
    (prisma.ptPackage.findFirst as Mock).mockResolvedValue(null);
    (prisma.ptPackagePlan.findFirst as Mock).mockResolvedValue({
      isActive: false,
      durationDays: 30,
    });

    await expect(
      ptPackageService.createPtPackage({ ...baseInput, planId: 'plan-1' }),
    ).rejects.toMatchObject({ code: 'PLAN_INACTIVE', statusCode: 400 });
    expect(prisma.ptPackage.create).not.toHaveBeenCalled();
  });

  it('rounds totalSessions to nearest integer for non-monthly durations', async () => {
    // 12 sessions/month × 45 days / 30 = 18.00; clean number
    setupHappyPath({ isActive: true, durationDays: 45 });

    await ptPackageService.createPtPackage({
      ...baseInput,
      planId: 'plan-1',
    });

    expect(prisma.ptPackage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ totalSessions: 18 }),
      }),
    );
  });
});
