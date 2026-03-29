/**
 * seed-progress.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Adds rich, realistic client progression data to the seeded database:
 *  • 13 bi-weekly body-measurement snapshots per client (Jan–Mar 2026)
 *  • Per-client training programs with progressive overload on workout logs
 *
 * Run:  npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/seed-progress.ts
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ─── Helpers ────────────────────────────────────────────────────────────────

function jitter(base: number, range: number, decimals = 1): number {
  const raw = base + (Math.random() * range * 2 - range);
  return Math.round(raw * 10 ** decimals) / 10 ** decimals;
}

/** Weekly measurement snapshot dates: Jan 1 → Mar 25 2026 */
const SNAPSHOT_DATES = [
  new Date(2026, 0, 1), // Week  0 — baseline
  new Date(2026, 0, 8), // Week  1
  new Date(2026, 0, 15), // Week  2
  new Date(2026, 0, 22), // Week  3
  new Date(2026, 0, 29), // Week  4
  new Date(2026, 1, 5), // Week  5
  new Date(2026, 1, 12), // Week  6
  new Date(2026, 1, 19), // Week  7
  new Date(2026, 1, 26), // Week  8
  new Date(2026, 2, 5), // Week  9
  new Date(2026, 2, 12), // Week 10
  new Date(2026, 2, 19), // Week 11
  new Date(2026, 2, 25), // Week 12
];

// ─── Client profiles ─────────────────────────────────────────────────────────

interface ClientPlan {
  email: string;
  name: string;
  /** Baseline body metrics */
  baseline: {
    weightKg: number;
    bodyFatPercent: number;
    muscleMass: number;
    chest: number;
    waist: number;
    hips: number;
    bicepLeft: number;
    bicepRight: number;
    thighLeft: number;
    thighRight: number;
  };
  /** Per-week delta (negative = loss) */
  trend: {
    weightKg: number; // kg/week
    bodyFatPercent: number; // %/week
    muscleMass: number; // kg/week
    chest: number; // cm/week
    waist: number; // cm/week
    hips: number; // cm/week
    bicep: number; // cm/week
    thigh: number; // cm/week
  };
  /** Exercises in this client's program */
  program: {
    exerciseId: string;
    label: string; // for logging
    startWeightKg: number; // session 1 weight
    weeklyIncrKg: number; // progressive overload increment per week
    startReps: number;
    repsDelta: number; // reps change/week (can be 0 or -1)
    sets: number;
    isCardio?: boolean; // cardio: weight = speed (km/h), reps = minutes
  }[];
  trainerEmail: string;
}

