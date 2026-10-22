import fs from 'fs';
import { request, type FullConfig } from '@playwright/test';
import {
  AUTH_DIR,
  BASE_URL,
  PASSWORD,
  USERS,
  assertLocalDatabase,
  storageStateFor,
  type Role,
} from './support/env';

/**
 * Logs each role in once through NextAuth's credentials endpoint and saves the
 * cookies, so specs start already signed in (`storageState`). The UI login
 * form itself is covered by auth.spec.ts.
 */
export default async function globalSetup(_config: FullConfig) {
  assertLocalDatabase();
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  for (const role of Object.keys(USERS) as Role[]) {
    const ctx = await request.newContext({ baseURL: BASE_URL });
    const { csrfToken } = (await (await ctx.get('/api/auth/csrf')).json()) as { csrfToken: string };
    const res = await ctx.post('/api/auth/callback/credentials', {
      form: {
        csrfToken,
        email: USERS[role],
        password: PASSWORD,
        redirect: 'false',
        json: 'true',
      },
    });
    if (!res.ok()) throw new Error(`Login failed for ${role} (${USERS[role]}): ${res.status()}`);

    const session = await (await ctx.get('/api/auth/session')).json();
    if (!session?.user?.email) {
      throw new Error(`No session after logging in ${role} (${USERS[role]}) — wrong password?`);
    }
    await ctx.storageState({ path: storageStateFor(role) });
    await ctx.dispose();
  }
}
