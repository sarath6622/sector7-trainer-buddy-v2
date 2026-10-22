// Shared settings for the e2e suite. Every value can be overridden with an env
// var; the defaults are the seeded local accounts (password `password123`).

export const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

export const DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? 'postgresql://sector7:sector7pass@localhost:5432/sector7';

export const PASSWORD = process.env.E2E_PASSWORD ?? 'password123';

export const USERS = {
  admin: process.env.E2E_ADMIN_EMAIL ?? 'admin@sector7.com',
  // The trainer must hold an ACTIVE PtPackage with the client below.
  trainer: process.env.E2E_TRAINER_EMAIL ?? 'dev@gmail.com',
  client: process.env.E2E_CLIENT_EMAIL ?? 'ammu@gmail.com',
} as const;

export type Role = keyof typeof USERS;

export const AUTH_DIR = 'tests/e2e/.auth';
export const storageStateFor = (role: Role) => `${AUTH_DIR}/${role}.json`;

/**
 * The suite writes to the database it points at. Refuse anything that isn't
 * on this machine, so a stray env var can never aim it at prod Neon.
 */
export function assertLocalDatabase(url: string = DATABASE_URL): void {
  const host = new URL(url).hostname;
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
    throw new Error(
      `E2E refuses to run against non-local database host "${host}". ` +
        'Point E2E_DATABASE_URL at the local Docker Postgres.',
    );
  }
}
