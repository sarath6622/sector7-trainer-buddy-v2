import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock auth ──────────────────────────────────────────────────────────────
const mockGetServerSession = vi.fn();
vi.mock('@/lib/auth', () => ({
  getServerSession: () => mockGetServerSession(),
  hasRole: (userRole: string | string[], allowedRoles: string[]) => {
    if (Array.isArray(userRole)) return userRole.some((r) => allowedRoles.includes(r));
    return allowedRoles.includes(userRole);
  },
}));

// ─── Mock kickboxing service ────────────────────────────────────────────────
const mockGetTodaySessions = vi.fn();
const mockGetOrCreateSession = vi.fn();
const mockStartSession = vi.fn();
const mockEndSession = vi.fn();
const mockGetAttendance = vi.fn();
const mockMarkAttendance = vi.fn();
const mockRemoveAttendance = vi.fn();

vi.mock('@/services/kickboxing.service', () => ({
  getTodayKickboxingSessionsForTrainer: (...args: unknown[]) => mockGetTodaySessions(...args),
  getOrCreateKickboxingSession: (...args: unknown[]) => mockGetOrCreateSession(...args),
  startKickboxingSession: (...args: unknown[]) => mockStartSession(...args),
  endKickboxingSession: (...args: unknown[]) => mockEndSession(...args),
  getKickboxingAttendance: (...args: unknown[]) => mockGetAttendance(...args),
  markKickboxingAttendance: (...args: unknown[]) => mockMarkAttendance(...args),
  removeKickboxingAttendance: (...args: unknown[]) => mockRemoveAttendance(...args),
}));

import { GET as getTodaySessions } from '@/app/api/kickboxing/sessions/today/route';
import { POST as openSession } from '@/app/api/kickboxing/sessions/route';
import { POST as startSession } from '@/app/api/kickboxing/sessions/[id]/start/route';
import { POST as endSession } from '@/app/api/kickboxing/sessions/[id]/end/route';
import {
  GET as listAttendance,
  POST as markAttendance,
} from '@/app/api/kickboxing/sessions/[id]/attendance/route';
import { DELETE as deleteAttendance } from '@/app/api/kickboxing/sessions/[id]/attendance/[attendanceId]/route';
import { AppError } from '@/lib/errors';

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Session factory helpers ─────────────────────────────────────────────────

function makeKickboxingTrainerSession(overrides: Record<string, unknown> = {}) {
  return {
    user: {
      id: 'trainer-user-1',
      email: 'kb@sector7.com',
      roles: ['KICKBOXING_TRAINER'],
      branchId: 'branch-1',
      trainerProfileId: 'tp-1',
      ...overrides,
    },
    expires: new Date(Date.now() + 86400000).toISOString(),
  };
}

function makeAdminSession() {
  return {
    user: {
      id: 'admin-user-1',
      email: 'admin@sector7.com',
      roles: ['BRANCH_ADMIN'],
      branchId: 'branch-1',
      trainerProfileId: null,
    },
    expires: new Date(Date.now() + 86400000).toISOString(),
  };
}

function createRequest(url: string, options: RequestInit = {}): Request {
  return new Request(new URL(url, 'http://localhost:3000'), {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
}

// ─── GET /api/kickboxing/sessions/today ─────────────────────────────────────

describe('GET /api/kickboxing/sessions/today', () => {
  it('returns 403 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await getTodaySessions();
    expect(res.status).toBe(403);
  });

  it('returns 403 for CLIENT role', async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: 'u1', roles: ['CLIENT'], branchId: 'b1' },
    });
    const res = await getTodaySessions();
    expect(res.status).toBe(403);
  });

  it('returns empty array when trainer has no trainerProfileId', async () => {
    mockGetServerSession.mockResolvedValue(
      makeKickboxingTrainerSession({ trainerProfileId: null }),
    );
    const res = await getTodaySessions();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toEqual([]);
    expect(mockGetTodaySessions).not.toHaveBeenCalled();
  });

  it('returns today sessions for kickboxing trainer', async () => {
    mockGetServerSession.mockResolvedValue(makeKickboxingTrainerSession());
    mockGetTodaySessions.mockResolvedValue([
      { class: { id: 'cls-1', name: 'Monday 6PM Kickboxing' }, session: null },
    ]);

    const res = await getTodaySessions();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(mockGetTodaySessions).toHaveBeenCalledWith('tp-1', 'branch-1');
  });

  it('allows BRANCH_ADMIN access', async () => {
    mockGetServerSession.mockResolvedValue(makeAdminSession());
    const res = await getTodaySessions();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toEqual([]);
  });
});

