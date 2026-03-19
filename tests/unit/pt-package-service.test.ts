import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock Dependencies ─────────────────────────────────────────────
vi.mock('@/lib/prisma', () => ({
  prisma: {
    clientProfile: {
      findFirst: vi.fn(),
    },
    trainerProfile: {
      findFirst: vi.fn(),
    },
    ptPackage: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('@/lib/audit', () => ({
  auditLog: vi.fn(),
}));

import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';
import * as ptPackageService from '@/services/pt-package.service';

const BRANCH_ID = 'branch-1';
const ACTOR_ID = 'actor-1';
const CLIENT_PROFILE_ID = 'client-profile-1';
const TRAINER_PROFILE_ID = 'trainer-profile-1';

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── createPtPackage ────────────────────────────────────────────────

describe('createPtPackage', () => {
  const input = {
    branchId: BRANCH_ID,
    clientProfileId: CLIENT_PROFILE_ID,
    trainerProfileId: TRAINER_PROFILE_ID,
    sessionsPerMonth: 12,
    sessionCharge: 500,
    startDate: '2026-04-01',
    actorId: ACTOR_ID,
  };

  it('should throw if client profile not found', async () => {
    (prisma.clientProfile.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(ptPackageService.createPtPackage(input)).rejects.toThrow(
      'Client profile not found',
    );
  });

  it('should throw if trainer profile not found', async () => {
    (prisma.clientProfile.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: CLIENT_PROFILE_ID,
    });
    (prisma.trainerProfile.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(ptPackageService.createPtPackage(input)).rejects.toThrow(
      'Trainer profile not found',
    );
  });

  it('should throw if duplicate active mapping exists', async () => {
    (prisma.clientProfile.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: CLIENT_PROFILE_ID,
    });
    (prisma.trainerProfile.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: TRAINER_PROFILE_ID,
    });
    (prisma.ptPackage.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'existing-pkg',
    });

    await expect(ptPackageService.createPtPackage(input)).rejects.toThrow(
      'active mapping already exists',
    );
  });

  it('should create a PT package and write audit log', async () => {
    (prisma.clientProfile.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: CLIENT_PROFILE_ID,
    });
    (prisma.trainerProfile.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: TRAINER_PROFILE_ID,
    });
    (prisma.ptPackage.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null); // no duplicate
    const created = {
      id: 'pkg-1',
      branchId: BRANCH_ID,
      clientProfileId: CLIENT_PROFILE_ID,
      trainerProfileId: TRAINER_PROFILE_ID,
      sessionsPerMonth: 12,
      sessionChargeAmount: 500,
      startDate: new Date('2026-04-01'),
      client: { user: { firstName: 'Test', lastName: 'Client', email: 'c@test.com' } },
      trainer: { user: { firstName: 'Test', lastName: 'Trainer', email: 't@test.com' } },
    };
    (prisma.ptPackage.create as ReturnType<typeof vi.fn>).mockResolvedValue(created);

    const result = await ptPackageService.createPtPackage(input);

    expect(result).toEqual(created);
    expect(prisma.ptPackage.create).toHaveBeenCalledOnce();
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PT_PACKAGE_CREATED',
        subjectType: 'PtPackage',
        subjectId: 'pkg-1',
        branchId: BRANCH_ID,
      }),
    );
  });
});

// ─── getPtPackages ──────────────────────────────────────────────────

describe('getPtPackages', () => {
  it('should filter by branchId', async () => {
    (prisma.ptPackage.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await ptPackageService.getPtPackages({ branchId: BRANCH_ID });

    expect(prisma.ptPackage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { branchId: BRANCH_ID },
      }),
    );
  });

  it('should filter by trainerId and clientId', async () => {
    (prisma.ptPackage.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await ptPackageService.getPtPackages({
      branchId: BRANCH_ID,
      trainerId: TRAINER_PROFILE_ID,
      clientId: CLIENT_PROFILE_ID,
    });

    expect(prisma.ptPackage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          branchId: BRANCH_ID,
          trainerProfileId: TRAINER_PROFILE_ID,
          clientProfileId: CLIENT_PROFILE_ID,
        },
      }),
    );
  });
});

// ─── getPtPackageById ───────────────────────────────────────────────

describe('getPtPackageById', () => {
  it('should throw if not found', async () => {
    (prisma.ptPackage.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(ptPackageService.getPtPackageById('pkg-x', BRANCH_ID)).rejects.toThrow(
      'PT package not found',
    );
  });

  it('should return the package if found', async () => {
    const pkg = { id: 'pkg-1', branchId: BRANCH_ID };
    (prisma.ptPackage.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(pkg);

    const result = await ptPackageService.getPtPackageById('pkg-1', BRANCH_ID);
    expect(result).toEqual(pkg);
  });
});

// ─── updatePtPackage ────────────────────────────────────────────────

describe('updatePtPackage', () => {
  it('should throw if not found', async () => {
    (prisma.ptPackage.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(
      ptPackageService.updatePtPackage('pkg-x', BRANCH_ID, ACTOR_ID, { sessionsPerMonth: 8 }),
    ).rejects.toThrow('PT package not found');
  });

  it('should update and audit log', async () => {
    const existing = {
      id: 'pkg-1',
      branchId: BRANCH_ID,
      sessionsPerMonth: 12,
      sessionChargeAmount: 500,
      isActive: true,
    };
    (prisma.ptPackage.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(existing);
    const updated = { ...existing, sessionsPerMonth: 8 };
    (prisma.ptPackage.update as ReturnType<typeof vi.fn>).mockResolvedValue(updated);

    const result = await ptPackageService.updatePtPackage('pkg-1', BRANCH_ID, ACTOR_ID, {
      sessionsPerMonth: 8,
    });

    expect(result.sessionsPerMonth).toBe(8);
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PT_PACKAGE_UPDATED',
        subjectId: 'pkg-1',
      }),
    );
  });

  it('should set endDate when deactivating', async () => {
    const existing = {
      id: 'pkg-1',
      branchId: BRANCH_ID,
      sessionsPerMonth: 12,
      sessionChargeAmount: null,
      isActive: true,
    };
    (prisma.ptPackage.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(existing);
    (prisma.ptPackage.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...existing,
      isActive: false,
    });

    await ptPackageService.updatePtPackage('pkg-1', BRANCH_ID, ACTOR_ID, { isActive: false });

    expect(prisma.ptPackage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isActive: false,
          endDate: expect.any(Date),
        }),
      }),
    );
  });
});

// ─── deletePtPackage ────────────────────────────────────────────────

describe('deletePtPackage', () => {
  it('should throw if not found', async () => {
    (prisma.ptPackage.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(ptPackageService.deletePtPackage('pkg-x', BRANCH_ID, ACTOR_ID)).rejects.toThrow(
      'PT package not found',
    );
  });

  it('should deactivate and audit log', async () => {
    (prisma.ptPackage.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'pkg-1',
      branchId: BRANCH_ID,
      isActive: true,
    });
    (prisma.ptPackage.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'pkg-1',
      isActive: false,
      endDate: new Date(),
    });

    const result = await ptPackageService.deletePtPackage('pkg-1', BRANCH_ID, ACTOR_ID);

    expect(result).toEqual({ success: true });
    expect(prisma.ptPackage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { isActive: false, endDate: expect.any(Date) },
      }),
    );
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PT_PACKAGE_DEACTIVATED',
      }),
    );
  });
});
