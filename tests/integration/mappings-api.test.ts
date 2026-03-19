import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock auth ──────────────────────────────────────────────────────
const mockGetServerSession = vi.fn();
vi.mock('@/lib/auth', () => ({
  getServerSession: () => mockGetServerSession(),
  hasRole: (userRole: string, allowedRoles: string[]) => allowedRoles.includes(userRole),
}));

// ─── Mock PT package service ────────────────────────────────────────
const mockCreatePtPackage = vi.fn();
const mockGetPtPackages = vi.fn();
const mockGetPtPackageById = vi.fn();
const mockUpdatePtPackage = vi.fn();
const mockDeletePtPackage = vi.fn();
vi.mock('@/services/pt-package.service', () => ({
  createPtPackage: (...args: unknown[]) => mockCreatePtPackage(...args),
  getPtPackages: (...args: unknown[]) => mockGetPtPackages(...args),
  getPtPackageById: (...args: unknown[]) => mockGetPtPackageById(...args),
  updatePtPackage: (...args: unknown[]) => mockUpdatePtPackage(...args),
  deletePtPackage: (...args: unknown[]) => mockDeletePtPackage(...args),
}));

import { GET as listMappings, POST as createMapping } from '@/app/api/admin/mappings/route';
import {
  GET as getMapping,
  PUT as updateMapping,
  DELETE as deleteMapping,
} from '@/app/api/admin/mappings/[id]/route';
import { createMockSession } from '../helpers';
import { AppError } from '@/lib/errors';

beforeEach(() => {
  vi.clearAllMocks();
});

function mockAdminSession(overrides = {}) {
  return createMockSession({ role: 'BRANCH_ADMIN', branchId: 'branch-1', ...overrides });
}