// ─── POST /api/kickboxing/sessions ──────────────────────────────────────────

describe('POST /api/kickboxing/sessions', () => {
  const validBody = { classId: 'clckwrkbtch00000000000001', date: '2026-04-24' };

  it('returns 403 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const req = createRequest('/api/kickboxing/sessions', {
      method: 'POST',
      body: JSON.stringify(validBody),
    });
    const res = await openSession(req);
    expect(res.status).toBe(403);
  });

  it('returns 400 for invalid body (bad date format)', async () => {
    mockGetServerSession.mockResolvedValue(makeKickboxingTrainerSession());
    const req = createRequest('/api/kickboxing/sessions', {
      method: 'POST',
      body: JSON.stringify({ classId: 'clckwrkbtch00000000000001', date: 'not-a-date' }),
    });
    const res = await openSession(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing classId', async () => {
    mockGetServerSession.mockResolvedValue(makeKickboxingTrainerSession());
    const req = createRequest('/api/kickboxing/sessions', {
      method: 'POST',
      body: JSON.stringify({ date: '2026-04-24' }),
    });
    const res = await openSession(req);
    expect(res.status).toBe(400);
  });

  it('creates or returns session and responds 201', async () => {
    mockGetServerSession.mockResolvedValue(makeKickboxingTrainerSession());
    mockGetOrCreateSession.mockResolvedValue({
      id: 'sess-1',
      classId: 'clckwrkbtch00000000000001',
      status: 'SCHEDULED',
      _count: { attendances: 0 },
    });

    const req = createRequest('/api/kickboxing/sessions', {
      method: 'POST',
      body: JSON.stringify(validBody),
    });
    const res = await openSession(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.data.id).toBe('sess-1');
    expect(mockGetOrCreateSession).toHaveBeenCalledWith(
      'clckwrkbtch00000000000001',
      expect.any(Date),
      'branch-1',
      'trainer-user-1',
    );
  });

  it('propagates NOT_FOUND (404) from service', async () => {
    mockGetServerSession.mockResolvedValue(makeKickboxingTrainerSession());
    mockGetOrCreateSession.mockRejectedValue(
      new AppError('NOT_FOUND', 'Kickboxing class not found', 404),
    );

    const req = createRequest('/api/kickboxing/sessions', {
      method: 'POST',
      body: JSON.stringify(validBody),
    });
    const res = await openSession(req);
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.code).toBe('NOT_FOUND');
  });
});

// ─── POST /api/kickboxing/sessions/[id]/start ───────────────────────────────

describe('POST /api/kickboxing/sessions/[id]/start', () => {
  const routeParams = { params: Promise.resolve({ id: 'sess-1' }) };

  it('returns 403 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const req = createRequest('/api/kickboxing/sessions/sess-1/start', { method: 'POST' });
    const res = await startSession(req, routeParams);
    expect(res.status).toBe(403);
  });

  it('starts session successfully', async () => {
    mockGetServerSession.mockResolvedValue(makeKickboxingTrainerSession());
    mockStartSession.mockResolvedValue({
      id: 'sess-1',
      status: 'IN_PROGRESS',
      startedAt: new Date().toISOString(),
    });

    const req = createRequest('/api/kickboxing/sessions/sess-1/start', { method: 'POST' });
    const res = await startSession(req, routeParams);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.status).toBe('IN_PROGRESS');
    expect(mockStartSession).toHaveBeenCalledWith('sess-1', 'branch-1', 'trainer-user-1');
  });

  it('propagates CONFLICT (409) when session already completed', async () => {
    mockGetServerSession.mockResolvedValue(makeKickboxingTrainerSession());
    mockStartSession.mockRejectedValue(
      new AppError('CONFLICT', 'Session is already completed', 409),
    );

    const req = createRequest('/api/kickboxing/sessions/sess-1/start', { method: 'POST' });
    const res = await startSession(req, routeParams);
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.code).toBe('CONFLICT');
  });
});

