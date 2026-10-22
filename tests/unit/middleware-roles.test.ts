import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';

vi.mock('next-auth/jwt', () => ({
  getToken: vi.fn(),
}));

import { getToken } from 'next-auth/jwt';

const mockedGetToken = vi.mocked(getToken);
const BASE = 'https://app.sector7.in';

function req(path: string, cookie?: string) {
  return new NextRequest(`${BASE}${path}`, cookie ? { headers: { cookie } } : undefined);
}

const headCoach = { role: 'BRANCH_ADMIN', roles: ['BRANCH_ADMIN', 'TRAINER'], branchId: 'b1' };
const admin = { role: 'BRANCH_ADMIN', roles: ['BRANCH_ADMIN'], branchId: 'b1' };
const trainer = { role: 'TRAINER', roles: ['TRAINER'], branchId: 'b1' };

describe('middleware multi-role access (ADR-054)', () => {
  beforeEach(() => mockedGetToken.mockReset());

  it('lets a head coach open both admin and trainer pages', async () => {
    mockedGetToken.mockResolvedValue(headCoach as never);

    expect((await middleware(req('/admin/sessions'))).headers.get('location')).toBeNull();
    expect((await middleware(req('/trainer/session/abc'))).headers.get('location')).toBeNull();
  });

  it('still keeps a head coach out of the client side', async () => {
    mockedGetToken.mockResolvedValue(headCoach as never);

    const res = await middleware(req('/client'));

    expect(res.headers.get('location')).toBe(`${BASE}/admin`);
  });

  it('keeps a plain trainer out of admin', async () => {
    mockedGetToken.mockResolvedValue(trainer as never);

    const res = await middleware(req('/admin/settings'));

    expect(res.headers.get('location')).toBe(`${BASE}/trainer`);
  });

  it('keeps a plain admin out of trainer', async () => {
    mockedGetToken.mockResolvedValue(admin as never);

    const res = await middleware(req('/trainer'));

    expect(res.headers.get('location')).toBe(`${BASE}/admin`);
  });

  it('sends / to the surface a head coach last used', async () => {
    mockedGetToken.mockResolvedValue(headCoach as never);

    expect((await middleware(req('/'))).headers.get('location')).toBe(`${BASE}/admin`);
    expect((await middleware(req('/', 's7_surface=trainer'))).headers.get('location')).toBe(
      `${BASE}/trainer`,
    );
  });

  it('ignores a remembered surface the user no longer holds', async () => {
    mockedGetToken.mockResolvedValue(admin as never);

    const res = await middleware(req('/', 's7_surface=trainer'));

    expect(res.headers.get('location')).toBe(`${BASE}/admin`);
  });

  it('sends a token whose roles were revoked to /login', async () => {
    mockedGetToken.mockResolvedValue({ role: '', roles: [], branchId: 'b1' } as never);

    const res = await middleware(req('/admin'));

    expect(res.headers.get('location')).toBe(`${BASE}/login`);
  });

  it('does not bounce a revoked token away from /login (no redirect loop)', async () => {
    mockedGetToken.mockResolvedValue({ role: '', roles: [], branchId: 'b1' } as never);

    const res = await middleware(req('/login'));

    expect(res.headers.get('location')).toBeNull();
  });

  it('still accepts legacy tokens that carry only `role`', async () => {
    mockedGetToken.mockResolvedValue({ role: 'CROSSFIT_TRAINER', branchId: 'b1' } as never);

    expect((await middleware(req('/trainer/crossfit'))).headers.get('location')).toBeNull();
  });
});
