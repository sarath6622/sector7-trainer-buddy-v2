import { describe, it, expect, vi, beforeEach } from 'vitest';

const tx = {
  user: { update: vi.fn() },
  trainerProfile: { create: vi.fn() },
};

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      count: vi.fn(),
    },
    $transaction: vi.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  },
}));

vi.mock('@/lib/audit', () => ({
  auditLog: vi.fn(),
}));

import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';
import {
  assertAdminAccessChangeAllowed,
  listStaff,
  rolesForAccessLevel,
  updateStaffAccess,
} from '@/services/staff.service';

const mockFindFirst = prisma.user.findFirst as ReturnType<typeof vi.fn>;
const mockFindMany = prisma.user.findMany as ReturnType<typeof vi.fn>;
const mockFindUniqueOrThrow = prisma.user.findUniqueOrThrow as ReturnType<typeof vi.fn>;
const mockCount = prisma.user.count as ReturnType<typeof vi.fn>;
const mockAudit = auditLog as ReturnType<typeof vi.fn>;

const BRANCH = 'branch-1';
const ACTOR = 'admin-1';

function staffRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'u-2',
    firstName: 'Sumayya',
    lastName: 'K',
    email: 's@sector7.in',
    phone: null,
    profileImageUrl: null,
    roles: ['TRAINER'],
    isActive: true,
    lastLoginAt: null,
    trainerProfile: { id: 'tp-2', _count: { ptPackages: 0 } },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('rolesForAccessLevel', () => {
  it('promotes a trainer to head coach, keeping their specialisations', () => {
    expect(rolesForAccessLevel(['TRAINER', 'CROSSFIT_TRAINER'], 'HEAD_COACH')).toEqual([
      'BRANCH_ADMIN',
      'TRAINER',
      'CROSSFIT_TRAINER',
    ]);
  });

  it('gives an admin the general trainer role when becoming head coach', () => {
    expect(rolesForAccessLevel(['BRANCH_ADMIN'], 'HEAD_COACH')).toEqual([
      'BRANCH_ADMIN',
      'TRAINER',
    ]);
  });

  it('keeps SUPER_ADMIN rather than swapping it for BRANCH_ADMIN', () => {
    expect(rolesForAccessLevel(['SUPER_ADMIN', 'TRAINER'], 'ADMIN')).toEqual(['SUPER_ADMIN']);
  });

  it('drops admin roles when demoting to trainer, and preserves CLIENT', () => {
    expect(rolesForAccessLevel(['BRANCH_ADMIN', 'TRAINER', 'CLIENT'], 'TRAINER')).toEqual([
      'TRAINER',
      'CLIENT',
    ]);
  });
});

describe('assertAdminAccessChangeAllowed', () => {
  const base = {
    targetId: 'u-2',
    branchId: BRANCH,
    actorId: ACTOR,
    oldRoles: ['BRANCH_ADMIN'],
    oldActive: true,
    newActive: true,
  };

  it('allows changes that keep admin access without a DB check', async () => {
    await expect(
      assertAdminAccessChangeAllowed({ ...base, newRoles: ['BRANCH_ADMIN', 'TRAINER'] }),
    ).resolves.toBeUndefined();
    expect(mockCount).not.toHaveBeenCalled();
  });

  it('allows changes to users who never had admin access', async () => {
    await expect(
      assertAdminAccessChangeAllowed({
        ...base,
        oldRoles: ['TRAINER'],
        newRoles: [],
        newActive: false,
      }),
    ).resolves.toBeUndefined();
  });

  it('blocks removing your own admin access', async () => {
    await expect(
      assertAdminAccessChangeAllowed({ ...base, targetId: ACTOR, newRoles: ['TRAINER'] }),
    ).rejects.toMatchObject({ code: 'CANNOT_CHANGE_OWN_ACCESS', statusCode: 409 });
  });

  it('blocks deactivating the last active admin', async () => {
    mockCount.mockResolvedValue(0);

    await expect(
      assertAdminAccessChangeAllowed({ ...base, newRoles: ['BRANCH_ADMIN'], newActive: false }),
    ).rejects.toMatchObject({ code: 'LAST_ADMIN', statusCode: 409 });
    expect(mockCount).toHaveBeenCalledWith({
      where: expect.objectContaining({ branchId: BRANCH, id: { not: 'u-2' }, isActive: true }),
    });
  });

  it('allows removing an admin when another active admin remains', async () => {
    mockCount.mockResolvedValue(1);

    await expect(
      assertAdminAccessChangeAllowed({ ...base, newRoles: ['TRAINER'] }),
    ).resolves.toBeUndefined();
  });
});