// ─── POST /api/kickboxing/sessions/[id]/end ─────────────────────────────────

describe('POST /api/kickboxing/sessions/[id]/end', () => {
  const routeParams = { params: Promise.resolve({ id: 'sess-1' }) };

  it('returns 403 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const req = createRequest('/api/kickboxing/sessions/sess-1/end', { method: 'POST' });
    const res = await endSession(req, routeParams);
    expect(res.status).toBe(403);
  });

  it('ends session successfully', async () => {
    mockGetServerSession.mockResolvedValue(makeKickboxingTrainerSession());
    mockEndSession.mockResolvedValue({
      id: 'sess-1',
      status: 'COMPLETED',
      endedAt: new Date().toISOString(),
    });

    const req = createRequest('/api/kickboxing/sessions/sess-1/end', { method: 'POST' });
    const res = await endSession(req, routeParams);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.status).toBe('COMPLETED');
    expect(mockEndSession).toHaveBeenCalledWith('sess-1', 'branch-1', 'trainer-user-1');
  });

  it('propagates CONFLICT (409) when session not yet started', async () => {
    mockGetServerSession.mockResolvedValue(makeKickboxingTrainerSession());
    mockEndSession.mockRejectedValue(
      new AppError('CONFLICT', 'Session has not been started yet', 409),
    );

    const req = createRequest('/api/kickboxing/sessions/sess-1/end', { method: 'POST' });
    const res = await endSession(req, routeParams);
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.code).toBe('CONFLICT');
  });
});

// ─── GET /api/kickboxing/sessions/[id]/attendance ───────────────────────────

describe('GET /api/kickboxing/sessions/[id]/attendance', () => {
  const routeParams = { params: Promise.resolve({ id: 'sess-1' }) };

  it('returns 403 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const req = createRequest('/api/kickboxing/sessions/sess-1/attendance');
    const res = await listAttendance(req, routeParams);
    expect(res.status).toBe(403);
  });

  it('returns attendance list', async () => {
    mockGetServerSession.mockResolvedValue(makeKickboxingTrainerSession());
    mockGetAttendance.mockResolvedValue([
      { id: 'att-1', clientProfileId: 'cp-1', externalName: null },
      { id: 'att-2', clientProfileId: null, externalName: 'Walk-In' },
    ]);

    const req = createRequest('/api/kickboxing/sessions/sess-1/attendance');
    const res = await listAttendance(req, routeParams);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(2);
    expect(mockGetAttendance).toHaveBeenCalledWith('sess-1', 'branch-1');
  });

  it('propagates NOT_FOUND (404) for invalid session', async () => {
    mockGetServerSession.mockResolvedValue(makeKickboxingTrainerSession());
    mockGetAttendance.mockRejectedValue(
      new AppError('NOT_FOUND', 'Kickboxing session not found', 404),
    );

    const req = createRequest('/api/kickboxing/sessions/sess-invalid/attendance');
    const res = await listAttendance(req, { params: Promise.resolve({ id: 'sess-invalid' }) });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.code).toBe('NOT_FOUND');
  });
});

// ─── POST /api/kickboxing/sessions/[id]/attendance ──────────────────────────

