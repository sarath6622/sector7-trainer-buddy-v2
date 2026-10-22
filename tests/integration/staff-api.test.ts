import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetServerSession = vi.fn();
vi.mock('@/lib/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth');
  return { getServerSession: () => mockGetServerSession(), hasRole: actual.hasRole };
});

const mockListStaff = vi.fn();
const mockUpdateStaffAccess = vi.fn();
vi.mock('@/services/staff.service', () => ({
  listStaff: (...args: unknown[]) => mockListStaff(...args),
  updateStaffAccess: (...args: unknown[]) => mockUpdateStaffAccess(...args),
}));

vi.mock('@/lib/prisma', () => ({ prisma: {} }));

import { GET as listStaffRoute } from '@/app/api/admin/staff/route';
import { PATCH as patchStaffRoute } from '@/app/api/admin/staff/[id]/route';
import { createMockSession } from '../helpers';
import { AppError } from '@/lib/errors';

beforeEach(() => vi.clearAllMocks());

function patch(id: string, body: unknown) {
  return patchStaffRoute(
    new Request(`http://localhost:3000/api/admin/staff/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
}

describe('GET /api/admin/staff', () => {
  it('rejects trainers', async () => {
    mockGetServerSession.mockResolvedValue(createMockSession({ role: 'TRAINER' }));

    const res = await listStaffRoute();

    expect(res.status).toBe(403);
    expect(mockListStaff).not.toHaveBeenCalled();
  });

  it('admits a head coach via any of their roles, scoped to their branch', async () => {
    // Regression for ADR-054: the old check read only the primary role.
    mockGetServerSession.mockResolvedValue(
      createMockSession({ role: 'TRAINER', roles: ['TRAINER', 'BRANCH_ADMIN'], branchId: 'b-7' }),
    );
    mockListStaff.mockResolvedValue({ data: [], activeAdminCount: 1 });

    const res = await listStaffRoute();

    expect(res.status).toBe(200);
    expect(mockListStaff).toHaveBeenCalledWith('b-7');
  });

  it('rejects a session whose roles were revoked', async () => {
    mockGetServerSession.mockResolvedValue(createMockSession({ role: 'BRANCH_ADMIN', roles: [] }));

    expect((await listStaffRoute()).status).toBe(403);
  });
});

describe('PATCH /api/admin/staff/[id]', () => {
  beforeEach(() => {
    mockGetServerSession.mockResolvedValue(
      createMockSession({ userId: 'admin-1', role: 'BRANCH_ADMIN', branchId: 'b-1' }),
    );
  });

  it('forwards the change with branch and actor', async () => {
    mockUpdateStaffAccess.mockResolvedValue({ id: 'u-2', accessLevel: 'HEAD_COACH' });

    const res = await patch('u-2', { accessLevel: 'HEAD_COACH' });

    expect(res.status).toBe(200);
    expect(mockUpdateStaffAccess).toHaveBeenCalledWith({
      id: 'u-2',
      branchId: 'b-1',
      actorId: 'admin-1',
      accessLevel: 'HEAD_COACH',
    });
  });

  it('rejects an empty body and unknown levels', async () => {
    expect((await patch('u-2', {})).status).toBe(400);
    expect((await patch('u-2', { accessLevel: 'SUPER_ADMIN' })).status).toBe(400);
    expect(mockUpdateStaffAccess).not.toHaveBeenCalled();
  });

  it('surfaces guard errors as 409 with their code', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockUpdateStaffAccess.mockRejectedValue(
      new AppError('LAST_ADMIN', 'This is the only active admin.', 409),
    );

    const res = await patch('u-2', { isActive: false });

    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('LAST_ADMIN');
  });

  it('rejects trainers', async () => {
    mockGetServerSession.mockResolvedValue(createMockSession({ role: 'TRAINER' }));

    expect((await patch('u-2', { isActive: false })).status).toBe(403);
  });
});
