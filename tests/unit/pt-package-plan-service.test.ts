import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    ptPackagePlan: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    ptPackage: {
      count: vi.fn(),
    },
  },
}));

vi.mock('@/lib/audit', () => ({ auditLog: vi.fn() }));

import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';
import * as planService from '@/services/pt-package-plan.service';

const BRANCH = 'branch-1';
const ACTOR = 'actor-1';
type Mock = ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

// ─── createPlan ──────────────────────────────────────────────────────

describe('createPlan', () => {
  const validInput = {
    branchId: BRANCH,
    actorId: ACTOR,
    name: 'Standard 12',
    sessionsPerMonth: 12,
    pricePerCycle: 4000,
    durationDays: 30,
  };

  it('creates a plan and writes an audit log', async () => {
    (prisma.ptPackagePlan.findUnique as Mock).mockResolvedValue(null);
    (prisma.ptPackagePlan.create as Mock).mockResolvedValue({
      id: 'plan-1',
      ...validInput,
      sessionChargeAmount: null,
      description: null,
    });

    const plan = await planService.createPlan(validInput);

    expect(plan.id).toBe('plan-1');
    expect(prisma.ptPackagePlan.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        branchId: BRANCH,
        name: 'Standard 12',
        sessionsPerMonth: 12,
        pricePerCycle: 4000,
        durationDays: 30,
        sessionChargeAmount: null,
        description: null,
      }),
    });
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PT_PACKAGE_PLAN_CREATED',
        actorId: ACTOR,
        branchId: BRANCH,
        subjectType: 'PtPackagePlan',
        subjectId: 'plan-1',
      }),
    );
  });

  it('rejects with 409 when name already exists in this branch', async () => {
    (prisma.ptPackagePlan.findUnique as Mock).mockResolvedValue({
      id: 'plan-existing',
      name: 'Standard 12',
    });

    await expect(planService.createPlan(validInput)).rejects.toMatchObject({
      code: 'DUPLICATE_PLAN_NAME',
      statusCode: 409,
    });
    expect(prisma.ptPackagePlan.create).not.toHaveBeenCalled();
  });
});

// ─── getPlans ────────────────────────────────────────────────────────

describe('getPlans', () => {
  it('returns paginated plans with assignment counts', async () => {
    const plans = [
      { id: 'p1', name: 'Standard 12', isActive: true, _count: { packages: 3 } },
      { id: 'p2', name: 'Trial 8', isActive: false, _count: { packages: 0 } },
    ];
    (prisma.ptPackagePlan.findMany as Mock).mockResolvedValue(plans);
    (prisma.ptPackagePlan.count as Mock).mockResolvedValue(2);

    const result = await planService.getPlans({ branchId: BRANCH });

    expect(result.data).toEqual(plans);
    expect(result.pagination).toEqual({ page: 1, pageSize: 20, total: 2, totalPages: 1 });
  });

  it('filters to active plans when activeOnly is set', async () => {
    (prisma.ptPackagePlan.findMany as Mock).mockResolvedValue([]);
    (prisma.ptPackagePlan.count as Mock).mockResolvedValue(0);

    await planService.getPlans({ branchId: BRANCH, activeOnly: true });

    expect(prisma.ptPackagePlan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { branchId: BRANCH, isActive: true },
      }),
    );
  });
});

// ─── getPlanById ─────────────────────────────────────────────────────

describe('getPlanById', () => {
  it('returns the plan when found', async () => {
    (prisma.ptPackagePlan.findFirst as Mock).mockResolvedValue({
      id: 'plan-1',
      name: 'Standard 12',
      _count: { packages: 2 },
    });

    const plan = await planService.getPlanById('plan-1', BRANCH);
    expect(plan.id).toBe('plan-1');
  });

  it('throws 404 when not found', async () => {
    (prisma.ptPackagePlan.findFirst as Mock).mockResolvedValue(null);

    await expect(planService.getPlanById('plan-x', BRANCH)).rejects.toMatchObject({
      code: 'PLAN_NOT_FOUND',
      statusCode: 404,
    });
  });
});

// ─── updatePlan ──────────────────────────────────────────────────────

