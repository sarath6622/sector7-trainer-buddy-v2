/**
 * Seeds dev@gmail.com (trainer) and ammu@gmail.com (client) with their exact
 * local DB IDs, packages, sessions, workout logs, and progress entries into Neon.
 *
 * Run against Neon: npx tsx prisma/seed-dev-ammu.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding dev@gmail.com and ammu@gmail.com...\n');

  // ─── 1. Dev user + trainer profile ──────────────────────────────────────────
  await prisma.user.upsert({
    where: { id: 'cmn9x9qs8001tw1foe8hwpdxx' },
    update: {},
    create: {
      id: 'cmn9x9qs8001tw1foe8hwpdxx',
      branchId: 'branch-main',
      email: 'dev@gmail.com',
      phone: '8129343454',
      passwordHash: '$2b$12$3lkDyFgBm4QmY8oUwXzeUunAghInHIAnE..b3SOfVIkagFIRX8ZpS',
      firstName: 'Devanand ',
      lastName: 'Trainer',
      roles: ['TRAINER', 'CROSSFIT_TRAINER'],
      isActive: true,
      createdAt: new Date('2026-03-28T06:01:21.366Z'),
      updatedAt: new Date('2026-03-28T06:01:21.366Z'),
    },
  });

  await prisma.trainerProfile.upsert({
    where: { id: 'cmn9x9qsn001vw1folh20hqt1' },
    update: {},
    create: {
      id: 'cmn9x9qsn001vw1folh20hqt1',
      userId: 'cmn9x9qs8001tw1foe8hwpdxx',
      branchId: 'branch-main',
      specialties: ['Strength Training'],
      certifications: ['ACE'],
      bio: 'Trainer',
      workingHoursStart: '06:00',
      workingHoursEnd: '22:00',
      workingDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'],
      createdAt: new Date('2026-03-28T06:01:21.384Z'),
      updatedAt: new Date('2026-03-28T06:01:21.384Z'),
    },
  });

  console.log('✓ dev@gmail.com (Devanand Trainer) created');

  // ─── 2. Ammu user + client profile ─────────────────────────────────────────
  await prisma.user.upsert({
    where: { id: 'cmn9xezp4001zw1fos9c6wmbf' },
    update: {},
    create: {
      id: 'cmn9xezp4001zw1fos9c6wmbf',
      branchId: 'branch-main',
      email: 'ammu@gmail.com',
      phone: '8234345678',
      passwordHash: '$2b$12$jH3SKnxVxrl3miHbDHt3zeSIckQeXpMHpRAZ7zhgCeO3c2nm/uWMi',
      firstName: 'Ammu',
      lastName: 'Client',
      roles: ['CLIENT'],
      isActive: true,
      createdAt: new Date('2026-03-28T06:05:26.199Z'),
      updatedAt: new Date('2026-03-28T06:05:26.199Z'),
    },
  });

  await prisma.clientProfile.upsert({
    where: { id: 'cmn9xezpl0021w1fo0yp7gkp1' },
    update: {},
    create: {
      id: 'cmn9xezpl0021w1fo0yp7gkp1',
      userId: 'cmn9xezp4001zw1fos9c6wmbf',
      branchId: 'branch-main',
      emergencyContactName: 'Dev',
      emergencyContactPhone: '8765456543',
      height: 166,
      intakeWeight: 60,
      intakeBodyFat: 23,
      paymentStatus: 'PENDING',
      createdAt: new Date('2026-03-28T06:05:26.216Z'),
      updatedAt: new Date('2026-03-28T06:05:26.216Z'),
    },
  });

  console.log('✓ ammu@gmail.com (Ammu Client) created');

  // ─── 3. PT Packages ─────────────────────────────────────────────────────────
  // Inactive package
  await prisma.ptPackage.upsert({
    where: { id: 'cmn9xgn750025w1fo1ix0uurp' },
    update: {},
    create: {
      id: 'cmn9xgn750025w1fo1ix0uurp',
      branchId: 'branch-main',
      clientProfileId: 'cmn9xezpl0021w1fo0yp7gkp1',
      trainerProfileId: 'cmn9x9qsn001vw1folh20hqt1',
      sessionsPerMonth: 8,
      isActive: false,
      startDate: new Date('2026-03-28T00:00:00.000Z'),
      endDate: new Date('2026-03-28T06:11:22.750Z'),
      createdAt: new Date('2026-03-28T06:06:43.312Z'),
      updatedAt: new Date('2026-03-28T06:11:22.751Z'),
    },
  });

  // Active package
  await prisma.ptPackage.upsert({
    where: { id: 'cmn9xmt0d002bw1foxfsn06ko' },
    update: {},
    create: {
      id: 'cmn9xmt0d002bw1foxfsn06ko',
      branchId: 'branch-main',
      clientProfileId: 'cmn9xezpl0021w1fo0yp7gkp1',
      trainerProfileId: 'cmn9x9qsn001vw1folh20hqt1',
      sessionsPerMonth: 8,
      isActive: true,
      startDate: new Date('2026-03-28T00:00:00.000Z'),
      createdAt: new Date('2026-03-28T06:11:30.781Z'),
      updatedAt: new Date('2026-03-28T06:11:30.781Z'),
    },
  });

  console.log('✓ PT packages created');

  // ─── 4. Sessions ────────────────────────────────────────────────────────────
  const sessions = [
    {
      id: 'cmnboyx4d002nw1fo3nao3159',
      scheduledDate: new Date('2026-03-29T00:00:00.000Z'),
      scheduledTime: '08:00',
      status: 'CANCELLED' as const,
      createdAt: new Date('2026-03-29T11:44:31.789Z'),
      updatedAt: new Date('2026-03-29T11:45:59.877Z'),
    },
    {
      id: 'cmnbp67ft0035w1fo2hgp3lyw',
      scheduledDate: new Date('2026-03-29T00:00:00.000Z'),
      scheduledTime: '07:00',
      status: 'COMPLETED' as const,
      startedAt: new Date('2026-03-29T11:52:10.743Z'),
      endedAt: new Date('2026-03-29T12:55:18.590Z'),
      actualDurationMin: 63,
      startedByUserId: 'cmn9x9qs8001tw1foe8hwpdxx',
      endedByUserId: 'cmn9x9qs8001tw1foe8hwpdxx',
      createdAt: new Date('2026-03-29T11:50:11.753Z'),
      updatedAt: new Date('2026-03-29T12:55:18.591Z'),
    },
    {
      id: 'cmnboyx57002rw1fo2yi4d1ax',
      scheduledDate: new Date('2026-03-30T00:00:00.000Z'),
      scheduledTime: '08:00',
      status: 'CANCELLED' as const,
      createdAt: new Date('2026-03-29T11:44:31.820Z'),
      updatedAt: new Date('2026-03-29T11:46:02.455Z'),
    },
    {
      id: 'cmnbp67h30039w1fowxbvkml1',
      scheduledDate: new Date('2026-03-30T00:00:00.000Z'),
      scheduledTime: '07:00',
      status: 'SCHEDULED' as const,
      createdAt: new Date('2026-03-29T11:50:11.800Z'),
      updatedAt: new Date('2026-03-29T11:50:11.800Z'),
    },
    {
      id: 'cmnbp67hb003dw1folvnpsv0r',
      scheduledDate: new Date('2026-03-31T00:00:00.000Z'),
      scheduledTime: '07:00',
      status: 'SCHEDULED' as const,
      createdAt: new Date('2026-03-29T11:50:11.808Z'),
      updatedAt: new Date('2026-03-29T11:50:11.808Z'),
    },
    {
      id: 'cmnboyx5g002vw1fon6vs6cb1',
      scheduledDate: new Date('2026-03-31T00:00:00.000Z'),
      scheduledTime: '08:00',
      status: 'CANCELLED' as const,
      createdAt: new Date('2026-03-29T11:44:31.829Z'),
      updatedAt: new Date('2026-03-29T11:46:04.556Z'),
    },
    {
      id: 'cmnhl1c4s0001co86de1nyjom',
      scheduledDate: new Date('2026-04-02T00:00:00.000Z'),
      scheduledTime: '20:30',
      status: 'COMPLETED' as const,
      startedAt: new Date('2026-04-02T14:41:30.181Z'),
      endedAt: new Date('2026-04-02T15:41:30.181Z'),
      actualDurationMin: 60,
      startedByUserId: 'cmn9x9qs8001tw1foe8hwpdxx',
      createdAt: new Date('2026-04-02T14:41:03.148Z'),
      updatedAt: new Date('2026-04-02T14:41:30.182Z'),
    },
    {
      id: 'cmnlaw2mo0004is5dewa9n5ea',
      scheduledDate: new Date('2026-04-05T00:00:00.000Z'),
      scheduledTime: '11:00',
      status: 'COMPLETED' as const,
      startedAt: new Date('2026-04-05T05:08:23.433Z'),
      endedAt: new Date('2026-04-05T19:02:18.297Z'),
      actualDurationMin: 834,
      startedByUserId: 'cmn9x9qs8001tw1foe8hwpdxx',
      endedByUserId: 'cmn9x9qs8001tw1foe8hwpdxx',
      createdAt: new Date('2026-04-05T05:08:06.096Z'),
      updatedAt: new Date('2026-04-05T19:02:18.298Z'),
    },
    {
      id: 'cmnm4og2m0007j2rlog6j77iq',
      scheduledDate: new Date('2026-04-06T00:00:00.000Z'),
      scheduledTime: '05:30',
      status: 'IN_PROGRESS' as const,
      startedAt: new Date('2026-04-05T19:02:27.831Z'),
      startedByUserId: 'cmn9x9qs8001tw1foe8hwpdxx',
      createdAt: new Date('2026-04-05T19:01:58.750Z'),
      updatedAt: new Date('2026-04-05T19:02:27.832Z'),
    },
  ];

  for (const s of sessions) {
    await prisma.sessionInstance.upsert({
      where: { id: s.id },
      update: {},
      create: {
        id: s.id,
        branchId: 'branch-main',
        clientProfileId: 'cmn9xezpl0021w1fo0yp7gkp1',
        trainerProfileId: 'cmn9x9qsn001vw1folh20hqt1',
        scheduledDate: s.scheduledDate,
        scheduledTime: s.scheduledTime,
        durationMin: 60,
        status: s.status,
        startedAt: s.startedAt ?? null,
        endedAt: s.endedAt ?? null,
        actualDurationMin: s.actualDurationMin ?? null,
        startedByUserId: s.startedByUserId ?? null,
        endedByUserId: s.endedByUserId ?? null,
        isCarryForward: false,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      },
    });
  }

  console.log(`✓ ${sessions.length} sessions created`);

  // ─── 5. Workout logs + sets ─────────────────────────────────────────────────
  const workoutData = [
    // Session: cmnbp67ft0035w1fo2hgp3lyw (Mar 29 completed)
    {
      logId: 'cmnbpeau4003uw1foys4gq7mo',
      sessionId: 'cmnbp67ft0035w1fo2hgp3lyw',
      exerciseId: 'ex-bench-press',
      orderIndex: 0,
      sets: [{ id: 'cmnbpeau4003vw1fopf56libh', setNumber: 1, reps: 10, weightKg: 10, rpe: 10 }],
    },
    {
      logId: 'cmnbpeaw4003xw1fouohklcm2',
      sessionId: 'cmnbp67ft0035w1fo2hgp3lyw',
      exerciseId: 'ex-squat',
      orderIndex: 1,
      sets: [{ id: 'cmnbpeaw4003yw1fon8aunark', setNumber: 1, reps: 10, weightKg: 10, rpe: 10 }],
    },
    // Session: cmnlaw2mo0004is5dewa9n5ea (Apr 5 completed)
    {
      logId: 'cmnlc8i9u000ppxwiid1jyh8a',
      sessionId: 'cmnlaw2mo0004is5dewa9n5ea',
      exerciseId: 'ex-squat',
      orderIndex: 0,
      sets: [
        { id: 'cmnlc8i9u000qpxwi1r8qi3b1', setNumber: 1, reps: 10, weightKg: 100, rpe: 8 },
        { id: 'cmnlc8i9u000rpxwikogo3ruz', setNumber: 2, reps: 10, weightKg: 101, rpe: 8 },
      ],
    },
    {
      logId: 'cmnlc8ia2000tpxwironvu7fk',
      sessionId: 'cmnlaw2mo0004is5dewa9n5ea',
      exerciseId: 'ex-bench-press',
      orderIndex: 1,
      sets: [{ id: 'cmnlc8ia2000upxwik7tc7tgp', setNumber: 1, reps: 2, weightKg: 100, rpe: 10 }],
    },
    {
      logId: 'cmnlc8ia9000wpxwif9vp2ezo',
      sessionId: 'cmnlaw2mo0004is5dewa9n5ea',
      exerciseId: 'ex-deadlift',
      orderIndex: 2,
      sets: [{ id: 'cmnlc8ia9000xpxwi7w1tsosx', setNumber: 1, reps: 10, weightKg: 100, rpe: 10 }],
    },
    {
      logId: 'cmnlc8iad000zpxwia1fe34jx',
      sessionId: 'cmnlaw2mo0004is5dewa9n5ea',
      exerciseId: 'ex-curl',
      orderIndex: 3,
      sets: [{ id: 'cmnlc8iad0010pxwinhkv5alp', setNumber: 1, reps: 10, weightKg: 40, rpe: 5 }],
    },
    // Session: cmnm4og2m0007j2rlog6j77iq (Apr 6 in-progress)
    {
      logId: 'cmnm4vrju0002m7hjh7chfwcf',
      sessionId: 'cmnm4og2m0007j2rlog6j77iq',
      exerciseId: 'ex-bench-press',
      orderIndex: 0,
      sets: [
        { id: 'cmnm4vrju0003m7hj8byfv9bu', setNumber: 1, reps: 10, weightKg: 130, rpe: 8 },
        { id: 'cmnm4vrju0004m7hjssxawrv6', setNumber: 2, reps: 10, weightKg: 140, rpe: null },
      ],
    },
  ];

  let logCount = 0;
  for (const w of workoutData) {
    await prisma.workoutLog.upsert({
      where: { id: w.logId },
      update: {},
      create: {
        id: w.logId,
        sessionInstanceId: w.sessionId,
        exerciseId: w.exerciseId,
        orderIndex: w.orderIndex,
      },
    });

    for (const set of w.sets) {
      await prisma.workoutSet.upsert({
        where: { id: set.id },
        update: {},
        create: {
          id: set.id,
          workoutLogId: w.logId,
          setNumber: set.setNumber,
          reps: set.reps ?? null,
          weightKg: set.weightKg ?? null,
          rpe: set.rpe ?? null,
        },
      });
    }
    logCount++;
  }

  console.log(`✓ ${logCount} workout logs with sets created`);

  // ─── 6. Progress entries ────────────────────────────────────────────────────
  const progressEntries = [
    {
      id: 'cmnbqq74e0042w1fovr8ttpzv',
      recordedAt: new Date('2026-03-29T12:33:44.078Z'),
      recordedByUserId: 'cmn9x9qs8001tw1foe8hwpdxx',
      weightKg: 65,
    },
    {
      id: 'cmnbqr52s0046w1fo0fvuf4ho',
      recordedAt: new Date('2026-03-29T12:34:28.084Z'),
      recordedByUserId: 'cmn9x9qs8001tw1foe8hwpdxx',
      bodyFatPercent: 24,
    },
    {
      id: 'cmnhmcxt4000180aa2y4at20e',
      recordedAt: new Date('2026-04-02T15:18:04.071Z'),
      recordedByUserId: 'cmn9xezp4001zw1fos9c6wmbf',
      weightKg: 56,
    },
  ];

  for (const pe of progressEntries) {
    await prisma.progressEntry.upsert({
      where: { id: pe.id },
      update: {},
      create: {
        id: pe.id,
        clientProfileId: 'cmn9xezpl0021w1fo0yp7gkp1',
        recordedAt: pe.recordedAt,
        recordedByUserId: pe.recordedByUserId,
        weightKg: pe.weightKg ?? null,
        bodyFatPercent: pe.bodyFatPercent ?? null,
        photoUrls: [],
        createdAt: pe.recordedAt,
        updatedAt: pe.recordedAt,
      },
    });
  }

  console.log(`✓ ${progressEntries.length} progress entries created`);

  console.log('\n✅ Done! dev@gmail.com and ammu@gmail.com seeded to Neon with all data.');
  console.log('   Passwords: password123 (same hashes as local DB)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
