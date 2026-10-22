# End-to-end tests (Playwright)

Browser tests that drive the real app the way a trainer or client does, on a
phone-sized Chrome (390×844, touch, dark mode).

## Run

```bash
docker compose up -d          # local Postgres (the tests write to it)
npm run test:e2e              # headless, reuses `npm run dev` if it's already up
npm run test:e2e:ui           # Playwright UI mode: watch, step through, pick tests
npm run test:e2e:report       # open the last HTML report (traces for failures)
```

Run one file or test: `npx playwright test tests/e2e/routines.spec.ts -g "Next up"`.
See the browser: add `--headed`.

## What it needs

- **Google Chrome installed.** The suite uses it (`channel: 'chrome'`) so no
  browser download is needed. To use Playwright's bundled Chromium instead:
  `npx playwright install chromium` and run with `E2E_BROWSER_CHANNEL=`.
- **Local seed data.** Accounts `admin@sector7.com`, `dev@gmail.com` (trainer)
  and `ammu@gmail.com` (client), password `password123`, with an active PT
  package between the trainer and client. Override with `E2E_ADMIN_EMAIL`,
  `E2E_TRAINER_EMAIL`, `E2E_CLIENT_EMAIL`, `E2E_PASSWORD`.
- **Exercises** `ex-curl`, `ex-tricep-pushdown`, `ex-pec-deck-fly`,
  `ex-lateral-raise` (from the exercise seed).

## Safety

The tests create and delete data, so they **refuse to run against any database
that isn't on this machine** (`E2E_DATABASE_URL`, default the local Docker
URL). They never touch prod Neon.

Every test cleans up after itself: the sessions, workout logs and programs it
creates are deleted, and if the client already had a program it is set aside
for the test and restored afterwards.

## Writing tests

- Import `test`/`expect` from `./support/fixtures`. You get signed-in pages
  (`trainerPage`, `clientPage`, `adminPage`) and data fixtures (`sessionId`,
  `libraryProgram`, `clientWithoutProgram`, `pair`). The fixtures hide the boot
  splash and Next's dev overlay.
- Opening `/trainer/session/<id>` for a SCHEDULED session **starts it**. That's
  why `sessionId` gives each test a fresh session.
- Prefer roles and labels (`getByRole('button', { name: 'Start Push Day' })`,
  `getByRole('textbox', { name: 'Set 1 kg' })`) over CSS selectors.
- Check the database with `testDb()` when the UI alone can't prove it.
- Files are `*.spec.ts`; Vitest only picks up `*.test.ts(x)`, so the two suites
  never collide.