function createRequest(url: string, options: RequestInit = {}): Request {
  return new Request(new URL(url, 'http://localhost:3000'), {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
}

// ─── GET /api/admin/mappings ────────────────────────────────────────

describe('GET /api/admin/mappings', () => {
  it('should return 403 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await listMappings(createRequest('/api/admin/mappings'));
    expect(res.status).toBe(403);
  });

  it('should return 403 for non-admin roles', async () => {
    mockGetServerSession.mockResolvedValue(mockAdminSession({ role: 'CLIENT' }));
    const res = await listMappings(createRequest('/api/admin/mappings'));
    expect(res.status).toBe(403);
  });

  it('should return packages for admin', async () => {
    mockGetServerSession.mockResolvedValue(mockAdminSession());
    mockGetPtPackages.mockResolvedValue({ data: [{ id: 'pkg-1' }] });

    const res = await listMappings(createRequest('/api/admin/mappings'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
  });

  it('should pass trainerId and clientId filters', async () => {
    mockGetServerSession.mockResolvedValue(mockAdminSession());
    mockGetPtPackages.mockResolvedValue({ data: [] });

    await listMappings(createRequest('/api/admin/mappings?trainerId=t1&clientId=c1'));

    expect(mockGetPtPackages).toHaveBeenCalledWith({
      branchId: 'branch-1',
      trainerId: 't1',
      clientId: 'c1',
    });
  });
});

// ─── POST /api/admin/mappings ───────────────────────────────────────

describe('POST /api/admin/mappings', () => {
  const validBody = {
    clientProfileId: 'cm1clientprofile001',
    trainerProfileId: 'cm1trainerprofile01',
    sessionsPerMonth: 12,
    sessionCharge: 500,
    startDate: '2026-04-01',
  };

  it('should return 403 for trainers', async () => {
    mockGetServerSession.mockResolvedValue(mockAdminSession({ role: 'TRAINER' }));
    const res = await createMapping(
      createRequest('/api/admin/mappings', { method: 'POST', body: JSON.stringify(validBody) }),
    );
    expect(res.status).toBe(403);
  });

  it('should return 400 for invalid body', async () => {
    mockGetServerSession.mockResolvedValue(mockAdminSession());
    const res = await createMapping(
      createRequest('/api/admin/mappings', { method: 'POST', body: JSON.stringify({}) }),
    );
    expect(res.status).toBe(400);
  });

  it('should return 201 on success', async () => {
    mockGetServerSession.mockResolvedValue(mockAdminSession());
    mockCreatePtPackage.mockResolvedValue({ id: 'pkg-new', ...validBody });

    const res = await createMapping(
      createRequest('/api/admin/mappings', { method: 'POST', body: JSON.stringify(validBody) }),
    );
    expect(res.status).toBe(201);
  });

  it('should return 409 for duplicate mapping', async () => {
    mockGetServerSession.mockResolvedValue(mockAdminSession());
    mockCreatePtPackage.mockRejectedValue(new AppError('duplicate', 'DUPLICATE_MAPPING', 409));

    const res = await createMapping(
      createRequest('/api/admin/mappings', { method: 'POST', body: JSON.stringify(validBody) }),
    );
    expect(res.status).toBe(409);
  });
});

// ─── GET /api/admin/mappings/[id] ───────────────────────────────────

describe('GET /api/admin/mappings/[id]', () => {
  it('should return 403 for non-admin', async () => {
    mockGetServerSession.mockResolvedValue(mockAdminSession({ role: 'CLIENT' }));
    const res = await getMapping(createRequest('/api/admin/mappings/pkg-1'), {
      params: Promise.resolve({ id: 'pkg-1' }),
    });
    expect(res.status).toBe(403);
  });

  it('should return the package', async () => {
    mockGetServerSession.mockResolvedValue(mockAdminSession());
    mockGetPtPackageById.mockResolvedValue({ id: 'pkg-1', sessionsPerMonth: 12 });

    const res = await getMapping(createRequest('/api/admin/mappings/pkg-1'), {
      params: Promise.resolve({ id: 'pkg-1' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe('pkg-1');
  });

  it('should return 404 when not found', async () => {
    mockGetServerSession.mockResolvedValue(mockAdminSession());
    mockGetPtPackageById.mockRejectedValue(new AppError('not found', 'PT_PACKAGE_NOT_FOUND', 404));

    const res = await getMapping(createRequest('/api/admin/mappings/pkg-x'), {
      params: Promise.resolve({ id: 'pkg-x' }),
    });
    expect(res.status).toBe(404);
  });
});

// ─── PUT /api/admin/mappings/[id] ───────────────────────────────────

describe('PUT /api/admin/mappings/[id]', () => {
  it('should return 403 for non-admin', async () => {
    mockGetServerSession.mockResolvedValue(mockAdminSession({ role: 'TRAINER' }));
    const res = await updateMapping(
      createRequest('/api/admin/mappings/pkg-1', {
        method: 'PUT',
        body: JSON.stringify({ sessionsPerMonth: 8 }),
      }),
      { params: Promise.resolve({ id: 'pkg-1' }) },
    );
    expect(res.status).toBe(403);
  });

  it('should update and return the package', async () => {
    mockGetServerSession.mockResolvedValue(mockAdminSession());
    mockUpdatePtPackage.mockResolvedValue({ id: 'pkg-1', sessionsPerMonth: 8 });

    const res = await updateMapping(
      createRequest('/api/admin/mappings/pkg-1', {
        method: 'PUT',
        body: JSON.stringify({ sessionsPerMonth: 8 }),
      }),
      { params: Promise.resolve({ id: 'pkg-1' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.sessionsPerMonth).toBe(8);
  });
});

// ─── DELETE /api/admin/mappings/[id] ────────────────────────────────

describe('DELETE /api/admin/mappings/[id]', () => {
  it('should return 403 for non-admin', async () => {
    mockGetServerSession.mockResolvedValue(mockAdminSession({ role: 'CLIENT' }));
    const res = await deleteMapping(
      createRequest('/api/admin/mappings/pkg-1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'pkg-1' }) },
    );
    expect(res.status).toBe(403);
  });

  it('should deactivate and return success', async () => {
    mockGetServerSession.mockResolvedValue(mockAdminSession());
    mockDeletePtPackage.mockResolvedValue({ success: true });

    const res = await deleteMapping(
      createRequest('/api/admin/mappings/pkg-1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'pkg-1' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.success).toBe(true);
  });

  it('should return 404 when not found', async () => {
    mockGetServerSession.mockResolvedValue(mockAdminSession());
    mockDeletePtPackage.mockRejectedValue(new AppError('not found', 'PT_PACKAGE_NOT_FOUND', 404));

    const res = await deleteMapping(
      createRequest('/api/admin/mappings/pkg-x', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'pkg-x' }) },
    );
    expect(res.status).toBe(404);
  });
});
