import { test as base, type Browser, type Page } from '@playwright/test';
import { USERS, storageStateFor, type Role } from './env';
import { deleteSession, disconnectTestDb, loadPair, testDb } from './db';

/**
 * Shared fixtures. Every piece of data a test creates is removed afterwards,
 * and anything it has to move out of the way (the client's existing program)
 * is put back — so the suite can run repeatedly against your local data.
 */

/** A signed-in page for a role, with the splash and the dev overlay out of the way. */
async function pageFor(browser: Browser, role: Role): Promise<Page> {
  const context = await browser.newContext({ storageState: storageStateFor(role) });
  await context.addInitScript(() => {
    try {
      // Boot splash shows once per 24h and covers the page (src/lib/splash.ts).
      localStorage.setItem('s7-splash-last-shown', String(Date.now()));
    } catch {
      // storage unavailable — the splash just shows
    }
    const hideOverlay = () => {
      const style = document.createElement('style');
      style.textContent = 'nextjs-portal{display:none!important}';
      document.head.appendChild(style);
    };
    if (document.head) hideOverlay();
    else document.addEventListener('DOMContentLoaded', hideOverlay);
  });
  return context.newPage();
}

export interface TestProgram {
  id: string;
  name: string;
  routines: { id: string; name: string; exerciseIds: string[] }[];
}

interface Fixtures {
  trainerPage: Page;
  clientPage: Page;
  adminPage: Page;
  pair: Awaited<ReturnType<typeof loadPair>>;
  /** A SCHEDULED session today for the trainer + client. Opening it as the trainer starts it. */
  sessionId: string;
  /** The client's active program(s) are set aside for the test and restored after. */
  clientWithoutProgram: void;
  /** A library program owned by this test (non-compound lifts, so no PR posts fire). */
  libraryProgram: TestProgram;
}

export const test = base.extend<Fixtures>({
  trainerPage: async ({ browser }, use) => {
    const page = await pageFor(browser, 'trainer');
    await use(page);
    await page.context().close();
  },
  clientPage: async ({ browser }, use) => {
    const page = await pageFor(browser, 'client');
    await use(page);
    await page.context().close();
  },
  adminPage: async ({ browser }, use) => {
    const page = await pageFor(browser, 'admin');
    await use(page);
    await page.context().close();
  },

  pair: async ({}, use) => {
    await use(await loadPair(USERS.trainer, USERS.client));
  },

  sessionId: async ({ pair }, use) => {
    const db = testDb();
    const startedAt = new Date();
    const session = await db.sessionInstance.create({
      data: {
        branchId: pair.branchId,
        clientProfileId: pair.client.id,
        trainerProfileId: pair.trainer.id,
        scheduledDate: new Date(new Date().toISOString().slice(0, 10)),
        scheduledTime: '23:30',
        durationMin: 60,
        status: 'SCHEDULED',
        notes: 'e2e test session (auto-deleted)',
      },
      select: { id: true },
    });

    await use(session.id);

    await deleteSession(session.id);
    // Saving sets can award badges / auto-post PRs for the client.
    await db.userBadge.deleteMany({
      where: { clientProfileId: pair.client.id, awardedAt: { gte: startedAt } },
    });
    await db.communityPost.deleteMany({
      where: { clientProfileId: pair.client.id, createdAt: { gte: startedAt } },
    });
  },

  clientWithoutProgram: async ({ pair }, use) => {
    const db = testDb();
    const startedAt = new Date();
    const parked = await db.routineProgram.findMany({
      where: { clientProfileId: pair.client.id, isActive: true },
      select: { id: true },
    });
    const parkedIds = parked.map((p) => p.id);
    if (parkedIds.length > 0) {
      await db.routineProgram.updateMany({
        where: { id: { in: parkedIds } },
        data: { isActive: false },
      });
    }

    await use();

    // Copies made during the test go; the parked program comes back.
    await db.routineProgram.deleteMany({
      where: { clientProfileId: pair.client.id, createdAt: { gte: startedAt } },
    });
    if (parkedIds.length > 0) {
      await db.routineProgram.updateMany({
        where: { id: { in: parkedIds } },
        data: { isActive: true },
      });
    }
  },

  libraryProgram: async ({ pair }, use) => {
    const db = testDb();
    const stamp = Date.now().toString(36);
    const routines = [
      { name: `E2E Upper ${stamp}`, exerciseIds: ['ex-pec-deck-fly', 'ex-lateral-raise'] },
      { name: `E2E Arms ${stamp}`, exerciseIds: ['ex-curl', 'ex-tricep-pushdown'] },
    ];
    const program = await db.routineProgram.create({
      data: {
        branchId: pair.branchId,
        name: `E2E Program ${stamp}`,
        createdByUserId: pair.trainer.userId,
        routines: {
          create: routines.map((r, rIdx) => ({
            name: r.name,
            orderIndex: rIdx,
            exercises: {
              create: r.exerciseIds.map((exerciseId, eIdx) => ({
                exerciseId,
                orderIndex: eIdx,
                restSec: 60,
                sets: {
                  create: [1, 2, 3].map((setNumber) => ({
                    setNumber,
                    targetRepsMin: 12,
                    targetRepsMax: 15,
                  })),
                },
              })),
            },
          })),
        },
      },
      select: {
        id: true,
        name: true,
        routines: { select: { id: true, name: true }, orderBy: { orderIndex: 'asc' } },
      },
    });

    await use({
      id: program.id,
      name: program.name,
      routines: program.routines.map((r, i) => ({
        id: r.id,
        name: r.name,
        exerciseIds: routines[i]?.exerciseIds ?? [],
      })),
    });

    await db.routineProgram.deleteMany({ where: { sourceProgramId: program.id } });
    await db.routineProgram.deleteMany({ where: { id: program.id } });
  },
});

test.afterAll(async () => {
  await disconnectTestDb();
});

export { expect } from '@playwright/test';