describe('POST /api/kickboxing/sessions/[id]/attendance', () => {
  const routeParams = { params: Promise.resolve({ id: 'sess-1' }) };

  it('returns 403 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const req = createRequest('/api/kickboxing/sessions/sess-1/attendance', {
      method: 'POST',
      body: JSON.stringify({ clientProfileId: 'cp-1' }),
    });
    const res = await markAttendance(req, routeParams);
    expect(res.status).toBe(403);
  });

  it('marks attendance for a client profile and returns 201', async () => {
    mockGetServerSession.mockResolvedValue(makeKickboxingTrainerSession());
    mockMarkAttendance.mockResolvedValue({
      id: 'att-1',
      sessionId: 'sess-1',
      clientProfileId: 'cp-1',
      externalName: null,
    });

    const req = createRequest('/api/kickboxing/sessions/sess-1/attendance', {
      method: 'POST',
      body: JSON.stringify({ clientProfileId: 'cp-1' }),
    });
    const res = await markAttendance(req, routeParams);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.data.id).toBe('att-1');
    expect(mockMarkAttendance).toHaveBeenCalledWith(
      'sess-1',
      { clientProfileId: 'cp-1' },
      'trainer-user-1',
      'branch-1',
    );
  });

  it('marks walk-in attendance with externalName', async () => {
    mockGetServerSession.mockResolvedValue(makeKickboxingTrainerSession());
    mockMarkAttendance.mockResolvedValue({
      id: 'att-2',
      sessionId: 'sess-1',
      clientProfileId: null,
      externalName: 'John Walk-In',
    });

    const req = createRequest('/api/kickboxing/sessions/sess-1/attendance', {
      method: 'POST',
      body: JSON.stringify({ externalName: 'John Walk-In' }),
    });
    const res = await markAttendance(req, routeParams);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.data.externalName).toBe('John Walk-In');
  });

  it('returns 409 when attendance is locked (session COMPLETED)', async () => {
    mockGetServerSession.mockResolvedValue(makeKickboxingTrainerSession());
    mockMarkAttendance.mockRejectedValue(
      new AppError('CONFLICT', 'Session is already completed — attendance is locked', 409),
    );

    const req = createRequest('/api/kickboxing/sessions/sess-1/attendance', {
      method: 'POST',
      body: JSON.stringify({ clientProfileId: 'cp-1' }),
    });
    const res = await markAttendance(req, routeParams);
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.code).toBe('CONFLICT');
  });

  it('returns 409 when client is already marked present (duplicate prevention)', async () => {
    mockGetServerSession.mockResolvedValue(makeKickboxingTrainerSession());
    mockMarkAttendance.mockRejectedValue(
      new AppError('DUPLICATE', 'Client is already marked present for this session', 409),
    );

    const req = createRequest('/api/kickboxing/sessions/sess-1/attendance', {
      method: 'POST',
      body: JSON.stringify({ clientProfileId: 'cp-1' }),
    });
    const res = await markAttendance(req, routeParams);
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.code).toBe('DUPLICATE');
  });
});

// ─── DELETE /api/kickboxing/sessions/[id]/attendance/[attendanceId] ──────────

describe('DELETE /api/kickboxing/sessions/[id]/attendance/[attendanceId]', () => {
  const routeParams = { params: Promise.resolve({ id: 'sess-1', attendanceId: 'att-1' }) };

  it('returns 403 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const req = createRequest('/api/kickboxing/sessions/sess-1/attendance/att-1', {
      method: 'DELETE',
    });
    const res = await deleteAttendance(req, routeParams);
    expect(res.status).toBe(403);
  });

  it('removes attendance record and returns success', async () => {
    mockGetServerSession.mockResolvedValue(makeKickboxingTrainerSession());
    mockRemoveAttendance.mockResolvedValue({ success: true });

    const req = createRequest('/api/kickboxing/sessions/sess-1/attendance/att-1', {
      method: 'DELETE',
    });
    const res = await deleteAttendance(req, routeParams);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.success).toBe(true);
    expect(mockRemoveAttendance).toHaveBeenCalledWith(
      'sess-1',
      'att-1',
      'branch-1',
      'trainer-user-1',
    );
  });

  it('returns 404 when attendance record not found', async () => {
    mockGetServerSession.mockResolvedValue(makeKickboxingTrainerSession());
    mockRemoveAttendance.mockRejectedValue(
      new AppError('NOT_FOUND', 'Attendance record not found', 404),
    );

    const req = createRequest('/api/kickboxing/sessions/sess-1/attendance/att-invalid', {
      method: 'DELETE',
    });
    const res = await deleteAttendance(req, {
      params: Promise.resolve({ id: 'sess-1', attendanceId: 'att-invalid' }),
    });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.code).toBe('NOT_FOUND');
  });
});
