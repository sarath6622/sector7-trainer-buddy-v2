import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';

vi.mock('next-auth/jwt', () => ({
  getToken: vi.fn(),
}));

import { getToken } from 'next-auth/jwt';

const mockedGetToken = vi.mocked(getToken);

const BASE = 'https://app.sector7.in';

function req(path: string) {
  return new NextRequest(`${BASE}${path}`);
}

const trainerToken = { role: 'TRAINER', branchId: 'branch-1' };

describe('middleware /login bounce', () => {
  beforeEach(() => {
    mockedGetToken.mockReset();
  });

  it('redirects an authenticated user from /login to their role dashboard', async () => {
    mockedGetToken.mockResolvedValue(trainerToken as never);

    const res = await middleware(req('/login'));

    expect(res.headers.get('location')).toBe(`${BASE}/trainer`);
  });

  it('prefers a safe relative callbackUrl over the role default', async () => {
    mockedGetToken.mockResolvedValue(trainerToken as never);

    const res = await middleware(req('/login?callbackUrl=%2Ftrainer%2Fclients'));

    expect(res.headers.get('location')).toBe(`${BASE}/trainer/clients`);
  });

  it('ignores a protocol-relative callbackUrl (open-redirect guard)', async () => {
    mockedGetToken.mockResolvedValue(trainerToken as never);

    const res = await middleware(req('/login?callbackUrl=%2F%2Fevil.com'));

    expect(res.headers.get('location')).toBe(`${BASE}/trainer`);
  });

  it('lets an unauthenticated user through to the login page', async () => {
    mockedGetToken.mockResolvedValue(null as never);

    const res = await middleware(req('/login'));

    expect(res.headers.get('location')).toBeNull();
  });

  it('does not bounce a token missing branchId (would loop via the branchId guard)', async () => {
    mockedGetToken.mockResolvedValue({ role: 'TRAINER' } as never);

    const res = await middleware(req('/login'));

    expect(res.headers.get('location')).toBeNull();
  });

  it('does not bounce a token with an unknown role (no dashboard to send it to)', async () => {
    mockedGetToken.mockResolvedValue({ role: 'MYSTERY', branchId: 'branch-1' } as never);

    const res = await middleware(req('/login'));

    expect(res.headers.get('location')).toBeNull();
  });

  it('still redirects unauthenticated users off protected pages (existing behavior)', async () => {
    mockedGetToken.mockResolvedValue(null as never);

    const res = await middleware(req('/trainer'));

    const location = res.headers.get('location');
    expect(location).toContain('/login');
    expect(location).toContain('callbackUrl=%2Ftrainer');
  });
});
