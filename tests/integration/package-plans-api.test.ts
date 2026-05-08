import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetServerSession = vi.fn();
vi.mock('@/lib/auth', () => ({
  getServerSession: () => mockGetServerSession(),
  hasRole: (role: string, allowed: string[]) => allowed.includes(role),
}));

const mockCreatePlan = vi.fn();
const mockGetPlans = vi.fn();
const mockGetPlanById = vi.fn();
const mockUpdatePlan = vi.fn();
const mockDeactivatePlan = vi.fn();
vi.mock('@/services/pt-package-plan.service', () => ({
  createPlan: (...args: unknown[]) => mockCreatePlan(...args),
  getPlans: (...args: unknown[]) => mockGetPlans(...args),
  getPlanById: (...args: unknown[]) => mockGetPlanById(...args),
  updatePlan: (...args: unknown[]) => mockUpdatePlan(...args),
  deactivatePlan: (...args: unknown[]) => mockDeactivatePlan(...args),
}));

import { GET as listPlans, POST as createPlanRoute } from '@/app/api/admin/package-plans/route';
import {
  GET as getPlanRoute,
  PUT as updatePlanRoute,
  DELETE as deletePlanRoute,
} from '@/app/api/admin/package-plans/[id]/route';
import { createMockSession } from '../helpers';
import { AppError } from '@/lib/errors';

beforeEach(() => vi.clearAllMocks());

