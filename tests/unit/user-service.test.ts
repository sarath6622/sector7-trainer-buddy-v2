import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock Dependencies ─────────────────────────────────────────────
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    trainerProfile: {
      create: vi.fn(),
      update: vi.fn(),
    },
    clientProfile: {
      create: vi.fn(),
      update: vi.fn(),
    },
    ptPackage: {
      findMany: vi.fn(),
    },
    sessionInstance: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('@/lib/audit', () => ({
  auditLog: vi.fn(),
}));

vi.mock('bcryptjs', () => ({
  hash: vi.fn().mockResolvedValue('$2b$12$hashedpassword'),
}));

import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';
import * as userService from '@/services/user.service';
import { AppError } from '@/lib/errors';

const mockedPrisma = vi.mocked(prisma);
const mockedAuditLog = vi.mocked(auditLog);

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── createUser ─────────────────────────────────────────────────────

describe('createUser', () => {
  const baseInput = {
    email: 'newclient@sector7.com',
    password: 'SecurePass1!',
    firstName: 'New',
    lastName: 'Client',
    role: 'CLIENT' as const,
    branchId: 'branch-1',
    actorId: 'admin-1',
  };

  it('throws DUPLICATE_EMAIL when email already exists', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({ id: 'existing' } as never);

    await expect(userService.createUser(baseInput)).rejects.toThrow(AppError);
    await expect(userService.createUser(baseInput)).rejects.toThrow(
      'A user with this email already exists',
    );
  });

  it('creates a CLIENT user with client profile', async () => {
    mockedPrisma.user.findUnique
      .mockResolvedValueOnce(null) // duplicate check
      .mockResolvedValueOnce({ id: 'u1', role: 'CLIENT', clientProfile: {} } as never); // final fetch
    mockedPrisma.user.create.mockResolvedValue({
      id: 'u1',
      email: baseInput.email,
      role: 'CLIENT',
      firstName: 'New',
      lastName: 'Client',
    } as never);
    mockedPrisma.clientProfile.create.mockResolvedValue({} as never);

    const result = await userService.createUser(baseInput);

    expect(mockedPrisma.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        branchId: 'branch-1',
        email: 'newclient@sector7.com',
        role: 'CLIENT',
        passwordHash: '$2b$12$hashedpassword',
      }),
    });
    expect(mockedPrisma.clientProfile.create).toHaveBeenCalled();
    expect(mockedPrisma.trainerProfile.create).not.toHaveBeenCalled();
    expect(result).toBeDefined();
  });

  it('creates a TRAINER user with trainer profile', async () => {
    const trainerInput = {
      ...baseInput,
      email: 'trainer@sector7.com',
      role: 'TRAINER' as const,
      specialties: ['strength'],
      certifications: ['ACE-CPT'],
      workingDays: ['MONDAY', 'WEDNESDAY'],
    };

    mockedPrisma.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'u2', role: 'TRAINER', trainerProfile: {} } as never);
    mockedPrisma.user.create.mockResolvedValue({
      id: 'u2',
      email: trainerInput.email,
      role: 'TRAINER',
      firstName: 'New',
      lastName: 'Client',
    } as never);
    mockedPrisma.trainerProfile.create.mockResolvedValue({} as never);

    await userService.createUser(trainerInput);

    expect(mockedPrisma.trainerProfile.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u2',
        branchId: 'branch-1',
        specialties: ['strength'],
        certifications: ['ACE-CPT'],
        workingDays: ['MONDAY', 'WEDNESDAY'],
      }),
    });
    expect(mockedPrisma.clientProfile.create).not.toHaveBeenCalled();
  });

  it('writes an audit log on user creation', async () => {
    mockedPrisma.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'u3' } as never);
    mockedPrisma.user.create.mockResolvedValue({
      id: 'u3',
      email: baseInput.email,
      role: 'CLIENT',
      firstName: 'New',
      lastName: 'Client',
    } as never);
    mockedPrisma.clientProfile.create.mockResolvedValue({} as never);

    await userService.createUser(baseInput);

    expect(mockedAuditLog).toHaveBeenCalledWith({
      action: 'USER_CREATED',
      actorId: 'admin-1',
      subjectType: 'User',
      subjectId: 'u3',
      newValue: expect.objectContaining({ email: baseInput.email, role: 'CLIENT' }),
      branchId: 'branch-1',
    });
  });
});

// ─── getUsers ───────────────────────────────────────────────────────

