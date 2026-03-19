import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock auth ──────────────────────────────────────────────────────
const mockGetServerSession = vi.fn();
vi.mock('@/lib/auth', () => ({
  getServerSession: () => mockGetServerSession(),
  hasRole: (userRole: string, allowedRoles: string[]) => allowedRoles.includes(userRole),
}));

// ─── Mock user service ──────────────────────────────────────────────
const mockCreateUser = vi.fn();
const mockGetUsers = vi.fn();
const mockGetUserById = vi.fn();
const mockUpdateUser = vi.fn();
const mockDeleteUser = vi.fn();
vi.mock('@/services/user.service', () => ({
  createUser: (...args: unknown[]) => mockCreateUser(...args),
  getUsers: (...args: unknown[]) => mockGetUsers(...args),
  getUserById: (...args: unknown[]) => mockGetUserById(...args),
  updateUser: (...args: unknown[]) => mockUpdateUser(...args),
  deleteUser: (...args: unknown[]) => mockDeleteUser(...args),
}));

import { GET as listUsers, POST as createUserRoute } from '@/app/api/admin/users/route';
import {
  GET as getUser,
  PUT as updateUserRoute,
  DELETE as deleteUserRoute,
} from '@/app/api/admin/users/[id]/route';
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

// ─── GET /api/admin/users ───────────────────────────────────────────

describe('GET /api/admin/users', () => {
  it('returns 403 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const req = createRequest('/api/admin/users');
    const res = await listUsers(req);
    expect(res.status).toBe(403);
  });

  it('returns 403 for CLIENT role', async () => {
    mockGetServerSession.mockResolvedValue(createMockSession({ role: 'CLIENT' }));
    const req = createRequest('/api/admin/users');
    const res = await listUsers(req);
    expect(res.status).toBe(403);
  });

  it('returns 403 for TRAINER role', async () => {
    mockGetServerSession.mockResolvedValue(createMockSession({ role: 'TRAINER' }));
    const req = createRequest('/api/admin/users');
    const res = await listUsers(req);
    expect(res.status).toBe(403);
  });

  it('returns user list for BRANCH_ADMIN', async () => {
    mockGetServerSession.mockResolvedValue(mockAdminSession());
    mockGetUsers.mockResolvedValue({
      data: [{ id: 'u1', firstName: 'Test' }],
      pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
    });

    const req = createRequest('/api/admin/users');
    const res = await listUsers(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(mockGetUsers).toHaveBeenCalledWith(expect.objectContaining({ branchId: 'branch-1' }));
  });

  it('passes role filter to service', async () => {
    mockGetServerSession.mockResolvedValue(mockAdminSession());
    mockGetUsers.mockResolvedValue({
      data: [],
      pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 },
    });

    const req = createRequest('/api/admin/users?role=TRAINER');
    const res = await listUsers(req);

    expect(res.status).toBe(200);
    expect(mockGetUsers).toHaveBeenCalledWith(expect.objectContaining({ role: 'TRAINER' }));
  });

  it('allows SUPER_ADMIN access', async () => {
    mockGetServerSession.mockResolvedValue(createMockSession({ role: 'SUPER_ADMIN' }));
    mockGetUsers.mockResolvedValue({
      data: [],
      pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 },
    });

    const req = createRequest('/api/admin/users');
    const res = await listUsers(req);
    expect(res.status).toBe(200);
  });
});

// ─── POST /api/admin/users ──────────────────────────────────────────

describe('POST /api/admin/users', () => {
  const validBody = {
    email: 'new@sector7.com',
    password: 'SecurePass1!',
    firstName: 'New',
    lastName: 'User',
    role: 'CLIENT',
  };

  it('returns 403 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const req = createRequest('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify(validBody),
    });
    const res = await createUserRoute(req);
    expect(res.status).toBe(403);
  });

  it('returns 400 for invalid body', async () => {
    mockGetServerSession.mockResolvedValue(mockAdminSession());
    const req = createRequest('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify({ email: 'bad' }), // missing required fields
    });
    const res = await createUserRoute(req);
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('creates user and returns 201', async () => {
    mockGetServerSession.mockResolvedValue(mockAdminSession());
    mockCreateUser.mockResolvedValue({ id: 'u-new', email: 'new@sector7.com' });

    const req = createRequest('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify(validBody),
    });
    const res = await createUserRoute(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.data.id).toBe('u-new');
    expect(mockCreateUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'new@sector7.com',
        branchId: 'branch-1',
        actorId: 'test-user-id',
      }),
    );
  });

  it('returns error when service throws AppError', async () => {
    mockGetServerSession.mockResolvedValue(mockAdminSession());
    mockCreateUser.mockRejectedValue(
      new AppError('DUPLICATE_EMAIL', 'A user with this email already exists', 409),
    );

    const req = createRequest('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify(validBody),
    });
    const res = await createUserRoute(req);
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.code).toBe('DUPLICATE_EMAIL');
  });
});

