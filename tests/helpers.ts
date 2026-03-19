import { NextRequest } from 'next/server';

/**
 * Creates a mock NextRequest for API route testing.
 */
export function createMockRequest(
  url: string,
  options: {
    method?: string;
    body?: Record<string, unknown>;
    headers?: Record<string, string>;
    searchParams?: Record<string, string>;
  } = {},
): NextRequest {
  const { method = 'GET', body, headers = {}, searchParams = {} } = options;

  const urlObj = new URL(url, 'http://localhost:3000');
  Object.entries(searchParams).forEach(([key, value]) => {
    urlObj.searchParams.set(key, value);
  });

  const init: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  };

  if (body && method !== 'GET') {
    init.body = JSON.stringify(body);
  }

  return new NextRequest(urlObj, init);
}

/**
 * Creates a mock authenticated session for testing.
 */
export function createMockSession(
  overrides: {
    userId?: string;
    email?: string;
    role?: string;
    branchId?: string;
  } = {},
) {
  return {
    user: {
      id: overrides.userId ?? 'test-user-id',
      email: overrides.email ?? 'test@sector7.com',
      role: overrides.role ?? 'BRANCH_ADMIN',
      branchId: overrides.branchId ?? 'test-branch-id',
      firstName: 'Test',
      lastName: 'User',
    },
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  };
}