describe('getUsers', () => {
  it('queries with branchId scope and pagination', async () => {
    mockedPrisma.user.findMany.mockResolvedValue([]);
    mockedPrisma.user.count.mockResolvedValue(0);

    const result = await userService.getUsers({
      branchId: 'branch-1',
      page: 1,
      pageSize: 10,
    });

    expect(mockedPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { branchId: 'branch-1', deletedAt: null },
        skip: 0,
        take: 10,
      }),
    );
    expect(result.pagination.page).toBe(1);
    expect(result.pagination.total).toBe(0);
  });

  it('filters by role when provided', async () => {
    mockedPrisma.user.findMany.mockResolvedValue([]);
    mockedPrisma.user.count.mockResolvedValue(0);

    await userService.getUsers({
      branchId: 'branch-1',
      role: 'TRAINER',
      page: 1,
      pageSize: 10,
    });

    expect(mockedPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { branchId: 'branch-1', deletedAt: null, roles: { hasSome: ['TRAINER'] } },
      }),
    );
  });

  it('calculates totalPages correctly', async () => {
    mockedPrisma.user.findMany.mockResolvedValue([]);
    mockedPrisma.user.count.mockResolvedValue(25);

    const result = await userService.getUsers({
      branchId: 'branch-1',
      page: 1,
      pageSize: 10,
    });

    expect(result.pagination.totalPages).toBe(3);
  });

  it('searches name / email / phone with every term required (multi-term AND)', async () => {
    mockedPrisma.user.findMany.mockResolvedValue([]);
    mockedPrisma.user.count.mockResolvedValue(0);

    await userService.getUsers({
      branchId: 'branch-1',
      role: 'CLIENT',
      page: 1,
      pageSize: 10,
      search: 'asha sujith',
    });

    const termOr = (term: string) => ({
      OR: [
        { firstName: { contains: term, mode: 'insensitive' } },
        { lastName: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
        { phone: { contains: term, mode: 'insensitive' } },
      ],
    });

    expect(mockedPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          branchId: 'branch-1',
          deletedAt: null,
          roles: { hasSome: ['CLIENT'] },
          AND: [termOr('asha'), termOr('sujith')],
        }),
      }),
    );
  });

  it('filters by isActive when status=inactive', async () => {
    mockedPrisma.user.findMany.mockResolvedValue([]);
    mockedPrisma.user.count.mockResolvedValue(0);

    await userService.getUsers({
      branchId: 'branch-1',
      role: 'CLIENT',
      page: 1,
      pageSize: 10,
      status: 'inactive',
    });

    expect(mockedPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isActive: false }),
      }),
    );
  });

  it('returns a branch-wide activeCount independent of the filtered total', async () => {
    mockedPrisma.user.findMany.mockResolvedValue([]);
    // Promise.all order: count(filtered total) then count(active tally)
    mockedPrisma.user.count.mockResolvedValueOnce(3).mockResolvedValueOnce(42);

    const result = await userService.getUsers({
      branchId: 'branch-1',
      role: 'CLIENT',
      page: 1,
      pageSize: 10,
      search: 'as',
    });

    expect(result.pagination.total).toBe(3);
    expect(result.activeCount).toBe(42);
    expect(mockedPrisma.user.count).toHaveBeenCalledWith({
      where: {
        branchId: 'branch-1',
        deletedAt: null,
        roles: { hasSome: ['CLIENT'] },
        isActive: true,
      },
    });
  });

  it('filters by trainer via the active package', async () => {
    mockedPrisma.user.findMany.mockResolvedValue([]);
    mockedPrisma.user.count.mockResolvedValue(0);

    await userService.getUsers({
      branchId: 'branch-1',
      role: 'CLIENT',
      page: 1,
      pageSize: 10,
      trainerId: 'trainer-1',
    });

    expect(mockedPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clientProfile: {
            is: { ptPackages: { some: { isActive: true, trainerProfileId: 'trainer-1' } } },
          },
        }),
      }),
    );
  });

  it('filters unassigned clients (no active package)', async () => {
    mockedPrisma.user.findMany.mockResolvedValue([]);
    mockedPrisma.user.count.mockResolvedValue(0);

    await userService.getUsers({
      branchId: 'branch-1',
      role: 'CLIENT',
      page: 1,
      pageSize: 10,
      trainerId: 'unassigned',
    });

    expect(mockedPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clientProfile: { is: { ptPackages: { none: { isActive: true } } } },
        }),
      }),
    );
  });

  it('filters expiring-soon by package endDate window', async () => {
    mockedPrisma.user.findMany.mockResolvedValue([]);
    mockedPrisma.user.count.mockResolvedValue(0);

    await userService.getUsers({
      branchId: 'branch-1',
      role: 'CLIENT',
      page: 1,
      pageSize: 10,
      attention: 'expiring_soon',
    });

    const call = mockedPrisma.user.findMany.mock.calls[0]![0] as {
      where: {
        clientProfile: {
          is: { ptPackages: { some: { isActive: boolean; endDate: { gte: Date; lte: Date } } } };
        };
      };
    };
    const endDate = call.where.clientProfile.is.ptPackages.some.endDate;
    expect(call.where.clientProfile.is.ptPackages.some.isActive).toBe(true);
    expect(endDate.gte).toBeInstanceOf(Date);
    expect(endDate.lte.getTime()).toBeGreaterThan(endDate.gte.getTime());
  });

  it('resolves low-session clients via a pre-pass and constrains by id', async () => {
    // One package with 8 total, 7 consumed → 1 left, redThreshold = 2 → "low".
    mockedPrisma.ptPackage.findMany.mockResolvedValue([
      {
        clientProfileId: 'c1',
        startDate: new Date('2026-05-01'),
        endDate: new Date('2026-07-01'),
        totalSessions: 8,
        onboardingUsedSessions: 0,
        sessionsPerMonth: 8,
      },
    ] as never);
    mockedPrisma.sessionInstance.findMany.mockResolvedValue(
      Array.from({ length: 7 }, () => ({
        clientProfileId: 'c1',
        scheduledDate: new Date('2026-05-15'),
      })) as never,
    );
    mockedPrisma.user.findMany.mockResolvedValue([]);
    mockedPrisma.user.count.mockResolvedValue(0);

    await userService.getUsers({
      branchId: 'branch-1',
      role: 'CLIENT',
      page: 1,
      pageSize: 10,
      attention: 'low_sessions',
    });

    expect(mockedPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clientProfile: { is: { ptPackages: { some: { isActive: true } }, id: { in: ['c1'] } } },
        }),
      }),
    );
  });
});

