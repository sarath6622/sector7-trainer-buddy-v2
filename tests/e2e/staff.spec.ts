import { hash } from 'bcryptjs';
import { expect, type Page } from '@playwright/test';
import { test } from './support/fixtures';
import { testDb } from './support/db';
import { USERS } from './support/env';

// ADR-054: Staff & Access page + the head coach admin/trainer switch.
// Each test gets its own throwaway staff account, deleted afterwards.

const STAFF_PASSWORD = 'e2e-staff-pass';

interface TempStaff {
  id: string;
  email: string;
  firstName: string;
}

const staffTest = test.extend<{ tempTrainer: TempStaff }>({
  tempTrainer: async ({}, use) => {
    const db = testDb();
    const admin = await db.user.findFirstOrThrow({
      where: { email: USERS.admin },
      select: { branchId: true },
    });
    const stamp = Date.now();
    const user = await db.user.create({
      data: {
        branchId: admin.branchId,
        email: `e2e-staff-${stamp}@sector7.test`,
        passwordHash: await hash(STAFF_PASSWORD, 4),
        firstName: 'Eetoo',
        lastName: `Staff${stamp}`,
        roles: ['TRAINER'],
        trainerProfile: {
          create: {
            branchId: admin.branchId,
            specialties: [],
            certifications: [],
            workingDays: [],
          },
        },
      },
    });

    await use({ id: user.id, email: user.email, firstName: user.firstName });

    await db.auditLog.deleteMany({ where: { OR: [{ actorId: user.id }, { subjectId: user.id }] } });
    await db.fcmToken.deleteMany({ where: { userId: user.id } });
    await db.notificationLog.deleteMany({ where: { recipientId: user.id } });
    await db.trainerProfile.deleteMany({ where: { userId: user.id } });
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

staffTest('admin promotes a trainer to head coach', async ({ adminPage, tempTrainer }) => {
  await adminPage.goto('/admin/staff');
  await expect(adminPage.getByRole('heading', { name: 'Staff & Access' })).toBeVisible();

  const card = adminPage.locator('div.rounded-xl', { hasText: tempTrainer.email });
  await expect(card.getByText('Trainer', { exact: true })).toBeVisible();

  await card.getByRole('button', { name: `Actions for ${tempTrainer.firstName}` }).click();
  await adminPage.getByRole('menuitem', { name: 'Change access' }).click();
  await adminPage.getByRole('radio', { name: /Head Coach/ }).click();
  await adminPage.getByRole('button', { name: 'Save' }).click();

  await expect(card.getByText('Head Coach', { exact: true })).toBeVisible();

  const db = testDb();
  const saved = await db.user.findUniqueOrThrow({ where: { id: tempTrainer.id } });
  expect(saved.roles.sort()).toEqual(['BRANCH_ADMIN', 'TRAINER']);
});

staffTest('admin cannot change their own access', async ({ adminPage }) => {
  await adminPage.goto('/admin/staff');
  const me = adminPage.locator('div.rounded-xl', { hasText: USERS.admin });
  await me.getByRole('button', { name: /Actions for/ }).click();

  await expect(adminPage.getByRole('menuitem', { name: 'Change access' })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await expect(adminPage.getByRole('menuitem', { name: 'Deactivate' })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
});

staffTest('a head coach switches between admin and trainer', async ({ browser, tempTrainer }) => {
  await testDb().user.update({
    where: { id: tempTrainer.id },
    data: { roles: ['BRANCH_ADMIN', 'TRAINER'] },
  });

  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, tempTrainer.email, STAFF_PASSWORD);

  // Lands on admin first.
  await expect(page).toHaveURL(/\/admin$/);
  const switcher = page.getByRole('tablist', { name: 'Switch workspace' });
  await expect(switcher).toBeVisible();
  await expect(switcher.getByRole('tab', { name: 'Admin' })).toHaveAttribute(
    'aria-selected',
    'true',
  );

  // Trainer side renders the trainer app, and its API calls are authorised.
  const trainerApi = page.waitForResponse(
    (r) => r.url().includes('/api/trainer/') && r.request().method() === 'GET',
  );
  await switcher.getByRole('tab', { name: 'Trainer' }).click();
  await expect(page).toHaveURL(/\/trainer$/);
  expect((await trainerApi).status()).toBe(200);
  await expect(switcher.getByRole('tab', { name: 'Trainer' })).toHaveAttribute(
    'aria-selected',
    'true',
  );

  // The remembered side wins next time they open the app.
  await page.goto('/');
  await expect(page).toHaveURL(/\/trainer$/);

  // And admin pages still open.
  await page.goto('/admin/staff');
  await expect(page.getByRole('heading', { name: 'Staff & Access' })).toBeVisible();

  await context.close();
});

staffTest(
  'a plain trainer sees no switcher and cannot open admin',
  async ({ browser, tempTrainer }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await signIn(page, tempTrainer.email, STAFF_PASSWORD);

    await expect(page).toHaveURL(/\/trainer$/);
    await expect(page.getByRole('tablist', { name: 'Switch workspace' })).toHaveCount(0);

    await page.goto('/admin/staff');
    await expect(page).toHaveURL(/\/trainer$/);

    await context.close();
  },
);