describe('updatePlan', () => {
  it('throws 404 when plan does not exist', async () => {
    (prisma.ptPackagePlan.findFirst as Mock).mockResolvedValue(null);

    await expect(
      planService.updatePlan('plan-x', BRANCH, ACTOR, { name: 'Renamed' }),
    ).rejects.toMatchObject({ code: 'PLAN_NOT_FOUND', statusCode: 404 });
  });

  it('rejects rename to a name already in use', async () => {
    (prisma.ptPackagePlan.findFirst as Mock).mockResolvedValue({
      id: 'plan-1',
      name: 'Old',
      sessionsPerMonth: 12,
      pricePerCycle: 4000,
      sessionChargeAmount: null,
      durationDays: 30,
      isActive: true,
    });
    (prisma.ptPackagePlan.findUnique as Mock).mockResolvedValue({
      id: 'plan-2',
      name: 'New',
    });

    await expect(
      planService.updatePlan('plan-1', BRANCH, ACTOR, { name: 'New' }),
    ).rejects.toMatchObject({ code: 'DUPLICATE_PLAN_NAME', statusCode: 409 });
    expect(prisma.ptPackagePlan.update).not.toHaveBeenCalled();
  });

  it('updates the plan and audit-logs old/new values', async () => {
    (prisma.ptPackagePlan.findFirst as Mock).mockResolvedValue({
      id: 'plan-1',
      name: 'Standard 12',
      sessionsPerMonth: 12,
      pricePerCycle: 4000,
      sessionChargeAmount: null,
      durationDays: 30,
      isActive: true,
    });
    (prisma.ptPackagePlan.update as Mock).mockResolvedValue({
      id: 'plan-1',
      name: 'Standard 12',
      sessionsPerMonth: 12,
      pricePerCycle: 4500,
      sessionChargeAmount: null,
      durationDays: 30,
      isActive: true,
    });

    await planService.updatePlan('plan-1', BRANCH, ACTOR, { pricePerCycle: 4500 });

    expect(prisma.ptPackagePlan.update).toHaveBeenCalledWith({
      where: { id: 'plan-1' },
      data: { pricePerCycle: 4500 },
    });
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PT_PACKAGE_PLAN_UPDATED',
        oldValue: expect.objectContaining({ pricePerCycle: 4000 }),
        newValue: expect.objectContaining({ pricePerCycle: 4500 }),
      }),
    );
  });
});

// ─── deactivatePlan ──────────────────────────────────────────────────

describe('deactivatePlan', () => {
  it('throws 404 when plan does not exist', async () => {
    (prisma.ptPackagePlan.findFirst as Mock).mockResolvedValue(null);

    await expect(planService.deactivatePlan('plan-x', BRANCH, ACTOR)).rejects.toMatchObject({
      code: 'PLAN_NOT_FOUND',
      statusCode: 404,
    });
  });

  it('returns alreadyInactive when plan is already deactivated', async () => {
    (prisma.ptPackagePlan.findFirst as Mock).mockResolvedValue({
      id: 'plan-1',
      isActive: false,
    });

    const result = await planService.deactivatePlan('plan-1', BRANCH, ACTOR);
    expect(result).toEqual({ success: true, alreadyInactive: true });
    expect(prisma.ptPackagePlan.update).not.toHaveBeenCalled();
  });

  it('rejects with 409 when active assignments exist and force=false', async () => {
    (prisma.ptPackagePlan.findFirst as Mock).mockResolvedValue({
      id: 'plan-1',
      isActive: true,
    });
    (prisma.ptPackage.count as Mock).mockResolvedValue(3);

    await expect(planService.deactivatePlan('plan-1', BRANCH, ACTOR, false)).rejects.toMatchObject({
      code: 'PLAN_HAS_ACTIVE_ASSIGNMENTS',
      statusCode: 409,
    });
    expect(prisma.ptPackagePlan.update).not.toHaveBeenCalled();
  });

  it('proceeds with force=true even when active assignments exist', async () => {
    (prisma.ptPackagePlan.findFirst as Mock).mockResolvedValue({
      id: 'plan-1',
      isActive: true,
    });
    (prisma.ptPackage.count as Mock).mockResolvedValue(3);
    (prisma.ptPackagePlan.update as Mock).mockResolvedValue({});

    const result = await planService.deactivatePlan('plan-1', BRANCH, ACTOR, true);

    expect(result).toEqual({ success: true });
    expect(prisma.ptPackagePlan.update).toHaveBeenCalledWith({
      where: { id: 'plan-1' },
      data: { isActive: false },
    });
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PT_PACKAGE_PLAN_DEACTIVATED',
        metadata: { force: true, activeAssignments: 3 },
      }),
    );
  });

  it('proceeds normally when no active assignments exist', async () => {
    (prisma.ptPackagePlan.findFirst as Mock).mockResolvedValue({
      id: 'plan-1',
      isActive: true,
    });
    (prisma.ptPackage.count as Mock).mockResolvedValue(0);
    (prisma.ptPackagePlan.update as Mock).mockResolvedValue({});

    const result = await planService.deactivatePlan('plan-1', BRANCH, ACTOR);

    expect(result).toEqual({ success: true });
    expect(prisma.ptPackagePlan.update).toHaveBeenCalled();
  });
});
