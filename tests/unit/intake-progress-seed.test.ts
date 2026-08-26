import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock Dependencies ─────────────────────────────────────────────
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    clientProfile: { create: vi.fn() },
    trainerProfile: { create: vi.fn() },
    trainerShift: { createMany: vi.fn() },
  },
}));

vi.mock('@/lib/audit', () => ({ auditLog: vi.fn() }));

vi.mock('bcryptjs', () => ({ hash: vi.fn().mockResolvedValue('$2b$12$hashedpassword') }));

vi.mock('@/services/progress.service', () => ({ createProgressEntry: vi.fn() }));

import { prisma } from '@/lib/prisma';
import { createProgressEntry } from '@/services/progress.service';
import * as userService from '@/services/user.service';

const mockedPrisma = vi.mocked(prisma);
const mockedCreateProgressEntry = vi.mocked(createProgressEntry);

const baseInput = {
  email: 'newclient@sector7.com',
  password: 'SecurePass1!',
  firstName: 'New',
  lastName: 'Client',
  roles: ['CLIENT' as const],
  branchId: 'branch-1',
  actorId: 'admin-1',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedPrisma.user.findFirst.mockResolvedValue(null as never);
  mockedPrisma.user.create.mockResolvedValue({
    id: 'u1',
    email: baseInput.email,
    roles: ['CLIENT'],
  } as never);
  mockedPrisma.user.findUnique.mockResolvedValue({ id: 'u1', clientProfile: {} } as never);
  mockedPrisma.clientProfile.create.mockResolvedValue({ id: 'cp1' } as never);
  mockedPrisma.trainerProfile.create.mockResolvedValue({ id: 'tp1' } as never);
  mockedCreateProgressEntry.mockResolvedValue({ entry: { id: 'pe1' }, newBadges: [] } as never);
});

describe('createUser — intake measurements seed the progress timeline', () => {
  it('creates a baseline progress entry from the intake weight', async () => {
    await userService.createUser({ ...baseInput, intakeWeight: 82.5 });

    expect(mockedCreateProgressEntry).toHaveBeenCalledWith({
      clientProfileId: 'cp1',
      recordedByUserId: 'admin-1',
      branchId: 'branch-1',
      weightKg: 82.5,
      bodyFatPercent: undefined,
      notes: 'Recorded at signup',
    });
  });

  it('carries the intake body fat onto the same entry', async () => {
    await userService.createUser({ ...baseInput, intakeWeight: 82.5, intakeBodyFat: 24.1 });

    expect(mockedCreateProgressEntry).toHaveBeenCalledWith(
      expect.objectContaining({ weightKg: 82.5, bodyFatPercent: 24.1 }),
    );
  });

  it('seeds an entry when only body fat was recorded at intake', async () => {
    await userService.createUser({ ...baseInput, intakeBodyFat: 24.1 });

    expect(mockedCreateProgressEntry).toHaveBeenCalledWith(
      expect.objectContaining({ weightKg: undefined, bodyFatPercent: 24.1 }),
    );
  });

  it('still stores the intake values on the client profile', async () => {
    await userService.createUser({ ...baseInput, intakeWeight: 82.5, intakeBodyFat: 24.1 });

    expect(mockedPrisma.clientProfile.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ intakeWeight: 82.5, intakeBodyFat: 24.1 }),
    });
  });

  it('creates no entry when neither measurement was taken at intake', async () => {
    await userService.createUser(baseInput);

    expect(mockedPrisma.clientProfile.create).toHaveBeenCalled();
    expect(mockedCreateProgressEntry).not.toHaveBeenCalled();
  });

  it('creates no entry for a trainer', async () => {
    await userService.createUser({
      ...baseInput,
      email: 'trainer@sector7.com',
      roles: ['TRAINER' as const],
    } as never);

    expect(mockedCreateProgressEntry).not.toHaveBeenCalled();
  });

  it('never blocks client creation when seeding the entry fails', async () => {
    mockedCreateProgressEntry.mockRejectedValue(new Error('progress write failed'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await userService.createUser({ ...baseInput, intakeWeight: 82.5 });

    expect(result).toBeDefined();
    expect(mockedPrisma.clientProfile.create).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