// ─── getUserById ────────────────────────────────────────────────────

describe('getUserById', () => {
  it('returns user when found in same branch', async () => {
    const mockUser = { id: 'u1', branchId: 'branch-1', role: 'CLIENT' };
    mockedPrisma.user.findFirst.mockResolvedValue(mockUser as never);

    const result = await userService.getUserById('u1', 'branch-1');
    expect(result).toEqual(mockUser);
    expect(mockedPrisma.user.findFirst).toHaveBeenCalledWith({
      where: { id: 'u1', branchId: 'branch-1', deletedAt: null },
      include: { trainerProfile: true, clientProfile: true },
    });
  });

  it('throws NOT_FOUND when user does not exist', async () => {
    mockedPrisma.user.findFirst.mockResolvedValue(null);

    await expect(userService.getUserById('u999', 'branch-1')).rejects.toThrow(AppError);
    await expect(userService.getUserById('u999', 'branch-1')).rejects.toThrow('User not found');
  });

  it('enforces branch scoping - user in different branch not found', async () => {
    // User exists in branch-2 but we query branch-1
    mockedPrisma.user.findFirst.mockResolvedValue(null);

    await expect(userService.getUserById('u1', 'branch-1')).rejects.toThrow('User not found');
  });
});

// ─── updateUser ─────────────────────────────────────────────────────

