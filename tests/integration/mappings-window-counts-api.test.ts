import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetServerSession = vi.fn();
vi.mock('@/lib/auth', () => ({
  getServerSession: () => mockGetServerSession(),
  hasRole: (role: string, allowed: string[]) => allowed.includes(role),
}));

const mockGetPackageWindowCounts = vi.fn();
vi.mock('@/services/pt-package.service', () => ({
  getPackageWindowCounts: (...args: unknown[]) => mockGetPackageWindowCounts(...args),
}));

import { GET as getWindowCounts } from '@/app/api/admin/mappings/[id]/window-counts/route';
import { createMockSession } from '../helpers';
import { AppError } from '@/lib/errors';

beforeEach(() => vi.clearAllMocks());

function adminSession() {
  return createMockSession({ role: 'BRANCH_ADMIN', branchId: 'branch-1' });
}
function req(url: string): Request {
  return new Request(new URL(url, 'http://localhost:3000'));
}

describe('GET /api/admin/mappings/[id]/window-counts', () => {
  it('returns 403 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await getWindowCounts(req('/api/admin/mappings/pkg-1/window-counts'), {
      params: Promise.resolve({ id: 'pkg-1' }),
    });
    expect(res.status).toBe(403);
  });

  it('returns 403 for non-admin roles', async () => {
    mockGetServerSession.mockResolvedValue(
      createMockSession({ role: 'TRAINER', branchId: 'branch-1' }),
    );
    const res = await getWindowCounts(req('/api/admin/mappings/pkg-1/window-counts'), {
      params: Promise.resolve({ id: 'pkg-1' }),
    });
    expect(res.status).toBe(403);
  });

  it('returns the window counts payload', async () => {
    mockGetServerSession.mockResolvedValue(adminSession());
    mockGetPackageWindowCounts.mockResolvedValue({
      packageId: 'pkg-1',
      plan: { id: 'plan-1', name: 'Standard 3', durationDays: 90 },
      sessionsPerMonth: 12,
      totalSessions: 36,
      onboardingUsedSessions: 0,
      onboardingNotes: null,
      completed: 3,
      noShow: 1,
      cancelled: 0,
      scheduled: 2,
      inProgress: 0,
      used: 4,
      upcoming: 2,
      remaining: 30,
      window: {
        start: '2026-04-23T00:00:00.000Z',
        end: '2026-07-22T23:59:59.999Z',
        totalDays: 91,
        daysElapsed: 15,
        daysRemaining: 76,
      },
    });

    const res = await getWindowCounts(req('/api/admin/mappings/pkg-1/window-counts'), {
      params: Promise.resolve({ id: 'pkg-1' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.totalSessions).toBe(36);
    expect(body.data.remaining).toBe(30);
    expect(body.data.window.daysRemaining).toBe(76);
    expect(mockGetPackageWindowCounts).toHaveBeenCalledWith('pkg-1', 'branch-1');
  });

  it('returns 404 when package not found', async () => {
    mockGetServerSession.mockResolvedValue(adminSession());
    mockGetPackageWindowCounts.mockRejectedValue(
      new AppError('PT_PACKAGE_NOT_FOUND', 'PT package not found', 404),
    );

    const res = await getWindowCounts(req('/api/admin/mappings/pkg-x/window-counts'), {
      params: Promise.resolve({ id: 'pkg-x' }),
    });
    expect(res.status).toBe(404);
  });

  it('scopes the lookup to the caller branchId', async () => {
    mockGetServerSession.mockResolvedValue(
      createMockSession({ role: 'BRANCH_ADMIN', branchId: 'branch-99' }),
    );
    mockGetPackageWindowCounts.mockResolvedValue({
      packageId: 'pkg-1',
      plan: null,
      sessionsPerMonth: 8,
      totalSessions: 8,
      onboardingUsedSessions: 0,
      onboardingNotes: null,
      completed: 0,
      noShow: 0,
      cancelled: 0,
      scheduled: 0,
      inProgress: 0,
      used: 0,
      upcoming: 0,
      remaining: 8,
      window: {
        start: '2026-05-01T00:00:00.000Z',
        end: '2026-05-31T23:59:59.999Z',
        totalDays: 31,
        daysElapsed: 0,
        daysRemaining: 23,
      },
    });

    await getWindowCounts(req('/api/admin/mappings/pkg-1/window-counts'), {
      params: Promise.resolve({ id: 'pkg-1' }),
    });

    expect(mockGetPackageWindowCounts).toHaveBeenCalledWith('pkg-1', 'branch-99');
  });
});
