import { defineConfig } from '@playwright/test';

/**
 * End-to-end tests (Playwright) — see tests/e2e/README.md.
 *
 * Runs a phone-sized Chrome against the local dev server and the LOCAL Docker
 * database. Tests create and delete their own sessions/programs, so they run
 * one at a time (workers: 1) against the shared DB.
 */
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  globalSetup: './tests/e2e/global-setup.ts',
  outputDir: 'test-results',
  use: {
    baseURL,
    // Installed Google Chrome — no browser download needed. Set
    // E2E_BROWSER_CHANNEL= (empty) to use Playwright's bundled Chromium
    // after `npx playwright install chromium`.
    channel: process.env.E2E_BROWSER_CHANNEL ?? 'chrome',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    colorScheme: 'dark',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'mobile-chrome' }],
  // Reuses a dev server that's already running; otherwise starts one.
  webServer: {
    command: 'npm run dev',
    url: `${baseURL}/login`,
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
