import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hasRole } from '@/lib/auth';

// ─── Mock Prisma ────────────────────────────────────────────────────
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// ─── Mock bcryptjs ──────────────────────────────────────────────────
vi.mock('bcryptjs', () => ({
  compare: vi.fn(),
}));

import { prisma } from '@/lib/prisma';
import { compare } from 'bcryptjs';

// We test the authorize logic by importing authOptions and calling the provider
import { authOptions } from '@/lib/auth';

const mockedPrisma = vi.mocked(prisma);
const mockedCompare = vi.mocked(compare);

function getAuthorize() {
  const provider = authOptions.providers[0];
  // CredentialsProvider stores authorize on the options
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (provider as any).options.authorize as (
    credentials: Record<string, string> | undefined,
  ) => Promise<unknown>;
}

describe('hasRole', () => {
  it('returns true when user role is in allowed list', () => {
    expect(hasRole('BRANCH_ADMIN', ['SUPER_ADMIN', 'BRANCH_ADMIN'])).toBe(true);
  });

  it('returns false when user role is not in allowed list', () => {
    expect(hasRole('CLIENT', ['SUPER_ADMIN', 'BRANCH_ADMIN'])).toBe(false);
  });

  it('returns false for empty allowed list', () => {
    expect(hasRole('BRANCH_ADMIN', [])).toBe(false);
  });
});

describe('authorize (credentials provider)', () => {
  const authorize = getAuthorize();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when credentials are missing', async () => {
    const result = await authorize(undefined);
    expect(result).toBeNull();
  });

  it('returns null when email is empty', async () => {
    const result = await authorize({ email: '', password: 'pass123' });
    expect(result).toBeNull();
  });

  it('returns null when password is empty', async () => {
    const result = await authorize({ email: 'test@test.com', password: '' });
    expect(result).toBeNull();
  });

  it('returns null when user not found', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue(null);
    const result = await authorize({ email: 'test@test.com', password: 'pass123' });
    expect(result).toBeNull();
  });

  it('returns null when user is inactive', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'test@test.com',
      passwordHash: 'hashed',
      isActive: false,
      deletedAt: null,
      firstName: 'Test',
      lastName: 'User',
      role: 'CLIENT',
      branchId: 'b1',
      phone: null,
      profileImageUrl: null,
      lastLoginAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      trainerProfile: null,
      clientProfile: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const result = await authorize({ email: 'test@test.com', password: 'pass123' });
    expect(result).toBeNull();
  });

  it('returns null when user is soft-deleted', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'test@test.com',
      passwordHash: 'hashed',
      isActive: true,
      deletedAt: new Date(),
      firstName: 'Test',
      lastName: 'User',
      role: 'CLIENT',
      branchId: 'b1',
      phone: null,
      profileImageUrl: null,
      lastLoginAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      trainerProfile: null,
      clientProfile: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const result = await authorize({ email: 'test@test.com', password: 'pass123' });
    expect(result).toBeNull();
  });

  it('returns null when password is incorrect', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'test@test.com',
      passwordHash: 'hashed',
      isActive: true,
      deletedAt: null,
      firstName: 'Test',
      lastName: 'User',
      role: 'CLIENT',
      branchId: 'b1',
      phone: null,
      profileImageUrl: null,
      lastLoginAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      trainerProfile: null,
      clientProfile: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedCompare.mockResolvedValue(false as any);
    const result = await authorize({ email: 'test@test.com', password: 'wrong' });
    expect(result).toBeNull();
  });

  it('returns user object on successful authentication', async () => {
    const mockUser = {
      id: 'u1',
      email: 'trainer@sector7.com',
      passwordHash: 'hashed',
      isActive: true,
      deletedAt: null,
      firstName: 'John',
      lastName: 'Trainer',
      role: 'TRAINER',
      branchId: 'b1',
      phone: null,
      profileImageUrl: null,
      lastLoginAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      trainerProfile: { id: 'tp1' },
      clientProfile: null,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedPrisma.user.findUnique.mockResolvedValue(mockUser as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedCompare.mockResolvedValue(true as any);
    mockedPrisma.user.update.mockResolvedValue({} as never);

    const result = await authorize({ email: 'trainer@sector7.com', password: 'correct' });

    expect(result).toEqual({
      id: 'u1',
      email: 'trainer@sector7.com',
      name: 'John Trainer',
      role: 'TRAINER',
      branchId: 'b1',
      firstName: 'John',
      lastName: 'Trainer',
      trainerProfileId: 'tp1',
      clientProfileId: null,
    });
  });

  it('updates lastLoginAt on successful auth', async () => {
    const mockUser = {
      id: 'u1',
      email: 'test@test.com',
      passwordHash: 'hashed',
      isActive: true,
      deletedAt: null,
      firstName: 'Test',
      lastName: 'User',
      role: 'CLIENT',
      branchId: 'b1',
      phone: null,
      profileImageUrl: null,
      lastLoginAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      trainerProfile: null,
      clientProfile: { id: 'cp1' },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedPrisma.user.findUnique.mockResolvedValue(mockUser as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedCompare.mockResolvedValue(true as any);
    mockedPrisma.user.update.mockResolvedValue({} as never);

    await authorize({ email: 'test@test.com', password: 'correct' });

    expect(mockedPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { lastLoginAt: expect.any(Date) },
    });
  });
});

describe('JWT and session callbacks', () => {
  it('jwt callback adds user fields to token', async () => {
    const jwt = authOptions.callbacks!.jwt!;
    const user = {
      id: 'u1',
      role: 'TRAINER',
      branchId: 'b1',
      firstName: 'John',
      lastName: 'Doe',
      trainerProfileId: 'tp1',
      clientProfileId: null,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const token = await jwt({ token: {} as any, user: user as any } as any);

    expect(token.id).toBe('u1');
    expect(token.role).toBe('TRAINER');
    expect(token.branchId).toBe('b1');
    expect(token.firstName).toBe('John');
    expect(token.lastName).toBe('Doe');
    expect(token.trainerProfileId).toBe('tp1');
    expect(token.clientProfileId).toBeNull();
  });

  it('jwt callback preserves token when no user (subsequent calls)', async () => {
    const jwt = authOptions.callbacks!.jwt!;
    const existingToken = { id: 'u1', role: 'CLIENT', sub: 'u1' };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const token = await jwt({ token: existingToken as any, user: undefined as any } as any);

    expect(token.id).toBe('u1');
    expect(token.role).toBe('CLIENT');
  });

  it('session callback adds token fields to session.user', async () => {
    const sessionCb = authOptions.callbacks!.session!;
    const session = {
      user: { email: 'test@test.com', name: 'Test' },
      expires: new Date().toISOString(),
    };
    const token = {
      id: 'u1',
      role: 'BRANCH_ADMIN',
      branchId: 'b1',
      firstName: 'Admin',
      lastName: 'User',
      trainerProfileId: null,
      clientProfileId: null,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await sessionCb({ session: session as any, token: token as any } as any);

    expect(result.user.id).toBe('u1');
    expect(result.user.role).toBe('BRANCH_ADMIN');
    expect(result.user.branchId).toBe('b1');
    expect(result.user.firstName).toBe('Admin');
    expect(result.user.lastName).toBe('User');
  });
});
