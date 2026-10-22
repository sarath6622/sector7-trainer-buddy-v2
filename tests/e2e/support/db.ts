import { PrismaClient } from '@prisma/client';
import { DATABASE_URL, assertLocalDatabase } from './env';

let client: PrismaClient | null = null;

/** Prisma client for test setup/teardown — local DB only (guarded). */
export function testDb(): PrismaClient {
  if (!client) {
    assertLocalDatabase(DATABASE_URL);
    client = new PrismaClient({ datasourceUrl: DATABASE_URL });
  }
  return client;
}

export async function disconnectTestDb(): Promise<void> {
  if (client) {
    await client.$disconnect();
    client = null;
  }
}

/** Trainer + client profiles for the configured accounts, and their shared branch. */
export async function loadPair(trainerEmail: string, clientEmail: string) {
  const db = testDb();
  const trainer = await db.trainerProfile.findFirst({
    where: { user: { email: trainerEmail } },
    select: { id: true, branchId: true, userId: true },
  });
  const client = await db.clientProfile.findFirst({
    where: { user: { email: clientEmail } },
    select: { id: true, branchId: true, userId: true },
  });
  if (!trainer || !client) {
    throw new Error(`Seed accounts missing: trainer ${trainerEmail} / client ${clientEmail}`);
  }
  const pkg = await db.ptPackage.findFirst({
    where: { trainerProfileId: trainer.id, clientProfileId: client.id, isActive: true },
    select: { id: true },
  });
  if (!pkg) {
    throw new Error(`${trainerEmail} has no active PT package with ${clientEmail}`);
  }
  return { trainer, client, branchId: client.branchId };
}

/** Delete a test session and everything hanging off it. */
export async function deleteSession(sessionId: string): Promise<void> {
  const db = testDb();
  await db.workoutSet.deleteMany({ where: { workoutLog: { sessionInstanceId: sessionId } } });
  await db.workoutLog.deleteMany({ where: { sessionInstanceId: sessionId } });
  await db.restTimer.deleteMany({ where: { sessionInstanceId: sessionId } });
  await db.rescheduleRequest.deleteMany({ where: { sessionInstanceId: sessionId } });
  await db.trainerReassignment.deleteMany({ where: { sessionInstanceId: sessionId } });
  await db.sessionInstance.deleteMany({ where: { id: sessionId } });
}