const CLIENT_PLANS: ClientPlan[] = [
  // ── Karthik Iyer — Strength & Hypertrophy ──────────────────────────────
  {
    email: 'karthik@gmail.com',
    name: 'Karthik Iyer',
    baseline: {
      weightKg: 82.4,
      bodyFatPercent: 18.2,
      muscleMass: 67.4,
      chest: 99,
      waist: 84,
      hips: 96,
      bicepLeft: 36,
      bicepRight: 36.5,
      thighLeft: 56,
      thighRight: 56.5,
    },
    trend: {
      weightKg: 0.15,
      bodyFatPercent: -0.15,
      muscleMass: 0.22,
      chest: 0.15,
      waist: -0.08,
      hips: -0.04,
      bicep: 0.12,
      thigh: 0.08,
    },
    trainerEmail: 'ravi@sector7.com',
    program: [
      {
        exerciseId: 'ex-bench-press',
        label: 'Bench Press',
        startWeightKg: 62.5,
        weeklyIncrKg: 2.5,
        startReps: 5,
        repsDelta: 0,
        sets: 5,
      },
      {
        exerciseId: 'ex-squat',
        label: 'Squat',
        startWeightKg: 82.5,
        weeklyIncrKg: 2.5,
        startReps: 5,
        repsDelta: 0,
        sets: 5,
      },
      {
        exerciseId: 'ex-deadlift',
        label: 'Deadlift',
        startWeightKg: 102.5,
        weeklyIncrKg: 5,
        startReps: 5,
        repsDelta: 0,
        sets: 3,
      },
      {
        exerciseId: 'ex-ohp',
        label: 'OHP',
        startWeightKg: 47.5,
        weeklyIncrKg: 1.25,
        startReps: 5,
        repsDelta: 0,
        sets: 5,
      },
      {
        exerciseId: 'ex-row',
        label: 'Barbell Row',
        startWeightKg: 57.5,
        weeklyIncrKg: 2.5,
        startReps: 5,
        repsDelta: 0,
        sets: 5,
      },
      {
        exerciseId: 'ex-pullup',
        label: 'Pull-up',
        startWeightKg: 0,
        weeklyIncrKg: 0,
        startReps: 6,
        repsDelta: 1,
        sets: 4,
      },
    ],
  },

  // ── Ananya Sharma — Tone + Lean Muscle ─────────────────────────────────
  {
    email: 'ananya@gmail.com',
    name: 'Ananya Sharma',
    baseline: {
      weightKg: 58.2,
      bodyFatPercent: 24.1,
      muscleMass: 44.2,
      chest: 87,
      waist: 72,
      hips: 94,
      bicepLeft: 28,
      bicepRight: 28.5,
      thighLeft: 52,
      thighRight: 52.5,
    },
    trend: {
      weightKg: -0.18,
      bodyFatPercent: -0.22,
      muscleMass: 0.12,
      chest: -0.05,
      waist: -0.18,
      hips: -0.12,
      bicep: 0.06,
      thigh: -0.08,
    },
    trainerEmail: 'ravi@sector7.com',
    program: [
      {
        exerciseId: 'ex-squat',
        label: 'Goblet Squat',
        startWeightKg: 12,
        weeklyIncrKg: 1,
        startReps: 12,
        repsDelta: 0,
        sets: 3,
      },
      {
        exerciseId: 'ex-lunge',
        label: 'Walking Lunge',
        startWeightKg: 6,
        weeklyIncrKg: 0.5,
        startReps: 10,
        repsDelta: 1,
        sets: 3,
      },
      {
        exerciseId: 'ex-row',
        label: 'DB Row',
        startWeightKg: 10,
        weeklyIncrKg: 1,
        startReps: 12,
        repsDelta: 0,
        sets: 3,
      },
      {
        exerciseId: 'ex-curl',
        label: 'Bicep Curl',
        startWeightKg: 8,
        weeklyIncrKg: 0.5,
        startReps: 12,
        repsDelta: 1,
        sets: 3,
      },
      {
        exerciseId: 'ex-plank',
        label: 'Plank',
        startWeightKg: 0,
        weeklyIncrKg: 0,
        startReps: 30,
        repsDelta: 5,
        sets: 3,
        isCardio: false,
      },
      {
        exerciseId: 'ex-bench-press',
        label: 'DB Press',
        startWeightKg: 10,
        weeklyIncrKg: 1,
        startReps: 10,
        repsDelta: 0,
        sets: 3,
      },
    ],
  },

  // ── Meera Pillai — Weight Loss + Stamina ───────────────────────────────
  {
    email: 'meera@gmail.com',
    name: 'Meera Pillai',
    baseline: {
      weightKg: 65.4,
      bodyFatPercent: 28.3,
      muscleMass: 46.9,
      chest: 90,
      waist: 80,
      hips: 100,
      bicepLeft: 30,
      bicepRight: 30,
      thighLeft: 56,
      thighRight: 56,
    },
    trend: {
      weightKg: -0.35,
      bodyFatPercent: -0.32,
      muscleMass: 0.04,
      chest: -0.1,
      waist: -0.28,
      hips: -0.22,
      bicep: 0.02,
      thigh: -0.15,
    },
    trainerEmail: 'deepa@sector7.com',
    program: [
      {
        exerciseId: 'ex-treadmill',
        label: 'Treadmill Run',
        startWeightKg: 7.5,
        weeklyIncrKg: 0.1,
        startReps: 20,
        repsDelta: 2,
        sets: 1,
        isCardio: true,
      },
      {
        exerciseId: 'ex-lunge',
        label: 'Walking Lunge',
        startWeightKg: 0,
        weeklyIncrKg: 0.5,
        startReps: 10,
        repsDelta: 2,
        sets: 3,
      },
      {
        exerciseId: 'ex-plank',
        label: 'Plank',
        startWeightKg: 0,
        weeklyIncrKg: 0,
        startReps: 20,
        repsDelta: 5,
        sets: 3,
      },
      {
        exerciseId: 'ex-squat',
        label: 'Bodyweight Squat',
        startWeightKg: 0,
        weeklyIncrKg: 0,
        startReps: 15,
        repsDelta: 3,
        sets: 3,
      },
      {
        exerciseId: 'ex-curl',
        label: 'Bicep Curl',
        startWeightKg: 5,
        weeklyIncrKg: 0.5,
        startReps: 12,
        repsDelta: 0,
        sets: 2,
      },
    ],
  },

  // ── Rohit Das — Athletic Performance + Flexibility ─────────────────────
  {
    email: 'rohit@gmail.com',
    name: 'Rohit Das',
    baseline: {
      weightKg: 78.1,
      bodyFatPercent: 20.2,
      muscleMass: 62.4,
      chest: 96,
      waist: 82,
      hips: 94,
      bicepLeft: 34,
      bicepRight: 34.5,
      thighLeft: 55,
      thighRight: 55.5,
    },
    trend: {
      weightKg: 0.05,
      bodyFatPercent: -0.22,
      muscleMass: 0.18,
      chest: 0.08,
      waist: -0.12,
      hips: -0.06,
      bicep: 0.08,
      thigh: 0.06,
    },
    trainerEmail: 'deepa@sector7.com',
    program: [
      {
        exerciseId: 'ex-squat',
        label: 'Back Squat',
        startWeightKg: 75,
        weeklyIncrKg: 2.5,
        startReps: 6,
        repsDelta: 0,
        sets: 4,
      },
      {
        exerciseId: 'ex-deadlift',
        label: 'Romanian DL',
        startWeightKg: 80,
        weeklyIncrKg: 2.5,
        startReps: 8,
        repsDelta: 0,
        sets: 4,
      },
      {
        exerciseId: 'ex-ohp',
        label: 'Push Press',
        startWeightKg: 50,
        weeklyIncrKg: 1.25,
        startReps: 6,
        repsDelta: 0,
        sets: 4,
      },
      {
        exerciseId: 'ex-pullup',
        label: 'Weighted Pull-up',
        startWeightKg: 5,
        weeklyIncrKg: 1.25,
        startReps: 5,
        repsDelta: 0,
        sets: 4,
      },
      {
        exerciseId: 'ex-row',
        label: 'Pendlay Row',
        startWeightKg: 60,
        weeklyIncrKg: 2.5,
        startReps: 6,
        repsDelta: 0,
        sets: 4,
      },
      {
        exerciseId: 'ex-treadmill',
        label: 'Sprint Intervals',
        startWeightKg: 12,
        weeklyIncrKg: 0.2,
        startReps: 15,
        repsDelta: 1,
        sets: 1,
        isCardio: true,
      },
    ],
  },

  // ── Sneha Gupta — Posture Correction + Core ────────────────────────────
  {
    email: 'sneha@gmail.com',
    name: 'Sneha Gupta',
    baseline: {
      weightKg: 55.2,
      bodyFatPercent: 22.3,
      muscleMass: 42.8,
      chest: 84,
      waist: 68,
      hips: 90,
      bicepLeft: 26,
      bicepRight: 26.5,
      thighLeft: 50,
      thighRight: 50.5,
    },
    trend: {
      weightKg: -0.12,
      bodyFatPercent: -0.18,
      muscleMass: 0.1,
      chest: 0.02,
      waist: -0.12,
      hips: -0.08,
      bicep: 0.05,
      thigh: -0.04,
    },
    trainerEmail: 'arjun@sector7.com',
    program: [
      {
        exerciseId: 'ex-plank',
        label: 'Plank Hold',
        startWeightKg: 0,
        weeklyIncrKg: 0,
        startReps: 25,
        repsDelta: 7,
        sets: 4,
      },
      {
        exerciseId: 'ex-row',
        label: 'Cable Row',
        startWeightKg: 15,
        weeklyIncrKg: 1,
        startReps: 12,
        repsDelta: 0,
        sets: 3,
      },
      {
        exerciseId: 'ex-lunge',
        label: 'Reverse Lunge',
        startWeightKg: 5,
        weeklyIncrKg: 0.5,
        startReps: 10,
        repsDelta: 1,
        sets: 3,
      },
      {
        exerciseId: 'ex-curl',
        label: 'Hammer Curl',
        startWeightKg: 6,
        weeklyIncrKg: 0.5,
        startReps: 12,
        repsDelta: 0,
        sets: 3,
      },
      {
        exerciseId: 'ex-pullup',
        label: 'Assisted Pull-up',
        startWeightKg: -20,
        weeklyIncrKg: 1.5,
        startReps: 6,
        repsDelta: 1,
        sets: 3,
      },
      {
        exerciseId: 'ex-ohp',
        label: 'DB Lateral Raise',
        startWeightKg: 4,
        weeklyIncrKg: 0.5,
        startReps: 12,
        repsDelta: 0,
        sets: 3,
      },
    ],
  },

  // ── Arun Kumar — Fat Loss + Muscle Definition ──────────────────────────
  {
    email: 'arun@gmail.com',
    name: 'Arun Kumar',
    baseline: {
      weightKg: 90.5,
      bodyFatPercent: 25.4,
      muscleMass: 67.5,
      chest: 104,
      waist: 94,
      hips: 104,
      bicepLeft: 37,
      bicepRight: 37.5,
      thighLeft: 60,
      thighRight: 60.5,
    },
    trend: {
      weightKg: -0.42,
      bodyFatPercent: -0.35,
      muscleMass: 0.06,
      chest: -0.1,
      waist: -0.35,
      hips: -0.22,
      bicep: 0.04,
      thigh: -0.12,
    },
    trainerEmail: 'arjun@sector7.com',
    program: [
      {
        exerciseId: 'ex-treadmill',
        label: 'Incline Walk',
        startWeightKg: 6.5,
        weeklyIncrKg: 0.1,
        startReps: 25,
        repsDelta: 2,
        sets: 1,
        isCardio: true,
      },
      {
        exerciseId: 'ex-squat',
        label: 'Front Squat',
        startWeightKg: 60,
        weeklyIncrKg: 2.5,
        startReps: 8,
        repsDelta: 0,
        sets: 4,
      },
      {
        exerciseId: 'ex-deadlift',
        label: 'Sumo Deadlift',
        startWeightKg: 90,
        weeklyIncrKg: 2.5,
        startReps: 5,
        repsDelta: 0,
        sets: 4,
      },
      {
        exerciseId: 'ex-bench-press',
        label: 'Incline Press',
        startWeightKg: 50,
        weeklyIncrKg: 2.5,
        startReps: 10,
        repsDelta: 0,
        sets: 4,
      },
      {
        exerciseId: 'ex-row',
        label: 'T-Bar Row',
        startWeightKg: 40,
        weeklyIncrKg: 2.5,
        startReps: 10,
        repsDelta: 0,
        sets: 4,
      },
      {
        exerciseId: 'ex-plank',
        label: 'Side Plank',
        startWeightKg: 0,
        weeklyIncrKg: 0,
        startReps: 20,
        repsDelta: 5,
        sets: 3,
      },
    ],
  },
];

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🌱 Seeding client progress data...\n');

  for (const plan of CLIENT_PLANS) {
    const clientUser = await prisma.user.findUnique({
      where: { email: plan.email },
      include: { clientProfile: true },
    });
    if (!clientUser?.clientProfile) {
      console.warn(`  ⚠ Client not found: ${plan.email} — skipping`);
      continue;
    }
    const clientProfileId = clientUser.clientProfile.id;

    const trainerUser = await prisma.user.findUnique({
      where: { email: plan.trainerEmail },
      select: { id: true },
    });
    const recordedByUserId = trainerUser?.id ?? clientUser.id;

    // ── 1. Progress entries ─────────────────────────────────────────────
    await prisma.progressEntry.deleteMany({ where: { clientProfileId } });

    const snapshots = SNAPSHOT_DATES.map((date, week) => {
      const t = plan.trend;
      const b = plan.baseline;
      const weekLabel =
        week === 0
          ? 'Baseline assessment — welcome aboard!'
          : week === 4
            ? 'Month 1 check-in — great consistency!'
            : week === 8
              ? 'Month 2 check-in — progress is showing!'
              : week === 12
                ? 'Month 3 check-in — remarkable transformation!'
                : `Week ${week} check-in`;

      return {
        clientProfileId,
        recordedByUserId,
        recordedAt: date,
        weightKg: jitter(b.weightKg + t.weightKg * week, 0.3),
        bodyFatPercent: jitter(b.bodyFatPercent + t.bodyFatPercent * week, 0.25),
        muscleMass: jitter(b.muscleMass + t.muscleMass * week, 0.2),
        chest: jitter(b.chest + t.chest * week, 0.3),
        waist: jitter(b.waist + t.waist * week, 0.3),
        hips: jitter(b.hips + t.hips * week, 0.3),
        bicepLeft: jitter(b.bicepLeft + t.bicep * week, 0.2),
        bicepRight: jitter(b.bicepRight + t.bicep * week, 0.2),
        thighLeft: jitter(b.thighLeft + t.thigh * week, 0.3),
        thighRight: jitter(b.thighRight + t.thigh * week, 0.3),
        notes: weekLabel,
      };
    });

    await prisma.progressEntry.createMany({ data: snapshots });
    console.log(`  ✓ ${plan.name}: ${snapshots.length} progress snapshots`);

    // ── 2. Workout logs with progressive overload ───────────────────────
    // Get completed sessions for this client in ascending chronological order
    const completedSessions = await prisma.sessionInstance.findMany({
      where: {
        clientProfileId,
        status: 'COMPLETED',
      },
      orderBy: [{ scheduledDate: 'asc' }, { scheduledTime: 'asc' }],
      select: { id: true, scheduledDate: true },
    });

    // Delete existing workout logs for these sessions
    const sessionIds = completedSessions.map((s) => s.id);
    if (sessionIds.length > 0) {
      const logs = await prisma.workoutLog.findMany({
        where: { sessionInstanceId: { in: sessionIds } },
        select: { id: true },
      });
      const logIds = logs.map((l) => l.id);
      if (logIds.length > 0) {
        await prisma.workoutSet.deleteMany({ where: { workoutLogId: { in: logIds } } });
        await prisma.workoutLog.deleteMany({ where: { id: { in: logIds } } });
      }
    }

    // Re-create with progressive overload
    // Session 0 = Jan baseline. Each session maps to a "week" number
    // We calculate week from the session date relative to Jan 1 2026
    const jan1 = new Date(2026, 0, 1).getTime();

    for (let si = 0; si < completedSessions.length; si++) {
      const session = completedSessions[si]!;
      const weekNum = Math.floor((session.scheduledDate.getTime() - jan1) / (7 * 24 * 3600 * 1000));

      // Rotate through exercises (2–4 per session depending on index)
      const sessionExercises =
        si % 2 === 0
          ? plan.program.slice(0, Math.min(4, plan.program.length))
          : plan.program.slice(Math.min(2, plan.program.length));

      for (let ei = 0; ei < sessionExercises.length; ei++) {
        const ex = sessionExercises[ei]!;
        const weight = Math.max(0, ex.startWeightKg + ex.weeklyIncrKg * weekNum);
        const reps = Math.max(1, ex.startReps + ex.repsDelta * weekNum);

        const log = await prisma.workoutLog.create({
          data: {
            sessionInstanceId: session.id,
            exerciseId: ex.exerciseId,
            orderIndex: ei,
          },
        });

        for (let setNum = 1; setNum <= ex.sets; setNum++) {
          // Last set is usually slightly harder — small weight bump on later sets
          const setWeight = ex.isCardio
            ? weight
            : Math.round((weight + (setNum === ex.sets ? 0 : 0)) * 2) / 2; // keep 0.5 precision
          const setReps = ex.isCardio ? reps : Math.max(1, reps - (setNum === ex.sets ? 1 : 0)); // last set -1 rep
          const rpe = Math.min(10, 6 + Math.floor(weekNum / 3) + (setNum === ex.sets ? 1 : 0));

          await prisma.workoutSet.create({
            data: {
              workoutLogId: log.id,
              setNumber: setNum,
              reps: setReps,
              weightKg: setWeight,
              rpe: Math.min(rpe, 10),
            },
          });
        }
      }
    }

    console.log(
      `  ✓ ${plan.name}: workout logs for ${completedSessions.length} sessions (progressive overload)`,
    );
  }

  console.log('\n✅ Progress seeding complete!\n');
}

main()
  .catch((e) => {
    console.error('❌ Progress seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
