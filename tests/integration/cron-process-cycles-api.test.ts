import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockGetServerSession = vi.fn();
vi.mock('@/lib/auth', () => ({
  getServerSession: () => mockGetServerSession(),
  hasRole: (role: string, allowed: string[]) => allowed.includes(role),
}));

const mockProcessCycleEndsForPackages = vi.fn();
vi.mock('@/services/carryforward.service', () => ({
  processCycleEndsForPackages: (...args: unknown[]) => mockProcessCycleEndsForPackages(...args),
}));

import { POST as cronEntry } from '@/app/api/cron/process-cycles/route';
import { POST as manualTrigger } from '@/app/api/admin/cycles/process/route';
import { createMockSession } from '../helpers';

const SECRET = 'test-secret-abc123';
const ORIGINAL_SECRET = process.env.CRON_SECRET;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = SECRET;
});

afterEach(() => {
  process.env.CRON_SECRET = ORIGINAL_SECRET;
});

function req(headers: Record<string, string> = {}): Request {
  return new Request(new URL('/api/cron/process-cycles', 'http://localhost:3000'), {
    method: 'POST',
    headers,
  });
}

// ─── /api/cron/process-cycles ────────────────────────────────────────

describe('POST /api/cron/process-cycles', () => {
  it('returns 500 when CRON_SECRET is not configured', async () => {
    delete process.env.CRON_SECRET;

    const res = await cronEntry(req({ Authorization: `Bearer anything` }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe('MISCONFIGURED');
  });

  it('returns 401 when Authorization header is missing', async () => {
    const res = await cronEntry(req());
    expect(res.status).toBe(401);
  });

  it('returns 401 for wrong secret', async () => {
    const res = await cronEntry(req({ Authorization: `Bearer wrong-secret` }));
    expect(res.status).toBe(401);
    expect(mockProcessCycleEndsForPackages).not.toHaveBeenCalled();
  });

  it('returns 401 for non-Bearer scheme even with the right secret as the value', async () => {
    const res = await cronEntry(req({ Authorization: SECRET }));
    expect(res.status).toBe(401);
  });

  it('processes successfully with the right bearer token', async () => {
    mockProcessCycleEndsForPackages.mockResolvedValue({
      processed: 2,
      totalCarriedForward: 5,
      totalExpired: 1,
      details: [],
    });

    const res = await cronEntry(req({ Authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.processed).toBe(2);
    // Cron mode passes branchId=null so it spans all branches
    expect(mockProcessCycleEndsForPackages).toHaveBeenCalledWith(null, 'cron');
  });

  it('passes through service errors as 500', async () => {
    mockProcessCycleEndsForPackages.mockRejectedValue(new Error('db down'));

    const res = await cronEntry(req({ Authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(500);
  });
});

// ─── /api/admin/cycles/process ───────────────────────────────────────

describe('POST /api/admin/cycles/process', () => {
  function adminSession() {
    return createMockSession({ role: 'BRANCH_ADMIN', branchId: 'branch-1' });
  }

  it('returns 403 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await manualTrigger();
    expect(res.status).toBe(403);
    expect(mockProcessCycleEndsForPackages).not.toHaveBeenCalled();
  });

  it('returns 403 for non-admin roles', async () => {
    mockGetServerSession.mockResolvedValue(
      createMockSession({ role: 'TRAINER', branchId: 'branch-1' }),
    );
    const res = await manualTrigger();
    expect(res.status).toBe(403);
  });

  it('scopes processing to the caller branch and forwards actorId', async () => {
    mockGetServerSession.mockResolvedValue(adminSession());
    mockProcessCycleEndsForPackages.mockResolvedValue({
      processed: 1,
      totalCarriedForward: 3,
      totalExpired: 0,
      details: [],
    });

    const res = await manualTrigger();
    expect(res.status).toBe(200);
    expect(mockProcessCycleEndsForPackages).toHaveBeenCalledWith('branch-1', 'test-user-id');
  });

  it('returns the service result payload', async () => {
    mockGetServerSession.mockResolvedValue(adminSession());
    mockProcessCycleEndsForPackages.mockResolvedValue({
      processed: 1,
      totalCarriedForward: 3,
      totalExpired: 2,
      details: [
        {
          packageId: 'pkg-1',
          clientProfileId: 'c1',
          clientName: 'Alice A',
          totalSessions: 12,
          used: 7,
          unused: 5,
          effectiveLimit: 3,
          carryForwardOutSessions: 3,
          expired: 2,
        },
      ],
    });

    const res = await manualTrigger();
    const body = await res.json();
    expect(body.data.totalCarriedForward).toBe(3);
    expect(body.data.details[0].clientName).toBe('Alice A');
  });
});
