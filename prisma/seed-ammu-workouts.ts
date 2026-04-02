/**
 * Seed historical workout sessions + progressive exercise logs for Ammu (demo client).
 * Creates ~24 past sessions (Jan–Mar 2026, 3x/week) with realistic progressive overload.
 * Safe to run multiple times — skips already-existing sessions/logs.
 *
 * Run: npx tsx prisma/seed-ammu-workouts.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const CLIENT_ID = 'cmn9xezpl0021w1fo0yp7gkp1'; // Ammu
const BRANCH_ID = 'branch-main';

// Helper — IST midnight → UTC 18:30 previous day (matches how sessions are stored)
function d(dateStr: string, timeStr = '07:00') {
  const [h, m] = timeStr.split(':').map(Number);
  const base = new Date(dateStr + 'T18:30:00.000Z'); // midnight IST
  return new Date(base.getTime() + (h! * 60 + m!) * 60 * 1000);
}

type SetInput = [number | null, number | null, number | null, number]; // reps, kg, sec, rpe

// ─── Historical sessions with progressive overload ────────────────────────────
// Ammu: Female, 30, weight loss + toning. Trains 3x/week.
// Focus: compound lower body, upper body push/pull, cardio
//
// Progression strategy (12 weeks Jan 6 → Mar 28):
//   Bench Press:      7.5 → 15 kg
//   Lat Pulldown:     22  → 32.5 kg
//   Leg Press:        40  → 65 kg
//   RDL:              20  → 40 kg
//   Push-up:           6  → 15 reps
//   Treadmill:        900 → 1500 sec (15 → 25 min)

const SESSIONS: {
  date: string;
  time: string;
  durationMin: number;
  exercises: { exId: string; sets: SetInput[] }[];
}[] = [
  // ── Week 1 (Jan 6–10) — Onboarding, light weights ────────────────────────
  {
    date: '2026-01-07',
    time: '07:00',
    durationMin: 60,
    exercises: [
      {
        exId: 'ex-bench-press',
        sets: [
          [10, 7.5, null, 6],
          [10, 7.5, null, 6],
          [8, 7.5, null, 7],
        ],
      },
      {
        exId: 'ex-lat-pulldown',
        sets: [
          [12, 22, null, 6],
          [12, 22, null, 6],
          [10, 22, null, 7],
        ],
      },
      {
        exId: 'ex-leg-press',
        sets: [
          [15, 40, null, 6],
          [15, 40, null, 6],
          [12, 40, null, 7],
        ],
      },
      { exId: 'ex-treadmill', sets: [[null, null, 900, 5]] },
    ],
  },
  {
    date: '2026-01-09',
    time: '07:00',
    durationMin: 60,
    exercises: [
      {
        exId: 'ex-rdl',
        sets: [
          [12, 20, null, 6],
          [12, 20, null, 6],
          [10, 20, null, 7],
        ],
      },
      {
        exId: 'ex-pushup',
        sets: [
          [6, null, null, 7],
          [6, null, null, 7],
          [5, null, null, 8],
        ],
      },
      {
        exId: 'ex-db-shoulder-press',
        sets: [
          [12, 6, null, 6],
          [12, 6, null, 6],
          [10, 6, null, 7],
        ],
      },
      { exId: 'ex-cycling', sets: [[null, null, 900, 5]] },
    ],
  },
  {
    date: '2026-01-11',
    time: '07:00',
    durationMin: 60,
    exercises: [
      {
        exId: 'ex-squat',
        sets: [
          [12, 20, null, 7],
          [12, 20, null, 7],
          [10, 20, null, 7],
        ],
      },
      {
        exId: 'ex-seated-cable-row',
        sets: [
          [12, 20, null, 6],
          [12, 20, null, 6],
          [10, 22, null, 7],
        ],
      },
      {
        exId: 'ex-lunge',
        sets: [
          [10, null, null, 7],
          [10, null, null, 7],
          [8, null, null, 8],
        ],
      },
      {
        exId: 'ex-plank',
        sets: [
          [null, null, 30, 6],
          [null, null, 30, 6],
        ],
      },
    ],
  },

  // ── Week 2 (Jan 13–17) ────────────────────────────────────────────────────
  {
    date: '2026-01-13',
    time: '07:00',
    durationMin: 60,
    exercises: [
      {
        exId: 'ex-bench-press',
        sets: [
          [10, 8.75, null, 6],
          [10, 8.75, null, 7],
          [8, 8.75, null, 7],
        ],
      },
      {
        exId: 'ex-lat-pulldown',
        sets: [
          [12, 23, null, 6],
          [12, 23, null, 7],
          [10, 24, null, 7],
        ],
      },
      {
        exId: 'ex-leg-press',
        sets: [
          [15, 42.5, null, 6],
          [15, 42.5, null, 7],
          [12, 45, null, 7],
        ],
      },
      { exId: 'ex-treadmill', sets: [[null, null, 1000, 6]] },
    ],
  },
  {
    date: '2026-01-15',
    time: '07:00',
    durationMin: 60,
    exercises: [
      {
        exId: 'ex-rdl',
        sets: [
          [12, 22.5, null, 6],
          [12, 22.5, null, 7],
          [10, 22.5, null, 7],
        ],
      },
      {
        exId: 'ex-pushup',
        sets: [
          [7, null, null, 7],
          [7, null, null, 7],
          [6, null, null, 8],
        ],
      },
      {
        exId: 'ex-db-shoulder-press',
        sets: [
          [12, 7, null, 6],
          [12, 7, null, 7],
          [10, 7, null, 7],
        ],
      },
      { exId: 'ex-cycling', sets: [[null, null, 1000, 6]] },
    ],
  },
  {
    date: '2026-01-17',
    time: '07:00',
    durationMin: 60,
    exercises: [
      {
        exId: 'ex-squat',
        sets: [
          [12, 22.5, null, 7],
          [12, 22.5, null, 7],
          [10, 25, null, 8],
        ],
      },
      {
        exId: 'ex-seated-cable-row',
        sets: [
          [12, 22, null, 6],
          [12, 22, null, 7],
          [10, 24, null, 7],
        ],
      },
      {
        exId: 'ex-lunge',
        sets: [
          [12, null, null, 7],
          [12, null, null, 7],
          [10, null, null, 8],
        ],
      },
      {
        exId: 'ex-plank',
        sets: [
          [null, null, 35, 6],
          [null, null, 35, 6],
          [null, null, 30, 7],
        ],
      },
    ],
  },

  // ── Week 3 (Jan 20–24) ────────────────────────────────────────────────────
  {
    date: '2026-01-20',
    time: '07:00',
    durationMin: 60,
    exercises: [
      {
        exId: 'ex-bench-press',
        sets: [
          [10, 10, null, 7],
          [10, 10, null, 7],
          [8, 10, null, 8],
        ],
      },
      {
        exId: 'ex-lat-pulldown',
        sets: [
          [12, 25, null, 7],
          [12, 25, null, 7],
          [10, 25, null, 7],
        ],
      },
      {
        exId: 'ex-leg-press',
        sets: [
          [15, 47.5, null, 7],
          [15, 47.5, null, 7],
          [12, 50, null, 8],
        ],
      },
      { exId: 'ex-treadmill', sets: [[null, null, 1080, 6]] },
    ],
  },
  {
    date: '2026-01-22',
    time: '07:00',
    durationMin: 60,
    exercises: [
      {
        exId: 'ex-rdl',
        sets: [
          [12, 25, null, 7],
          [12, 25, null, 7],
          [10, 25, null, 7],
        ],
      },
      {
        exId: 'ex-pushup',
        sets: [
          [8, null, null, 7],
          [8, null, null, 7],
          [7, null, null, 8],
        ],
      },
      {
        exId: 'ex-db-shoulder-press',
        sets: [
          [12, 8, null, 6],
          [12, 8, null, 7],
          [10, 8, null, 7],
        ],
      },
      { exId: 'ex-cycling', sets: [[null, null, 1080, 6]] },
    ],
  },
  {
    date: '2026-01-24',
    time: '07:00',
    durationMin: 60,
    exercises: [
      {
        exId: 'ex-squat',
        sets: [
          [12, 25, null, 7],
          [12, 25, null, 7],
          [10, 27.5, null, 8],
        ],
      },
      {
        exId: 'ex-seated-cable-row',
        sets: [
          [12, 24, null, 7],
          [12, 24, null, 7],
          [10, 26, null, 7],
        ],
      },
      {
        exId: 'ex-lunge',
        sets: [
          [12, null, null, 7],
          [12, null, null, 8],
          [10, null, null, 8],
        ],
      },
      {
        exId: 'ex-plank',
        sets: [
          [null, null, 40, 6],
          [null, null, 40, 6],
          [null, null, 35, 7],
        ],
      },
    ],
  },

  // ── Week 4 (Jan 27–31) ────────────────────────────────────────────────────
  {
    date: '2026-01-27',
    time: '07:00',
    durationMin: 60,
    exercises: [
      {
        exId: 'ex-bench-press',
        sets: [
          [10, 11.25, null, 7],
          [10, 11.25, null, 7],
          [8, 11.25, null, 8],
        ],
      },
      {
        exId: 'ex-lat-pulldown',
        sets: [
          [12, 26, null, 7],
          [12, 26, null, 7],
          [10, 27, null, 8],
        ],
      },
      {
        exId: 'ex-leg-press',
        sets: [
          [15, 50, null, 7],
          [12, 52.5, null, 7],
          [12, 52.5, null, 8],
        ],
      },
      { exId: 'ex-treadmill', sets: [[null, null, 1200, 6]] },
    ],
  },
  {
    date: '2026-01-29',
    time: '07:00',
    durationMin: 60,
    exercises: [
      {
        exId: 'ex-rdl',
        sets: [
          [12, 27.5, null, 7],
          [12, 27.5, null, 7],
          [10, 30, null, 8],
        ],
      },
      {
        exId: 'ex-pushup',
        sets: [
          [9, null, null, 7],
          [9, null, null, 7],
          [8, null, null, 8],
        ],
      },
      {
        exId: 'ex-db-shoulder-press',
        sets: [
          [12, 8, null, 7],
          [12, 8, null, 7],
          [10, 9, null, 8],
        ],
      },
      { exId: 'ex-cycling', sets: [[null, null, 1200, 6]] },
    ],
  },

  // ── Week 5 (Feb 3–7) — Second month, weights ramp up ─────────────────────
  {
    date: '2026-02-03',
    time: '07:00',
    durationMin: 60,
    exercises: [
      {
        exId: 'ex-bench-press',
        sets: [
          [10, 12.5, null, 7],
          [10, 12.5, null, 7],
          [8, 12.5, null, 8],
        ],
      },
      {
        exId: 'ex-lat-pulldown',
        sets: [
          [12, 27, null, 7],
          [12, 27, null, 7],
          [10, 28, null, 8],
        ],
      },
      {
        exId: 'ex-leg-press',
        sets: [
          [15, 52.5, null, 7],
          [12, 55, null, 7],
          [12, 55, null, 8],
        ],
      },
      { exId: 'ex-treadmill', sets: [[null, null, 1200, 6]] },
    ],
  },
  {
    date: '2026-02-05',
    time: '07:00',
    durationMin: 60,
    exercises: [
      {
        exId: 'ex-rdl',
        sets: [
          [12, 30, null, 7],
          [12, 30, null, 7],
          [10, 32.5, null, 8],
        ],
      },
      {
        exId: 'ex-pushup',
        sets: [
          [10, null, null, 7],
          [10, null, null, 7],
          [9, null, null, 8],
        ],
      },
      {
        exId: 'ex-db-shoulder-press',
        sets: [
          [12, 9, null, 7],
          [12, 9, null, 7],
          [10, 10, null, 8],
        ],
      },
      { exId: 'ex-cycling', sets: [[null, null, 1200, 6]] },
    ],
  },
  {
    date: '2026-02-07',
    time: '07:00',
    durationMin: 60,
    exercises: [
      {
        exId: 'ex-squat',
        sets: [
          [12, 27.5, null, 7],
          [12, 27.5, null, 7],
          [10, 30, null, 8],
        ],
      },
      {
        exId: 'ex-seated-cable-row',
        sets: [
          [12, 26, null, 7],
          [12, 26, null, 7],
          [10, 28, null, 8],
        ],
      },
      {
        exId: 'ex-lunge',
        sets: [
          [12, null, null, 7],
          [12, null, null, 8],
          [12, null, null, 8],
        ],
      },
      {
        exId: 'ex-plank',
        sets: [
          [null, null, 45, 6],
          [null, null, 45, 6],
          [null, null, 40, 7],
        ],
      },
    ],
  },

  // ── Week 6 (Feb 10–14) ────────────────────────────────────────────────────
  {
    date: '2026-02-10',
    time: '07:00',
    durationMin: 60,
    exercises: [
      {
        exId: 'ex-bench-press',
        sets: [
          [10, 12.5, null, 7],
          [10, 12.5, null, 8],
          [8, 13.75, null, 8],
        ],
      },
      {
        exId: 'ex-lat-pulldown',
        sets: [
          [12, 28, null, 7],
          [12, 28, null, 7],
          [10, 29, null, 8],
        ],
      },
      {
        exId: 'ex-leg-press',
        sets: [
          [12, 55, null, 7],
          [12, 57.5, null, 7],
          [12, 57.5, null, 8],
        ],
      },
      { exId: 'ex-treadmill', sets: [[null, null, 1320, 7]] },
    ],
  },
  {
    date: '2026-02-12',
    time: '07:00',
    durationMin: 60,
    exercises: [
      {
        exId: 'ex-rdl',
        sets: [
          [12, 32.5, null, 7],
          [12, 32.5, null, 7],
          [10, 35, null, 8],
        ],
      },
      {
        exId: 'ex-pushup',
        sets: [
          [11, null, null, 7],
          [11, null, null, 7],
          [10, null, null, 8],
        ],
      },
      {
        exId: 'ex-db-shoulder-press',
        sets: [
          [12, 10, null, 7],
          [12, 10, null, 7],
          [10, 10, null, 8],
        ],
      },
      { exId: 'ex-cycling', sets: [[null, null, 1320, 7]] },
    ],
  },
  {
    date: '2026-02-14',
    time: '07:00',
    durationMin: 60,
    exercises: [
      {
        exId: 'ex-squat',
        sets: [
          [12, 30, null, 7],
          [12, 30, null, 7],
          [10, 32.5, null, 8],
        ],
      },
      {
        exId: 'ex-seated-cable-row',
        sets: [
          [12, 28, null, 7],
          [12, 28, null, 7],
          [10, 30, null, 8],
        ],
      },
      {
        exId: 'ex-lunge',
        sets: [
          [12, null, null, 7],
          [12, null, null, 8],
          [12, null, null, 8],
        ],
      },
      {
        exId: 'ex-plank',
        sets: [
          [null, null, 50, 6],
          [null, null, 50, 6],
          [null, null, 45, 7],
        ],
      },
    ],
  },

  // ── Week 7 (Feb 17–21) ────────────────────────────────────────────────────
  {
    date: '2026-02-17',
    time: '07:00',
    durationMin: 60,
    exercises: [
      {
        exId: 'ex-bench-press',
        sets: [
          [10, 13.75, null, 7],
          [10, 13.75, null, 8],
          [8, 13.75, null, 8],
        ],
      },
      {
        exId: 'ex-lat-pulldown',
        sets: [
          [12, 29, null, 7],
          [12, 29, null, 7],
          [10, 30, null, 8],
        ],
      },
      {
        exId: 'ex-leg-press',
        sets: [
          [12, 57.5, null, 7],
          [12, 60, null, 7],
          [10, 60, null, 8],
        ],
      },
      { exId: 'ex-treadmill', sets: [[null, null, 1380, 7]] },
    ],
  },
  {
    date: '2026-02-19',
    time: '07:00',
    durationMin: 60,
    exercises: [
      {
        exId: 'ex-rdl',
        sets: [
          [12, 35, null, 7],
          [12, 35, null, 7],
          [10, 37.5, null, 8],
        ],
      },
      {
        exId: 'ex-pushup',
        sets: [
          [12, null, null, 7],
          [12, null, null, 7],
          [11, null, null, 8],
        ],
      },
      {
        exId: 'ex-db-shoulder-press',
        sets: [
          [12, 10, null, 7],
          [12, 10, null, 8],
          [10, 11, null, 8],
        ],
      },
      { exId: 'ex-cycling', sets: [[null, null, 1380, 7]] },
    ],
  },

  // ── Week 8–9 (Feb 24 – Mar 7) ─────────────────────────────────────────────
  {
    date: '2026-02-24',
    time: '07:00',
    durationMin: 60,
    exercises: [
      {
        exId: 'ex-bench-press',
        sets: [
          [10, 13.75, null, 7],
          [10, 13.75, null, 8],
          [8, 15, null, 8],
        ],
      },
      {
        exId: 'ex-lat-pulldown',
        sets: [
          [12, 30, null, 7],
          [12, 30, null, 7],
          [10, 31, null, 8],
        ],
      },
      {
        exId: 'ex-leg-press',
        sets: [
          [12, 60, null, 7],
          [12, 62.5, null, 7],
          [10, 62.5, null, 8],
        ],
      },
      { exId: 'ex-treadmill', sets: [[null, null, 1440, 7]] },
    ],
  },
  {
    date: '2026-03-03',
    time: '07:00',
    durationMin: 60,
    exercises: [
      {
        exId: 'ex-bench-press',
        sets: [
          [10, 15, null, 7],
          [10, 15, null, 8],
          [8, 15, null, 8],
        ],
      },
      {
        exId: 'ex-lat-pulldown',
        sets: [
          [12, 31, null, 7],
          [12, 31, null, 7],
          [10, 31, null, 8],
        ],
      },
      {
        exId: 'ex-leg-press',
        sets: [
          [12, 62.5, null, 7],
          [12, 62.5, null, 7],
          [10, 65, null, 8],
        ],
      },
      { exId: 'ex-treadmill', sets: [[null, null, 1500, 7]] },
    ],
  },

  // ── Week 10–11 (Mar 10–21) ────────────────────────────────────────────────
  {
    date: '2026-03-10',
    time: '07:00',
    durationMin: 60,
    exercises: [
      {
        exId: 'ex-rdl',
        sets: [
          [12, 37.5, null, 7],
          [12, 37.5, null, 7],
          [10, 40, null, 8],
        ],
      },
      {
        exId: 'ex-pushup',
        sets: [
          [13, null, null, 7],
          [13, null, null, 7],
          [12, null, null, 8],
        ],
      },
      {
        exId: 'ex-db-shoulder-press',
        sets: [
          [12, 11, null, 7],
          [12, 11, null, 7],
          [10, 12, null, 8],
        ],
      },
      { exId: 'ex-cycling', sets: [[null, null, 1440, 7]] },
    ],
  },
  {
    date: '2026-03-17',
    time: '07:00',
    durationMin: 60,
    exercises: [
      {
        exId: 'ex-bench-press',
        sets: [
          [10, 15, null, 7],
          [10, 15, null, 7],
          [8, 15, null, 8],
        ],
      },
      {
        exId: 'ex-lat-pulldown',
        sets: [
          [12, 32, null, 7],
          [12, 32, null, 7],
          [10, 32.5, null, 8],
        ],
      },
      {
        exId: 'ex-leg-press',
        sets: [
          [12, 63, null, 7],
          [12, 63, null, 7],
          [10, 65, null, 8],
        ],
      },
      { exId: 'ex-treadmill', sets: [[null, null, 1500, 7]] },
    ],
  },
  {
    date: '2026-03-24',
    time: '07:00',
    durationMin: 60,
    exercises: [
      {
        exId: 'ex-rdl',
        sets: [
          [12, 40, null, 7],
          [12, 40, null, 7],
          [10, 40, null, 8],
        ],
      },
      {
        exId: 'ex-pushup',
        sets: [
          [14, null, null, 7],
          [14, null, null, 7],
          [13, null, null, 8],
        ],
      },
      {
        exId: 'ex-squat',
        sets: [
          [12, 32.5, null, 7],
          [12, 32.5, null, 7],
          [10, 35, null, 8],
        ],
      },
      { exId: 'ex-cycling', sets: [[null, null, 1500, 7]] },
    ],
  },
];

async function main() {
  console.log('🏋️ Seeding Ammu historical workout sessions...');

  // Get Ammu's trainer from existing sessions
  const existingSession = await prisma.sessionInstance.findFirst({
    where: { clientProfileId: CLIENT_ID },
    select: { trainerProfileId: true },
  });
  const TRAINER_ID = existingSession?.trainerProfileId ?? null;
  console.log(`  Trainer: ${TRAINER_ID ?? 'none (will use null)'}`);

  let sessionsCreated = 0;
  let sessionsSkipped = 0;
  let logsCreated = 0;

  for (const sess of SESSIONS) {
    const scheduledDate = new Date(sess.date + 'T18:30:00.000Z'); // midnight IST

    // Check if a session already exists for this client on this date
    const existing = await prisma.sessionInstance.findFirst({
      where: {
        clientProfileId: CLIENT_ID,
        scheduledDate,
      },
    });

    let sessionId: string;

    if (existing) {
      sessionsSkipped++;
      sessionId = existing.id;
    } else {
      const startedAt = d(sess.date, sess.time);
      const endedAt = new Date(startedAt.getTime() + sess.durationMin * 60 * 1000);

      const created = await prisma.sessionInstance.create({
        data: {
          clientProfileId: CLIENT_ID,
          trainerProfileId: TRAINER_ID,
          branchId: BRANCH_ID,
          scheduledDate,
          scheduledTime: sess.time,
          durationMin: sess.durationMin,
          status: 'COMPLETED',
          startedAt,
          endedAt,
          actualDurationMin: sess.durationMin,
        },
      });
      sessionId = created.id;
      sessionsCreated++;
    }

    // Add workout logs (skip if already exist)
    for (let exIdx = 0; exIdx < sess.exercises.length; exIdx++) {
      const ex = sess.exercises[exIdx]!;
      const existingLog = await prisma.workoutLog.findFirst({
        where: { sessionInstanceId: sessionId, exerciseId: ex.exId },
      });
      if (existingLog) continue;

      await prisma.workoutLog.create({
        data: {
          sessionInstanceId: sessionId,
          exerciseId: ex.exId,
          orderIndex: exIdx,
          sets: {
            create: ex.sets.map((s, i) => ({
              setNumber: i + 1,
              reps: s[0],
              weightKg: s[1],
              durationSec: s[2],
              rpe: s[3],
            })),
          },
        },
      });
      logsCreated++;
    }
  }

  console.log(`  Sessions created: ${sessionsCreated}, Skipped (existing): ${sessionsSkipped}`);
  console.log(`  Workout logs created: ${logsCreated}`);

  // Summary
  const totalLogs = await prisma.workoutLog.count({
    where: { sessionInstance: { clientProfileId: CLIENT_ID } },
  });
  console.log(`\n✅ Done! Ammu now has ${totalLogs} total workout logs across all sessions.`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