describe('listStaff', () => {
  it('sorts active first, then head coach, admin, trainer, and counts admins', async () => {
    mockFindMany.mockResolvedValue([
      staffRow({ id: 't', firstName: 'Tara', roles: ['TRAINER'] }),
      staffRow({ id: 'a', firstName: 'Anu', roles: ['BRANCH_ADMIN'], trainerProfile: null }),
      staffRow({ id: 'x', firstName: 'Xavi', roles: ['BRANCH_ADMIN'], isActive: false }),
      staffRow({ id: 'h', firstName: 'Hari', roles: ['BRANCH_ADMIN', 'TRAINER'] }),
    ]);

    const result = await listStaff(BRANCH);

    expect(result.data.map((s) => s.id)).toEqual(['h', 'a', 't', 'x']);
    expect(result.data[0]!.accessLevel).toBe('HEAD_COACH');
    expect(result.activeAdminCount).toBe(2);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ branchId: BRANCH, deletedAt: null }),
      }),
    );
  });
});

describe('updateStaffAccess', () => {
  it('promotes an admin to head coach and creates their TrainerProfile', async () => {
    mockFindFirst.mockResolvedValue(staffRow({ roles: ['BRANCH_ADMIN'], trainerProfile: null }));
    mockFindUniqueOrThrow.mockResolvedValue(staffRow({ roles: ['BRANCH_ADMIN', 'TRAINER'] }));

    const result = await updateStaffAccess({
      id: 'u-2',
      branchId: BRANCH,
      actorId: ACTOR,
      accessLevel: 'HEAD_COACH',
    });

    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'u-2' },
      data: { roles: ['BRANCH_ADMIN', 'TRAINER'], isActive: true },
    });
    expect(tx.trainerProfile.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'u-2', branchId: BRANCH }),
    });
    expect(result.accessLevel).toBe('HEAD_COACH');
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'STAFF_ACCESS_UPDATED',
        actorId: ACTOR,
        subjectId: 'u-2',
        oldValue: { roles: ['BRANCH_ADMIN'], isActive: true },
        newValue: { roles: ['BRANCH_ADMIN', 'TRAINER'], isActive: true },
        branchId: BRANCH,
      }),
    );
  });

  it('does not create a second TrainerProfile', async () => {
    mockFindFirst.mockResolvedValue(staffRow());
    mockFindUniqueOrThrow.mockResolvedValue(staffRow({ roles: ['BRANCH_ADMIN', 'TRAINER'] }));

    await updateStaffAccess({
      id: 'u-2',
      branchId: BRANCH,
      actorId: ACTOR,
      accessLevel: 'HEAD_COACH',
    });

    expect(tx.trainerProfile.create).not.toHaveBeenCalled();
  });

  it('refuses to drop the trainer side while they have active clients', async () => {
    mockFindFirst.mockResolvedValue(
      staffRow({
        roles: ['BRANCH_ADMIN', 'TRAINER'],
        trainerProfile: { id: 'tp-2', _count: { ptPackages: 3 } },
      }),
    );

    await expect(
      updateStaffAccess({ id: 'u-2', branchId: BRANCH, actorId: ACTOR, accessLevel: 'ADMIN' }),
    ).rejects.toMatchObject({ code: 'HAS_ACTIVE_CLIENTS', statusCode: 409 });
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it('refuses to deactivate the last admin', async () => {
    mockFindFirst.mockResolvedValue(staffRow({ roles: ['BRANCH_ADMIN'], trainerProfile: null }));
    mockCount.mockResolvedValue(0);

    await expect(
      updateStaffAccess({ id: 'u-2', branchId: BRANCH, actorId: ACTOR, isActive: false }),
    ).rejects.toMatchObject({ code: 'LAST_ADMIN' });
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('returns 404 for users outside the branch or without a staff role', async () => {
    mockFindFirst.mockResolvedValue(null);

    await expect(
      updateStaffAccess({ id: 'client-1', branchId: BRANCH, actorId: ACTOR, isActive: false }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 });
    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'client-1', branchId: BRANCH, deletedAt: null }),
      }),
    );
  });
});