function adminSession() {
  return createMockSession({ role: 'BRANCH_ADMIN', branchId: 'branch-1' });
}
function clientSession() {
  return createMockSession({ role: 'CLIENT', branchId: 'branch-1' });
}
function req(url: string, init: RequestInit = {}): Request {
  return new Request(new URL(url, 'http://localhost:3000'), {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

// ─── GET /api/admin/package-plans ────────────────────────────────────

describe('GET /api/admin/package-plans', () => {
  it('returns 403 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await listPlans(req('/api/admin/package-plans'));
    expect(res.status).toBe(403);
  });

  it('returns 403 for non-admin roles', async () => {
    mockGetServerSession.mockResolvedValue(clientSession());
    const res = await listPlans(req('/api/admin/package-plans'));
    expect(res.status).toBe(403);
  });

  it('returns paginated plans for admin', async () => {
    mockGetServerSession.mockResolvedValue(adminSession());
    mockGetPlans.mockResolvedValue({
      data: [{ id: 'p1', name: 'Standard 12' }],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    });

    const res = await listPlans(req('/api/admin/package-plans'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(mockGetPlans).toHaveBeenCalledWith(expect.objectContaining({ branchId: 'branch-1' }));
  });

  it('passes activeOnly=true through', async () => {
    mockGetServerSession.mockResolvedValue(adminSession());
    mockGetPlans.mockResolvedValue({
      data: [],
      pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
    });

    await listPlans(req('/api/admin/package-plans?activeOnly=true'));

    expect(mockGetPlans).toHaveBeenCalledWith(expect.objectContaining({ activeOnly: true }));
  });
});

// ─── POST /api/admin/package-plans ───────────────────────────────────

describe('POST /api/admin/package-plans', () => {
  const validBody = {
    name: 'Standard 12',
    sessionsPerMonth: 12,
    pricePerCycle: 4000,
    durationDays: 30,
  };

  it('returns 403 for non-admin', async () => {
    mockGetServerSession.mockResolvedValue(clientSession());
    const res = await createPlanRoute(
      req('/api/admin/package-plans', { method: 'POST', body: JSON.stringify(validBody) }),
    );
    expect(res.status).toBe(403);
  });

  it('returns 400 for invalid body', async () => {
    mockGetServerSession.mockResolvedValue(adminSession());
    const res = await createPlanRoute(
      req('/api/admin/package-plans', { method: 'POST', body: JSON.stringify({}) }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 201 on success and forwards branchId + actorId', async () => {
    mockGetServerSession.mockResolvedValue(adminSession());
    mockCreatePlan.mockResolvedValue({ id: 'plan-new', ...validBody });

    const res = await createPlanRoute(
      req('/api/admin/package-plans', { method: 'POST', body: JSON.stringify(validBody) }),
    );
    expect(res.status).toBe(201);
    expect(mockCreatePlan).toHaveBeenCalledWith(
      expect.objectContaining({
        branchId: 'branch-1',
        actorId: 'test-user-id',
        name: 'Standard 12',
        durationDays: 30,
      }),
    );
  });

  it('returns 409 on duplicate name', async () => {
    mockGetServerSession.mockResolvedValue(adminSession());
    mockCreatePlan.mockRejectedValue(new AppError('DUPLICATE_PLAN_NAME', 'name in use', 409));

    const res = await createPlanRoute(
      req('/api/admin/package-plans', { method: 'POST', body: JSON.stringify(validBody) }),
    );
    expect(res.status).toBe(409);
  });

  it('rejects durationDays out of range', async () => {
    mockGetServerSession.mockResolvedValue(adminSession());
    const res = await createPlanRoute(
      req('/api/admin/package-plans', {
        method: 'POST',
        body: JSON.stringify({ ...validBody, durationDays: 400 }),
      }),
    );
    expect(res.status).toBe(400);
    expect(mockCreatePlan).not.toHaveBeenCalled();
  });
});

// ─── GET /api/admin/package-plans/[id] ───────────────────────────────

describe('GET /api/admin/package-plans/[id]', () => {
  it('returns the plan when found', async () => {
    mockGetServerSession.mockResolvedValue(adminSession());
    mockGetPlanById.mockResolvedValue({
      id: 'plan-1',
      name: 'Standard 12',
      _count: { packages: 3 },
    });

    const res = await getPlanRoute(req('/api/admin/package-plans/plan-1'), {
      params: Promise.resolve({ id: 'plan-1' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe('plan-1');
  });

  it('returns 404 when not found', async () => {
    mockGetServerSession.mockResolvedValue(adminSession());
    mockGetPlanById.mockRejectedValue(new AppError('PLAN_NOT_FOUND', 'not found', 404));

    const res = await getPlanRoute(req('/api/admin/package-plans/plan-x'), {
      params: Promise.resolve({ id: 'plan-x' }),
    });
    expect(res.status).toBe(404);
  });
});

// ─── PUT /api/admin/package-plans/[id] ───────────────────────────────

describe('PUT /api/admin/package-plans/[id]', () => {
  it('updates and returns the plan', async () => {
    mockGetServerSession.mockResolvedValue(adminSession());
    mockUpdatePlan.mockResolvedValue({
      id: 'plan-1',
      name: 'Standard 12',
      pricePerCycle: 4500,
    });

    const res = await updatePlanRoute(
      req('/api/admin/package-plans/plan-1', {
        method: 'PUT',
        body: JSON.stringify({ pricePerCycle: 4500 }),
      }),
      { params: Promise.resolve({ id: 'plan-1' }) },
    );
    expect(res.status).toBe(200);
  });
});

// ─── DELETE /api/admin/package-plans/[id] ────────────────────────────

describe('DELETE /api/admin/package-plans/[id]', () => {
  it('deactivates without force when no active assignments', async () => {
    mockGetServerSession.mockResolvedValue(adminSession());
    mockDeactivatePlan.mockResolvedValue({ success: true });

    const res = await deletePlanRoute(
      req('/api/admin/package-plans/plan-1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'plan-1' }) },
    );
    expect(res.status).toBe(200);
    expect(mockDeactivatePlan).toHaveBeenCalledWith('plan-1', 'branch-1', 'test-user-id', false);
  });

  it('returns 409 when active assignments exist and force is not set', async () => {
    mockGetServerSession.mockResolvedValue(adminSession());
    mockDeactivatePlan.mockRejectedValue(
      new AppError('PLAN_HAS_ACTIVE_ASSIGNMENTS', 'in use', 409),
    );

    const res = await deletePlanRoute(
      req('/api/admin/package-plans/plan-1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'plan-1' }) },
    );
    expect(res.status).toBe(409);
  });

  it('passes force=true when ?force=true is in the URL', async () => {
    mockGetServerSession.mockResolvedValue(adminSession());
    mockDeactivatePlan.mockResolvedValue({ success: true });

    const res = await deletePlanRoute(
      req('/api/admin/package-plans/plan-1?force=true', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'plan-1' }) },
    );
    expect(res.status).toBe(200);
    expect(mockDeactivatePlan).toHaveBeenCalledWith('plan-1', 'branch-1', 'test-user-id', true);
  });
});
