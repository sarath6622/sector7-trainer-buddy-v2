import type { Page } from '@playwright/test';
import { test, expect } from './support/fixtures';
import { testDb } from './support/db';

/**
 * Client without a program: when the library holds more than one program the
 * card opens on "Choose a program" — pick the test's own program. With a
 * single library program it goes straight to the days, so this is a no-op.
 */
async function pickProgram(page: Page, programName: string) {
  const chooser = page.getByRole('heading', { name: 'Choose a program' });
  const days = page.getByRole('button', { name: /^Start / });
  await expect(chooser.or(days).first()).toBeVisible();
  if (await chooser.isVisible()) {
    await page.getByRole('button', { name: new RegExp(`^${programName}`) }).click();
  }
}

// ADR-053 training routines, end to end: trainer starts a routine from the
// session page, logs a set against its targets; the client sees the targets
// but can't start a routine; the rotation moves on.

test.describe('training routines', () => {
  test('trainer starts a library routine in a live session and logs a set', async ({
    trainerPage: page,
    sessionId,
    pair,
    clientWithoutProgram: _,
    libraryProgram,
  }) => {
    const [upper, arms] = libraryProgram.routines;
    if (!upper || !arms) throw new Error('fixture program needs two routines');

    // Opening a SCHEDULED session as its trainer starts it.
    await page.goto(`/trainer/session/${sessionId}`);

    // No program yet → "Choose a program", then the day.
    await expect(page.getByRole('heading', { name: 'Choose a program' })).toBeVisible();
    await page.getByRole('button', { name: new RegExp(`^${libraryProgram.name}`) }).click();
    await expect(page.getByText(`Assigns ${libraryProgram.name} to`)).toBeVisible();
    await page.getByRole('button', { name: new RegExp(`^${arms.name}`) }).click();
    await expect(page.getByRole('heading', { name: arms.name })).toBeVisible();
    await expect(page.getByText('Bicep Curl')).toBeVisible();

    await page.getByRole('button', { name: `Start ${arms.name}` }).click();

    // The routine name becomes the log title and its exercises are added.
    await expect(page.getByRole('heading', { level: 2, name: arms.name })).toBeVisible();
    await expect(page.getByText('Tricep Pushdown')).toBeVisible();

    // Server side: routine linked to the session, program copied to the client.
    const db = testDb();
    await expect
      .poll(
        async () => (await db.sessionInstance.findUnique({ where: { id: sessionId } }))?.routineId,
      )
      .toBeTruthy();
    const copy = await db.routineProgram.findFirst({
      where: {
        clientProfileId: pair.client.id,
        isActive: true,
        sourceProgramId: libraryProgram.id,
      },
    });
    expect(copy).not.toBeNull();
    expect(await db.workoutLog.count({ where: { sessionInstanceId: sessionId } })).toBe(2);

    // Open Bicep Curl, fill set 1 from its target, add the weight.
    await page.getByText('Bicep Curl').first().click();
    await expect(page.getByText('Target').first()).toBeVisible();
    await page
      .getByRole('button', { name: /Fill set 1 with target/ })
      .first()
      .click();
    await expect(page.getByRole('textbox', { name: 'Set 1 Reps' }).first()).toHaveValue('15');
    await page.getByRole('textbox', { name: 'Set 1 kg' }).first().fill('7.5');

    // Auto-save persists the completed set.
    await expect
      .poll(
        async () =>
          db.workoutSet.findFirst({
            where: {
              workoutLog: { sessionInstanceId: sessionId, exerciseId: 'ex-curl' },
              setNumber: 1,
            },
            select: { reps: true, weightKg: true },
          }),
        { timeout: 20_000 },
      )
      .toEqual({ reps: 15, weightKg: 7.5 });
  });

  test('client sees the routine targets but cannot start a routine', async ({
    trainerPage,
    clientPage,
    sessionId,
    clientWithoutProgram: _,
    libraryProgram,
  }) => {
    const [upper] = libraryProgram.routines;
    if (!upper) throw new Error('fixture program needs a routine');

    // Trainer starts the session and the routine.
    await trainerPage.goto(`/trainer/session/${sessionId}`);
    await pickProgram(trainerPage, libraryProgram.name);
    await trainerPage.getByRole('button', { name: `Start ${upper.name}` }).click();
    await expect(trainerPage.getByRole('heading', { level: 2, name: upper.name })).toBeVisible();

    // Client: same title and exercises, no routine controls.
    await clientPage.goto(`/client/session/${sessionId}`);
    await expect(clientPage.getByRole('heading', { level: 2, name: upper.name })).toBeVisible();
    await expect(clientPage.getByText('Pec Deck Fly')).toBeVisible();
    await expect(clientPage.getByRole('button', { name: /^Start / })).toHaveCount(0);

    // And the API refuses a client applying a routine.
    const res = await clientPage.request.post(`/api/sessions/${sessionId}/routine`, {
      data: { routineId: upper.id },
    });
    expect(res.status()).toBe(403);
  });

  test('"Next up" only advances once the routine was actually trained', async ({
    trainerPage: page,
    sessionId,
    pair,
    clientWithoutProgram: _,
    libraryProgram,
  }) => {
    const [upper, arms] = libraryProgram.routines;
    if (!upper || !arms) throw new Error('fixture program needs two routines');

    const nextUp = async () => {
      const res = await page.request.get(`/api/routine-programs/clients/${pair.client.id}`);
      const program = (await res.json()).data as {
        nextRoutineId: string;
        routines: { id: string; name: string }[];
      };
      return program.routines.find((r) => r.id === program.nextRoutineId)?.name;
    };

    await page.goto(`/trainer/session/${sessionId}`);
    await pickProgram(page, libraryProgram.name);
    await page.getByRole('button', { name: `Start ${upper.name}` }).click();
    await expect(page.getByRole('heading', { level: 2, name: upper.name })).toBeVisible();

    // Started but nothing logged yet: an abandoned session must not count.
    expect(await nextUp()).toBe(upper.name);

    // Log one set → now it counts, and the rotation moves on.
    await page.getByText('Pec Deck Fly').first().click();
    await page
      .getByRole('button', { name: /Fill set 1 with target/ })
      .first()
      .click();
    await page.getByRole('textbox', { name: 'Set 1 kg' }).first().fill('10');
    await expect.poll(nextUp, { timeout: 20_000 }).toBe(arms.name);
  });

  test('trainer switches to another day: unlogged exercises swap, logged ones stay', async ({
    trainerPage: page,
    sessionId,
    clientWithoutProgram: _,
    libraryProgram,
  }) => {
    const [upper, arms] = libraryProgram.routines;
    if (!upper || !arms) throw new Error('fixture program needs two routines');
    const db = testDb();

    await page.goto(`/trainer/session/${sessionId}`);
    await pickProgram(page, libraryProgram.name);
    await page.getByRole('button', { name: /^E2E Arms/ }).click();
    await page.getByRole('button', { name: `Start ${arms.name}` }).click();
    await expect(page.getByRole('heading', { level: 2, name: arms.name })).toBeVisible();

    // Log a set on Bicep Curl; Tricep Pushdown stays untouched.
    await page.getByText('Bicep Curl').first().click();
    await page
      .getByRole('button', { name: /Fill set 1 with target/ })
      .first()
      .click();
    await page.getByRole('textbox', { name: 'Set 1 kg' }).first().fill('7.5');
    await expect
      .poll(() =>
        db.workoutSet.count({
          where: { workoutLog: { sessionInstanceId: sessionId, exerciseId: 'ex-curl' } },
        }),
      )
      .toBe(1);

    // Oops, wrong day: switch to Upper.
    await page.getByRole('button', { name: 'Change routine' }).click();
    const sheet = page.getByRole('dialog');
    await sheet.getByRole('button', { name: new RegExp(`^${upper.name}`) }).click();
    await sheet.getByRole('button', { name: `Switch to ${upper.name}` }).click();

    await expect(page.getByRole('heading', { level: 2, name: upper.name })).toBeVisible();
    await expect(page.getByText('Pec Deck Fly').first()).toBeVisible();
    await expect(page.getByText('Bicep Curl').first()).toBeVisible(); // logged → kept
    await expect(page.getByText('Tricep Pushdown')).toHaveCount(0); // untouched → removed

    const logs = await db.workoutLog.findMany({
      where: { sessionInstanceId: sessionId },
      select: { exerciseId: true },
    });
    expect(logs.map((l) => l.exerciseId).sort()).toEqual(
      ['ex-curl', 'ex-lateral-raise', 'ex-pec-deck-fly'].sort(),
    );
  });

  test('trainer removes a routine started by mistake', async ({
    trainerPage: page,
    sessionId,
    clientWithoutProgram: _,
    libraryProgram,
  }) => {
    const [upper] = libraryProgram.routines;
    if (!upper) throw new Error('fixture program needs a routine');
    const db = testDb();

    await page.goto(`/trainer/session/${sessionId}`);
    await pickProgram(page, libraryProgram.name);
    await page.getByRole('button', { name: `Start ${upper.name}` }).click();
    await expect(page.getByRole('heading', { level: 2, name: upper.name })).toBeVisible();

    await page.getByRole('button', { name: 'Change routine' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Remove routine' }).click();

    // Back to a plain, empty log; nothing left on the server either.
    await expect(page.getByText('Workout Log')).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: upper.name })).toHaveCount(0);
    // No exercise cards left (the floating "+" only shows when there are some),
    // and the Start-routine card is offered again.
    await expect(page.getByRole('button', { name: 'Add exercise' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Start / })).toBeVisible();
    await expect
      .poll(
        async () => (await db.sessionInstance.findUnique({ where: { id: sessionId } }))?.routineId,
      )
      .toBeNull();
    expect(await db.workoutLog.count({ where: { sessionInstanceId: sessionId } })).toBe(0);
  });

  test('routine card holds its place while loading and loads the library in one request', async ({
    trainerPage: page,
    sessionId,
    clientWithoutProgram: _,
    libraryProgram,
  }) => {
    const [upper] = libraryProgram.routines;
    if (!upper) throw new Error('fixture program needs a routine');

    // Slow the routine requests down like a phone on gym wifi, and record them.
    const routineGets: string[] = [];
    await page.route('**/api/routine-programs**', async (route) => {
      if (route.request().method() === 'GET') {
        routineGets.push(
          new URL(route.request().url()).pathname + new URL(route.request().url()).search,
        );
        await new Promise((r) => setTimeout(r, 1_500));
      }
      await route.continue();
    });

    await page.goto(`/trainer/session/${sessionId}`);

    // Placeholder first, in the card's spot, then the real card replaces it.
    const skeleton = page.getByLabel('Loading routines');
    await expect(skeleton).toBeVisible();
    await page.screenshot({ path: 'test-results/routine-card-loading.png' });
    await pickProgram(page, libraryProgram.name);
    await expect(skeleton).toHaveCount(0);
    await page.screenshot({ path: 'test-results/routine-card-loaded.png' });

    // Client program, then the whole library in one go: no per-program fetches.
    expect(
      routineGets.filter((u) => /^\/api\/routine-programs\/(?!clients\/)[^/?]+$/.test(u)),
    ).toEqual([]);
    expect(
      routineGets.filter((u) => u.startsWith('/api/routine-programs?detail=true')),
    ).toHaveLength(1);

    // The "Change" sheet is loaded when the routine starts, not when it opens.
    await page.unroute('**/api/routine-programs**');
    await page.getByRole('button', { name: `Start ${upper.name}` }).click();
    await expect(page.getByRole('heading', { level: 2, name: upper.name })).toBeVisible();
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Change routine' }).click();
    const sheet = page.getByRole('dialog');
    await expect(
      sheet.getByRole('button', { name: /^Switch to |^Current routine/ }).first(),
    ).toBeVisible({
      timeout: 1_000,
    });
    await expect(sheet.getByText('Loading routines…')).toHaveCount(0);
  });
});