describe('updateUser', () => {
  it('throws NOT_FOUND if user not in branch', async () => {
    mockedPrisma.user.findFirst.mockResolvedValue(null);

    await expect(
      userService.updateUser('u1', { firstName: 'Updated' }, 'branch-1', 'actor-1'),
    ).rejects.toThrow('User not found');
  });

  it('updates user base fields', async () => {
    const existing = {
      id: 'u1',
      branchId: 'branch-1',
      firstName: 'Old',
      lastName: 'Name',
      phone: null,
      role: 'CLIENT',
      trainerProfile: null,
      clientProfile: null,
    };
    mockedPrisma.user.findFirst.mockResolvedValue(existing as never);
    mockedPrisma.user.update.mockResolvedValue({} as never);
    mockedPrisma.user.findUnique.mockResolvedValue({ id: 'u1', firstName: 'New' } as never);

    await userService.updateUser('u1', { firstName: 'New' }, 'branch-1', 'actor-1');

    expect(mockedPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { firstName: 'New' },
    });
  });

  it('updates trainer profile fields when profile exists', async () => {
    const existing = {
      id: 'u1',
      branchId: 'branch-1',
      firstName: 'Trainer',
      lastName: 'One',
      phone: null,
      role: 'TRAINER',
      trainerProfile: { id: 'tp1' },
      clientProfile: null,
    };
    mockedPrisma.user.findFirst.mockResolvedValue(existing as never);
    mockedPrisma.trainerProfile.update.mockResolvedValue({} as never);
    mockedPrisma.user.findUnique.mockResolvedValue({ id: 'u1' } as never);

    await userService.updateUser(
      'u1',
      { specialties: ['yoga', 'pilates'], workingHoursStart: '08:00' },
      'branch-1',
      'actor-1',
    );

    expect(mockedPrisma.trainerProfile.update).toHaveBeenCalledWith({
      where: { id: 'tp1' },
      data: expect.objectContaining({
        specialties: ['yoga', 'pilates'],
        workingHoursStart: '08:00',
      }),
    });
  });

  it('updates client profile fields when profile exists', async () => {
    const existing = {
      id: 'u1',
      branchId: 'branch-1',
      firstName: 'Client',
      lastName: 'One',
      phone: null,
      role: 'CLIENT',
      trainerProfile: null,
      clientProfile: { id: 'cp1' },
    };
    mockedPrisma.user.findFirst.mockResolvedValue(existing as never);
    mockedPrisma.clientProfile.update.mockResolvedValue({} as never);
    mockedPrisma.user.findUnique.mockResolvedValue({ id: 'u1' } as never);

    await userService.updateUser(
      'u1',
      { height: 180, currentWeight: 75, fitnessGoals: 'Build muscle' },
      'branch-1',
      'actor-1',
    );

    expect(mockedPrisma.clientProfile.update).toHaveBeenCalledWith({
      where: { id: 'cp1' },
      data: expect.objectContaining({
        height: 180,
        currentWeight: 75,
        fitnessGoals: 'Build muscle',
      }),
    });
  });

  it('writes audit log with old and new values', async () => {
    const existing = {
      id: 'u1',
      branchId: 'branch-1',
      firstName: 'Old',
      lastName: 'Name',
      phone: '1234',
      role: 'CLIENT',
      trainerProfile: null,
      clientProfile: null,
    };
    mockedPrisma.user.findFirst.mockResolvedValue(existing as never);
    mockedPrisma.user.update.mockResolvedValue({} as never);
    mockedPrisma.user.findUnique.mockResolvedValue({ id: 'u1' } as never);

    await userService.updateUser('u1', { firstName: 'New' }, 'branch-1', 'actor-1');

    expect(mockedAuditLog).toHaveBeenCalledWith({
      action: 'USER_UPDATED',
      actorId: 'actor-1',
      subjectType: 'User',
      subjectId: 'u1',
      oldValue: { firstName: 'Old', lastName: 'Name', phone: '1234', role: 'CLIENT' },
      newValue: expect.objectContaining({ firstName: 'New' }),
      branchId: 'branch-1',
    });
  });
});

// ─── deleteUser ─────────────────────────────────────────────────────

describe('deleteUser', () => {
  it('throws NOT_FOUND if user not in branch', async () => {
    mockedPrisma.user.findFirst.mockResolvedValue(null);

    await expect(userService.deleteUser('u999', 'branch-1', 'actor-1')).rejects.toThrow(
      'User not found',
    );
  });

  it('performs soft delete (sets deletedAt and isActive=false)', async () => {
    mockedPrisma.user.findFirst.mockResolvedValue({
      id: 'u1',
      email: 'test@test.com',
      role: 'CLIENT',
    } as never);
    mockedPrisma.user.update.mockResolvedValue({} as never);

    const result = await userService.deleteUser('u1', 'branch-1', 'actor-1');

    expect(mockedPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: {
        deletedAt: expect.any(Date),
        isActive: false,
      },
    });
    expect(result).toEqual({ success: true });
  });

  it('writes USER_DELETED audit log', async () => {
    mockedPrisma.user.findFirst.mockResolvedValue({
      id: 'u1',
      email: 'deleted@test.com',
      role: 'TRAINER',
    } as never);
    mockedPrisma.user.update.mockResolvedValue({} as never);

    await userService.deleteUser('u1', 'branch-1', 'actor-1');

    expect(mockedAuditLog).toHaveBeenCalledWith({
      action: 'USER_DELETED',
      actorId: 'actor-1',
      subjectType: 'User',
      subjectId: 'u1',
      oldValue: { email: 'deleted@test.com', role: 'TRAINER' },
      branchId: 'branch-1',
    });
  });
});
