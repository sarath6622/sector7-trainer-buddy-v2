import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock auth ──────────────────────────────────────────────────────
const mockGetServerSession = vi.fn();
vi.mock('@/lib/auth', () => ({
  getServerSession: () => mockGetServerSession(),
  hasRole: (userRole: string | string[], allowedRoles: string[]) =>
    [userRole].flat().some((r) => allowedRoles.includes(r)),
}));

// ─── Mock user service ──────────────────────────────────────────────
const mockUpdateClientMembership = vi.fn();
vi.mock('@/services/user.service', () => ({
  updateClientMembership: (...args: unknown[]) => mockUpdateClientMembership(...args),
}));

import { PATCH } from '@/app/api/admin/users/[id]/membership/route';
import { createMockSession } from '../helpers';
import { AppError } from '@/lib/errors';

beforeEach(() => {
  vi.clearAllMocks();
});

function patch(body: unknown) {
  return PATCH(
    new Request('http://localhost:3000/api/admin/users/u1/membership', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: 'u1' }) },
  );
}

describe('PATCH /api/admin/users/[id]/membership (ADR-055)', () => {
  it('returns 403 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null);
    expect((await patch({ isActive: false })).status).toBe(403);
  });

  it('returns 403 for a trainer', async () => {
    mockGetServerSession.mockResolvedValue(createMockSession({ role: 'TRAINER' }));
    expect((await patch({ isActive: false })).status).toBe(403);
    expect(mockUpdateClientMembership).not.toHaveBeenCalled();
  });

  it('returns 400 when isActive is missing or not a boolean', async () => {
    mockGetServerSession.mockResolvedValue(createMockSession({ role: 'BRANCH_ADMIN' }));
    expect((await patch({})).status).toBe(400);
    expect((await patch({ isActive: 'no' })).status).toBe(400);
  });

  it("marks the client as left, scoped to the admin's branch", async () => {
    mockGetServerSession.mockResolvedValue(
      createMockSession({ role: 'BRANCH_ADMIN', branchId: 'branch-1', id: 'admin-1' }),
    );
    mockUpdateClientMembership.mockResolvedValue({ id: 'u1', isActive: false });

    const res = await patch({ isActive: false });

    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ id: 'u1', isActive: false });
    expect(mockUpdateClientMembership).toHaveBeenCalledWith(
      'u1',
      false,
      'branch-1',
      expect.any(String),
    );
  });

  it('passes service errors through (409 STAFF_ACCOUNT)', async () => {
    mockGetServerSession.mockResolvedValue(createMockSession({ role: 'BRANCH_ADMIN' }));
    mockUpdateClientMembership.mockRejectedValue(
      new AppError('STAFF_ACCOUNT', 'This person is also staff.', 409),
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await patch({ isActive: false });

    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('STAFF_ACCOUNT');
  });
});
