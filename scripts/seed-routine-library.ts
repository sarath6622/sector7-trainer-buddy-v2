/**
 * Seeds the starter routine library (ADR-053) — one "Push / Pull / Legs"
 * program per branch, derived from the gym's own logged workouts:
 *
 *   - 1,930 logged sessions (2026-03-01 → 2026-10-10), 164 clients, 20 trainers.
 *   - 74% of consecutive sessions follow Push → Pull → Legs → Push
 *     (766 of 1,042 transitions) — hence a 3-routine rotation.
 *   - House standard is 3 sets × 15 reps (median of every top exercise);
 *     the compound presses/rows spread 12–15, so they get a 12–15 range.
 *   - Logged rest is 60s at the 25th, 50th and 75th percentile.
 *   - Exercises are the most-logged per day type. No target weights: they are
 *     per-client, and the logger already shows each client's "previous".
 *
 * Idempotent: skips a branch that already has a library program with this
 * name. Writes an audit row per program created (rule 6).
 *
 * NO DEFAULT DATABASE — Prisma would otherwise load `.env` (prod Neon). Pass
 * the target explicitly:
 *   npx tsx scripts/seed-routine-library.ts --url "postgresql://sector7:sector7pass@localhost:5432/sector7"
 */
import { PrismaClient, type RoutineSetType } from '@prisma/client';

const PROGRAM_NAME = 'Push / Pull / Legs';
const PROGRAM_NOTES =
  'Rotate Push, Pull and Legs in order. 3 working sets per exercise with 60s rest. ' +
  'Pick a weight where the last 2 or 3 reps are hard. When every set reaches the top of the range, go heavier next time.';

interface SeedExercise {
  exerciseId: string;
  reps: [number, number];
  notes?: string;
}

const ROUTINES: { name: string; exercises: SeedExercise[] }[] = [
  {
    name: 'Push Day',
    exercises: [
      { exerciseId: 'ex-bench-press', reps: [12, 15] },
      { exerciseId: 'ex-incline-chest-press-machine', reps: [15, 15] },
      { exerciseId: 'ex-pec-deck-fly', reps: [15, 15] },
      { exerciseId: 'ex-db-shoulder-press', reps: [12, 15] },
      { exerciseId: 'ex-lateral-raise', reps: [15, 15] },
      { exerciseId: 'ex-tricep-pushdown', reps: [15, 15] },
    ],
  },
  {
    name: 'Pull Day',
    exercises: [
      { exerciseId: 'ex-lat-pulldown', reps: [12, 15] },
      { exerciseId: 'ex-seated-cable-row', reps: [12, 15] },
      { exerciseId: 'ex-isolateral-row', reps: [15, 15] },
      { exerciseId: 'ex-face-pull', reps: [15, 15] },
      { exerciseId: 'ex-curl', reps: [15, 15] },
      { exerciseId: 'ex-hammer-curl', reps: [15, 15] },
    ],
  },
  {
    name: 'Leg Day',
    exercises: [
      { exerciseId: 'ex-leg-press', reps: [12, 15] },
      { exerciseId: 'ex-leg-extension', reps: [15, 15] },
      { exerciseId: 'ex-leg-curl', reps: [15, 15] },
      { exerciseId: 'ex-abductors', reps: [15, 15] },
      { exerciseId: 'ex-hip-thrust-machine', reps: [15, 15] },
      { exerciseId: 'ex-seated-calf-raise', reps: [15, 15] },
    ],
  },
];

const SETS_PER_EXERCISE = 3;
const REST_SEC = 60;

function readUrl(): string {
  const idx = process.argv.indexOf('--url');
  const url = idx >= 0 ? process.argv[idx + 1] : undefined;
  if (!url) {
    console.error('Refusing to run without --url <postgres-url> (would otherwise hit .env).');
    process.exit(1);
  }
  return url;
}

async function main() {
  const url = readUrl();
  const prisma = new PrismaClient({ datasourceUrl: url });
  console.log(`Target: ${url.replace(/:\/\/([^:]+):[^@]+@/, '://$1:***@')}`);

  try {
    const exerciseIds = ROUTINES.flatMap((r) => r.exercises.map((e) => e.exerciseId));
    const found = await prisma.exercise.findMany({
      where: { id: { in: exerciseIds }, isActive: true },
      select: { id: true },
    });
    const missing = exerciseIds.filter((id) => !found.some((f) => f.id === id));
    if (missing.length > 0) {
      throw new Error(`Missing or inactive exercises: ${missing.join(', ')}`);
    }

    const branches = await prisma.branch.findMany({ select: { id: true, name: true } });
    for (const branch of branches) {
      const existing = await prisma.routineProgram.findFirst({
        where: { branchId: branch.id, clientProfileId: null, name: PROGRAM_NAME },
        select: { id: true },
      });
      if (existing) {
        console.log(`  ${branch.name}: already has "${PROGRAM_NAME}", skipped`);
        continue;
      }
      const admin = await prisma.user.findFirst({
        where: {
          branchId: branch.id,
          roles: { hasSome: ['SUPER_ADMIN', 'BRANCH_ADMIN'] },
        },
        select: { id: true },
      });
      if (!admin) {
        console.log(`  ${branch.name}: no admin user to own the program, skipped`);
        continue;
      }

      const program = await prisma.routineProgram.create({
        data: {
          branchId: branch.id,
          name: PROGRAM_NAME,
          notes: PROGRAM_NOTES,
          createdByUserId: admin.id,
          routines: {
            create: ROUTINES.map((r, rIdx) => ({
              name: r.name,
              orderIndex: rIdx,
              exercises: {
                create: r.exercises.map((e, eIdx) => ({
                  exerciseId: e.exerciseId,
                  orderIndex: eIdx,
                  restSec: REST_SEC,
                  notes: e.notes ?? null,
                  sets: {
                    create: Array.from({ length: SETS_PER_EXERCISE }, (_, sIdx) => ({
                      setNumber: sIdx + 1,
                      setType: 'NORMAL' as RoutineSetType,
                      targetRepsMin: e.reps[0],
                      targetRepsMax: e.reps[1],
                    })),
                  },
                })),
              },
            })),
          },
        },
        select: { id: true },
      });

      await prisma.auditLog.create({
        data: {
          branchId: branch.id,
          actorId: admin.id,
          action: 'ROUTINE_PROGRAM_CREATED',
          subjectType: 'RoutineProgram',
          subjectId: program.id,
          newValue: {
            name: PROGRAM_NAME,
            routines: ROUTINES.map((r) => ({ name: r.name, exercises: r.exercises.length })),
          },
          metadata: { source: 'scripts/seed-routine-library.ts' },
        },
      });
      console.log(`  ${branch.name}: created "${PROGRAM_NAME}" (${program.id})`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