// ─── GET /api/admin/users/[id] ─────────────────────────────────────

describe('GET /api/admin/users/[id]', () => {
  const routeParams = { params: Promise.resolve({ id: 'u1' }) };

  it('returns 403 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const req = createRequest('/api/admin/users/u1');
    const res = await getUser(req, routeParams);
    expect(res.status).toBe(403);
  });

  it('returns user data for admin', async () => {
    mockGetServerSession.mockResolvedValue(mockAdminSession());
    mockGetUserById.mockResolvedValue({ id: 'u1', firstName: 'Test', role: 'CLIENT' });

    const req = createRequest('/api/admin/users/u1');
    const res = await getUser(req, routeParams);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.id).toBe('u1');
    expect(mockGetUserById).toHaveBeenCalledWith('u1', 'branch-1');
  });

  it('returns 404 when user not found', async () => {
    mockGetServerSession.mockResolvedValue(mockAdminSession());
    mockGetUserById.mockRejectedValue(new AppError('NOT_FOUND', 'User not found', 404));

    const req = createRequest('/api/admin/users/u999');
    const res = await getUser(req, { params: Promise.resolve({ id: 'u999' }) });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.code).toBe('NOT_FOUND');
  });
});

// ─── PUT /api/admin/users/[id] ─────────────────────────────────────

describe('PUT /api/admin/users/[id]', () => {
  const routeParams = { params: Promise.resolve({ id: 'u1' }) };

  it('returns 403 for non-admin', async () => {
    mockGetServerSession.mockResolvedValue(createMockSession({ role: 'CLIENT' }));
    const req = createRequest('/api/admin/users/u1', {
      method: 'PUT',
      body: JSON.stringify({ firstName: 'Updated' }),
    });
    const res = await updateUserRoute(req, routeParams);
    expect(res.status).toBe(403);
  });

  it('updates user and returns data', async () => {
    mockGetServerSession.mockResolvedValue(mockAdminSession());
    mockUpdateUser.mockResolvedValue({ id: 'u1', firstName: 'Updated' });

    const req = createRequest('/api/admin/users/u1', {
      method: 'PUT',
      body: JSON.stringify({ firstName: 'Updated' }),
    });
    const res = await updateUserRoute(req, routeParams);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.firstName).toBe('Updated');
    expect(mockUpdateUser).toHaveBeenCalledWith(
      'u1',
      expect.any(Object),
      'branch-1',
      'test-user-id',
    );
  });
});

// ─── DELETE /api/admin/users/[id] ──────────────────────────────────

describe('DELETE /api/admin/users/[id]', () => {
  const routeParams = { params: Promise.resolve({ id: 'u1' }) };

  it('returns 403 for non-admin', async () => {
    mockGetServerSession.mockResolvedValue(createMockSession({ role: 'TRAINER' }));
    const req = createRequest('/api/admin/users/u1', { method: 'DELETE' });
    const res = await deleteUserRoute(req, routeParams);
    expect(res.status).toBe(403);
  });

  it('soft-deletes user and returns success', async () => {
    mockGetServerSession.mockResolvedValue(mockAdminSession());
    mockDeleteUser.mockResolvedValue({ success: true });

    const req = createRequest('/api/admin/users/u1', { method: 'DELETE' });
    const res = await deleteUserRoute(req, routeParams);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.success).toBe(true);
    expect(mockDeleteUser).toHaveBeenCalledWith('u1', 'branch-1', 'test-user-id');
  });

  it('returns 404 when user not found', async () => {
    mockGetServerSession.mockResolvedValue(mockAdminSession());
    mockDeleteUser.mockRejectedValue(new AppError('NOT_FOUND', 'User not found', 404));

    const req = createRequest('/api/admin/users/u1', { method: 'DELETE' });
    const res = await deleteUserRoute(req, routeParams);
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.code).toBe('NOT_FOUND');
  });
});
