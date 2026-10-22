import { hash } from 'bcryptjs';
import { expect, type Page } from '@playwright/test';
import { test } from './support/fixtures';
import { testDb } from './support/db';
import { USERS } from './support/env';

// ADR-055: an admin marks a client as having left the gym; the client's login
// then shows a renew-membership notice instead of "Invalid email or password".
// Each test gets its own throwaway client account, deleted afterwards.

const CLIENT_PASSWORD = 'e2e-client-pass';

interface TempClient {
  id: string;
  email: string;
  firstName: string;
}

const membershipTest = test.extend<{ tempClient: TempClient }>({
  tempClient: async ({}, use) => {
    const db = testDb();
    const admin = await db.user.findFirstOrThrow({
      where: { email: USERS.admin },
      select: { branchId: true },
    });
    const stamp = Date.now();
    const user = await db.user.create({
      data: {
        branchId: admin.branchId,
        email: `e2e-member-${stamp}@sector7.test`,
        passwordHash: await hash(CLIENT_PASSWORD, 4),
        firstName: 'Leaver',
        lastName: `Member${stamp}`,
        roles: ['CLIENT'],
        clientProfile: { create: { branchId: admin.branchId } },
      },
    });

    await use({ id: user.id, email: user.email, firstName: user.firstName });

    await db.auditLog.deleteMany({ where: { OR: [{ actorId: user.id }, { subjectId: user.id }] } });
    await db.fcmToken.deleteMany({ where: { userId: user.id } });
    await db.notificationLog.deleteMany({ where: { recipientId: user.id } });
    await db.clientProfile.deleteMany({ where: { userId: user.id } });
    await db.user.delete({ where: { id: user.id } });
  },
});

async function signIn(page: Page, email: string, password: string) {
  await page.context().addInitScript(() => {
    try {
      localStorage.setItem('s7-splash-last-shown', String(Date.now()));
    } catch {
      // ignore
    }
  });
  await page.goto('/login');
  await page.waitForLoadState('networkidle');
  await page.locator('input[type="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.locator('button[type="submit"]').first().click();
}

membershipTest(
  'a client marked as left sees a renew notice at login',
  async ({ adminPage, tempClient, browser }) => {
    await adminPage.goto(`/admin/clients/${tempClient.id}`);
    await adminPage.getByRole('button', { name: 'Mark as left' }).click();
    await adminPage.getByRole('button', { name: 'Mark as left' }).last().click();
    await expect(adminPage.getByRole('button', { name: 'Reactivate' })).toBeVisible();

    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await signIn(page, tempClient.email, CLIENT_PASSWORD);

    // Not getByRole('alert'): Next's route announcer also has that role.
    const notice = page.getByRole('alert').filter({ hasText: 'Membership inactive' });
    await expect(notice).toContainText('Membership inactive');
    await expect(notice).toContainText('Renew your membership');
    await expect(page.locator('button[type="submit"]')).toBeDisabled();
    await expect(page).toHaveURL(/\/login/);

    // Editing the email unlocks Sign in. A wrong password still reads as a
    // plain failure: no hint the account exists.
    await page.locator('input[type="email"]').fill('');
    await expect(page.locator('button[type="submit"]')).toBeEnabled();
    await page.locator('input[type="email"]').fill(tempClient.email);
    await page.locator('input[type="password"]').fill('not-the-password');
    await page.locator('button[type="submit"]').click();
    await expect(page.getByText('Invalid email or password')).toBeVisible();
    await ctx.close();

    // Reactivated: they get straight back in.
    await adminPage.getByRole('button', { name: 'Reactivate' }).click();
    await expect(adminPage.getByRole('button', { name: 'Mark as left' })).toBeVisible();

    const ctx2 = await browser.newContext();
    const page2 = await ctx2.newPage();
    await signIn(page2, tempClient.email, CLIENT_PASSWORD);
    await expect(page2).toHaveURL(/\/client/);
    await ctx2.close();
  },
);
