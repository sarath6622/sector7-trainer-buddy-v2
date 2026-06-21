import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetServerSession = vi.fn();
vi.mock('@/lib/auth', () => ({
  getServerSession: () => mockGetServerSession(),
  hasRole: (role: string, allowed: string[]) => allowed.includes(role),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: { ptPackage: { findFirst: vi.fn() } },
}));

const mockGetPackageWindowCounts = vi.fn();
vi.mock('@/services/pt-package.service', () => ({
  getPackageWindowCounts: (...args: unknown[]) => mockGetPackageWindowCounts(...args),
}));

import { GET as getWindowCounts } from '@/app/api/trainer/packages/[id]/window-counts/route';
import { prisma } from '@/lib/prisma';

const BRANCH = 'branch-1';
const TRAINER = 'tp-1';

beforeEach(() => vi.clearAllMocks());

function trainerSession(trainerProfileId: string | null = TRAINER) {
  return {
    user: {
      id: 'trainer-user-1',
      email: 'trainer@sector7.com',
      role: 'TRAINER',
      branchId: BRANCH,
      trainerProfileId,
      firstName: 'Kishore',
      lastName: 'Vinu',
    },
    expires: new Date(Date.now() + 86_400_000).toISOString(),
  };
}

function req(url: string): Request {
  return new Request(new URL(url, 'http://localhost:3000'));
}

describe('GET /api/trainer/packages/[id]/window-counts', () => {
  it('returns 403 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await getWindowCounts(req('/api/trainer/packages/pkg-1/window-counts'), {
      params: Promise.resolve({ id: 'pkg-1' }),
    });
    expect(res.status).toBe(403);
  });

  it('returns 403 for non-trainer roles', async () => {
    mockGetServerSession.mockResolvedValue({
      ...trainerSession(),
      user: { ...trainerSession().user, role: 'BRANCH_ADMIN' },
    });
    const res = await getWindowCounts(req('/api/trainer/packages/pkg-1/window-counts'), {
      params: Promise.resolve({ id: 'pkg-1' }),
    });
    expect(res.status).toBe(403);
  });

  it('returns 404 when the package does not belong to the trainer', async () => {
    mockGetServerSession.mockResolvedValue(trainerSession());
    vi.mocked(prisma.ptPackage.findFirst).mockResolvedValue(null);
    const res = await getWindowCounts(req('/api/trainer/packages/pkg-1/window-counts'), {
      params: Promise.resolve({ id: 'pkg-1' }),
    });
    expect(res.status).toBe(404);
    expect(mockGetPackageWindowCounts).not.toHaveBeenCalled();
  });

  it('returns the window counts for an owned package', async () => {
    mockGetServerSession.mockResolvedValue(trainerSession());
    vi.mocked(prisma.ptPackage.findFirst).mockResolvedValue({ id: 'pkg-1' } as never);
    mockGetPackageWindowCounts.mockResolvedValue({
      packageId: 'pkg-1',
      plan: { id: 'plan-1', name: 'Standard 3', durationDays: 90 },
      sessionsPerMonth: 12,
      totalSessions: 36,
      used: 4,
      upcoming: 2,
      remaining: 30,
      window: { start: '', end: '', totalDays: 91, daysElapsed: 15, daysRemaining: 76 },
    });

    const res = await getWindowCounts(req('/api/trainer/packages/pkg-1/window-counts'), {
      params: Promise.resolve({ id: 'pkg-1' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.totalSessions).toBe(36);
    expect(body.data.remaining).toBe(30);
    // ownership is checked against this trainer + branch before reading counts
    expect(prisma.ptPackage.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'pkg-1', branchId: BRANCH, trainerProfileId: TRAINER },
      }),
    );
    expect(mockGetPackageWindowCounts).toHaveBeenCalledWith('pkg-1', BRANCH);
  });
});
