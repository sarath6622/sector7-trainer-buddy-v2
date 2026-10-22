import { test, expect } from '@playwright/test';
import { PASSWORD, USERS } from './support/env';

// The real login form, from a signed-out browser. Other specs reuse saved
// sessions (global-setup.ts) so they don't repeat this.

test.describe('login', () => {
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
      try {
        localStorage.setItem('s7-splash-last-shown', String(Date.now()));
      } catch {
        // ignore
      }
    });
  });

  for (const [role, landing] of [
    ['trainer', /\/trainer/],
    ['client', /\/client/],
    ['admin', /\/admin/],
  ] as const) {
    test(`${role} signs in and lands on their dashboard`, async ({ page }) => {
      await page.goto('/login');
      // The form eats keystrokes typed before React hydrates — wait for it.
      await page.waitForLoadState('networkidle');
      await page.locator('input[type="email"], input[name="email"]').first().fill(USERS[role]);
      await page.locator('input[type="password"]').first().fill(PASSWORD);
      await page.locator('button[type="submit"]').first().click();
      await expect(page).toHaveURL(landing);
    });
  }

  test('a wrong password is rejected', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    await page.locator('input[type="email"], input[name="email"]').first().fill(USERS.trainer);
    await page.locator('input[type="password"]').first().fill('not-the-password');
    await page.locator('button[type="submit"]').first().click();
    await expect(page.getByText('Invalid email or password')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });
});
