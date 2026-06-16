import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetServerSession = vi.fn();
vi.mock('@/lib/auth', () => ({
  getServerSession: () => mockGetServerSession(),
  hasRole: (role: string, allowed: string[]) => allowed.includes(role),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    ptPackage: { findFirst: vi.fn() },
    clientProfile: { findFirst: vi.fn() },
    trainerProfile: { findFirst: vi.fn() },
    sessionInstance: { findMany: vi.fn(), create: vi.fn() },
  },
}));

vi.mock('@/lib/audit', () => ({ auditLog: vi.fn() }));
const mockSendNotification = vi.fn();
vi.mock('@/lib/notifications', () => ({
  sendNotification: (...args: unknown[]) => mockSendNotification(...args),
}));

import { POST as bulkCreate } from '@/app/api/trainer/sessions/bulk/route';
import { prisma } from '@/lib/prisma';

const BRANCH = 'branch-1';
const TRAINER = 'tp-1';
const CLIENT = 'cp-1';

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

function req(body: unknown): Request {
  return new Request(new URL('/api/trainer/sessions/bulk', 'http://localhost:3000'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const validBody = {
  clientProfileId: CLIENT,
  dates: ['2026-06-10', '2026-06-11'],
  startTime: '07:00',
  durationMin: 60,
};

describe('POST /api/trainer/sessions/bulk', () => {
  it('returns 403 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await bulkCreate(req(validBody));
    expect(res.status).toBe(403);
  });

  it('returns 403 for non-trainer roles', async () => {
    mockGetServerSession.mockResolvedValue({
      ...trainerSession(),
      user: { ...trainerSession().user, role: 'CLIENT' },
    });
    const res = await bulkCreate(req(validBody));
    expect(res.status).toBe(403);
  });

  it('returns 403 when the trainer is not assigned to the client', async () => {
    mockGetServerSession.mockResolvedValue(trainerSession());
    vi.mocked(prisma.ptPackage.findFirst).mockResolvedValue(null);
    const res = await bulkCreate(req(validBody));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('NOT_ASSIGNED');
  });

  it('rejects an invalid payload', async () => {
    mockGetServerSession.mockResolvedValue(trainerSession());
    const res = await bulkCreate(req({ clientProfileId: CLIENT, dates: [], startTime: '07:00' }));
    expect(res.status).toBe(400);
  });

  it('creates sessions for new dates and skips existing ones', async () => {
    mockGetServerSession.mockResolvedValue(trainerSession());
    // assignment guard passes
    vi.mocked(prisma.ptPackage.findFirst).mockResolvedValue({ id: 'pkg-1' } as never);
    vi.mocked(prisma.clientProfile.findFirst).mockResolvedValue({
      id: CLIENT,
      user: { id: 'client-user-1', firstName: 'Alka', lastName: 'Thankachan' },
    } as never);
    vi.mocked(prisma.trainerProfile.findFirst).mockResolvedValue({
      id: TRAINER,
      user: { id: 'trainer-user-1', firstName: 'Kishore', lastName: 'Vinu' },
    } as never);
    // 2026-06-10 already booked → should be skipped
    vi.mocked(prisma.sessionInstance.findMany).mockResolvedValue([
      { scheduledDate: new Date('2026-06-10') },
    ] as never);
    vi.mocked(prisma.sessionInstance.create).mockResolvedValue({ id: 'new-session' } as never);

    const res = await bulkCreate(req(validBody));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.created).toBe(1);
    expect(body.data.skipped).toEqual(['2026-06-10']);
    expect(prisma.sessionInstance.create).toHaveBeenCalledTimes(1);
    // client is notified, trainer is not self-notified
    expect(mockSendNotification).toHaveBeenCalledTimes(1);
    expect(mockSendNotification).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: 'client-user-1' }),
    );
  });
});
