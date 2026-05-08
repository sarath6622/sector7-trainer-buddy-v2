/**
 * Seeds additional exercises into the database.
 *
 * Idempotent: skips any exercise whose name already exists (case-insensitive match).
 * Run against Neon (prod) using the default DATABASE_URL from .env:
 *   npx tsx scripts/seed-additional-exercises.ts
 */
import {
  PrismaClient,
  type ExerciseType,
  type DifficultyLevel,
  type ExerciseCategory,
} from '@prisma/client';

const prisma = new PrismaClient();

type ExerciseSeed = {
  id: string;
  name: string;
  targetMuscleGroup: string;
  secondaryMuscles: string[];
  equipmentRequired: string;
  difficulty: DifficultyLevel;
  category: ExerciseCategory;
  exerciseType: ExerciseType;
  isCompound: boolean;
  instructions: string;
};

const NEW_EXERCISES: ExerciseSeed[] = [
  // ── Chest ─────────────────────────────────────────────────────────────────
  {
    id: 'ex-incline-chest-press-machine',
    name: 'Incline Chest Press (Machine)',
    targetMuscleGroup: 'Chest',
    secondaryMuscles: ['Triceps', 'Shoulders'],
    equipmentRequired: 'Incline Chest Press Machine',
    difficulty: 'EASY',
    category: 'HYPERTROPHY',
    exerciseType: 'WEIGHTED',
    isCompound: true,
    instructions:
      'Sit on machine, grip handles at chest height, press forward and up, return with control.',
  },
  {
    id: 'ex-incline-chest-press-smith',
    name: 'Incline Chest Press (Smith)',
    targetMuscleGroup: 'Chest',
    secondaryMuscles: ['Triceps', 'Shoulders'],
    equipmentRequired: 'Smith Machine, Incline Bench',
    difficulty: 'MEDIUM',
    category: 'HYPERTROPHY',
    exerciseType: 'WEIGHTED',
    isCompound: true,
    instructions:
      'Set bench to 30–45° under Smith bar, lower bar to upper chest, press up to lockout.',
  },
  {
    id: 'ex-incline-barbell-press',
    name: 'Incline Barbell Press',
    targetMuscleGroup: 'Chest',
    secondaryMuscles: ['Triceps', 'Shoulders'],
    equipmentRequired: 'Barbell, Incline Bench',
    difficulty: 'MEDIUM',
    category: 'HYPERTROPHY',
    exerciseType: 'WEIGHTED',
    isCompound: true,
    instructions:
      'Set bench to 30–45°, unrack barbell, lower to upper chest, press to full extension.',
  },
  {
    id: 'ex-incline-chest-fly-machine',
    name: 'Incline Chest Fly (Machine)',
    targetMuscleGroup: 'Chest',
    secondaryMuscles: ['Shoulders'],
    equipmentRequired: 'Incline Chest Fly Machine',
    difficulty: 'EASY',
    category: 'HYPERTROPHY',
    exerciseType: 'WEIGHTED',
    isCompound: false,
    instructions:
      'Sit on incline pad, grip handles, sweep arms together in a wide arc, return slowly.',
  },
  {
    id: 'ex-pec-deck-fly',
    name: 'Pec Deck Fly',
    targetMuscleGroup: 'Chest',
    secondaryMuscles: ['Shoulders'],
    equipmentRequired: 'Pec Deck Machine',
    difficulty: 'EASY',
    category: 'HYPERTROPHY',
    exerciseType: 'WEIGHTED',
    isCompound: false,
    instructions:
      'Sit upright, place forearms on pads, squeeze pads together in front of chest, release with control.',
  },
  {
    id: 'ex-decline-press-machine',
    name: 'Decline Press (Machine)',
    targetMuscleGroup: 'Chest',
    secondaryMuscles: ['Triceps', 'Shoulders'],
    equipmentRequired: 'Decline Press Machine',
    difficulty: 'MEDIUM',
    category: 'HYPERTROPHY',
    exerciseType: 'WEIGHTED',
    isCompound: true,
    instructions:
      'Sit on decline machine, grip handles at lower chest, press forward and slightly down, return.',
  },

  // ── Back ──────────────────────────────────────────────────────────────────
  {
    id: 'ex-assisted-chin-up',
    name: 'Assisted Chin-ups',
    targetMuscleGroup: 'Back',
    secondaryMuscles: ['Biceps', 'Core'],
    equipmentRequired: 'Assisted Pull-up Machine',
    difficulty: 'MEDIUM',
    category: 'HYPERTROPHY',
    exerciseType: 'WEIGHTED',
    isCompound: true,
    instructions:
      'Kneel on assist pad, grip bar with underhand grip, pull chin above bar, lower with control.',
  },
  {
    id: 'ex-lat-pulldown-wide',
    name: 'Lat Pulldown (Wide Grip)',
    targetMuscleGroup: 'Back',
    secondaryMuscles: ['Biceps', 'Rear Deltoid'],
    equipmentRequired: 'Cable Machine, Wide Grip Bar',
    difficulty: 'MEDIUM',
    category: 'HYPERTROPHY',
    exerciseType: 'WEIGHTED',
    isCompound: true,
    instructions:
      'Sit, grip bar wider than shoulders, pull down to upper chest, squeeze lats, return controlled.',
  },
  {
    id: 'ex-circular-pulldown',
    name: 'Circular Pulldown',
    targetMuscleGroup: 'Back',
    secondaryMuscles: ['Biceps', 'Rear Deltoid'],
    equipmentRequired: 'Cable Machine',
    difficulty: 'MEDIUM',
    category: 'HYPERTROPHY',
    exerciseType: 'WEIGHTED',
    isCompound: false,
    instructions:
      'Pull cable in a circular arc from overhead down and across the body, working the lats through a full sweep.',
  },
  {
    id: 'ex-machine-pullover',
    name: 'Machine Pullover',
    targetMuscleGroup: 'Back',
    secondaryMuscles: ['Chest', 'Triceps', 'Core'],
    equipmentRequired: 'Pullover Machine',
    difficulty: 'MEDIUM',
    category: 'HYPERTROPHY',
    exerciseType: 'WEIGHTED',
    isCompound: false,
    instructions:
      'Sit in machine, place elbows on pads, pull pads down and forward in an arc, return overhead with control.',
  },
  {
    id: 'ex-high-row',
    name: 'High Row',
    targetMuscleGroup: 'Back',
    secondaryMuscles: ['Biceps', 'Rear Deltoid'],
    equipmentRequired: 'Cable Machine or Plate-loaded High Row',
    difficulty: 'MEDIUM',
    category: 'HYPERTROPHY',
    exerciseType: 'WEIGHTED',
    isCompound: true,
    instructions:
      'Set cable high, pull handles down and back toward upper chest, drive elbows behind torso.',
  },
  {
    id: 'ex-low-row',
    name: 'Low Row',
    targetMuscleGroup: 'Back',
    secondaryMuscles: ['Biceps', 'Rear Deltoid'],
    equipmentRequired: 'Cable Machine or Plate-loaded Low Row',
    difficulty: 'MEDIUM',
    category: 'HYPERTROPHY',
    exerciseType: 'WEIGHTED',
    isCompound: true,
    instructions:
      'Sit, grip handles, row toward lower abdomen keeping torso upright, squeeze shoulder blades.',
  },
  {
    id: 'ex-isolateral-row',
    name: 'Isolateral Row',
    targetMuscleGroup: 'Back',
    secondaryMuscles: ['Biceps', 'Rear Deltoid'],
    equipmentRequired: 'Plate-loaded Isolateral Row Machine',
    difficulty: 'MEDIUM',
    category: 'HYPERTROPHY',
    exerciseType: 'WEIGHTED',
    isCompound: true,
    instructions:
      'Grip one handle at a time (or both independently), row toward hip, squeeze, return.',
  },

  // ── Shoulders ─────────────────────────────────────────────────────────────
  {
    id: 'ex-shoulder-press-machine',
    name: 'Shoulder Press (Machine)',
    targetMuscleGroup: 'Shoulders',
    secondaryMuscles: ['Triceps'],
    equipmentRequired: 'Shoulder Press Machine',
    difficulty: 'EASY',
    category: 'HYPERTROPHY',
    exerciseType: 'WEIGHTED',
    isCompound: true,
    instructions:
      'Sit, grip handles at shoulder height, press overhead until arms extend, lower with control.',
  },

  // ── Biceps / Forearms ─────────────────────────────────────────────────────
  {
    id: 'ex-preacher-curl',
    name: 'Preacher Curl',
    targetMuscleGroup: 'Biceps',
    secondaryMuscles: ['Forearms', 'Brachialis'],
    equipmentRequired: 'Preacher Bench, EZ Bar or Dumbbells',
    difficulty: 'MEDIUM',
    category: 'HYPERTROPHY',
    exerciseType: 'WEIGHTED',
    isCompound: false,
    instructions:
      'Rest upper arms on preacher pad, curl bar up to shoulder, lower slowly to full stretch.',
  },
  {
    id: 'ex-wrist-curl',
    name: 'Wrist Curl',
    targetMuscleGroup: 'Forearms',
    secondaryMuscles: [],
    equipmentRequired: 'Dumbbells or Barbell',
    difficulty: 'EASY',
    category: 'HYPERTROPHY',
    exerciseType: 'WEIGHTED',
    isCompound: false,
    instructions: 'Rest forearms on bench, palms up, curl wrists upward, lower under control.',
  },

  // ── Quads / Legs ──────────────────────────────────────────────────────────
  {
    id: 'ex-leg-extension',
    name: 'Leg Extension',
    targetMuscleGroup: 'Quadriceps',
    secondaryMuscles: [],
    equipmentRequired: 'Leg Extension Machine',
    difficulty: 'EASY',
    category: 'HYPERTROPHY',
    exerciseType: 'WEIGHTED',
    isCompound: false,
    instructions: 'Sit on machine, hook ankles behind pad, extend knees fully, lower with control.',
  },
  {
    id: 'ex-sumo-squat',
    name: 'Sumo Squat',
    targetMuscleGroup: 'Quadriceps',
    secondaryMuscles: ['Glutes', 'Adductors', 'Hamstrings'],
    equipmentRequired: 'Barbell or Dumbbell',
    difficulty: 'MEDIUM',
    category: 'STRENGTH',
    exerciseType: 'WEIGHTED',
    isCompound: true,
    instructions:
      'Take wide stance with toes turned out, squat down keeping knees over toes, drive up.',
  },
  {
    id: 'ex-belt-squat',
    name: 'Belt Squat',
    targetMuscleGroup: 'Quadriceps',
    secondaryMuscles: ['Glutes', 'Hamstrings'],
    equipmentRequired: 'Belt Squat Machine',
    difficulty: 'MEDIUM',
    category: 'STRENGTH',
    exerciseType: 'WEIGHTED',
    isCompound: true,
    instructions:
      'Strap belt around hips, stand on platform, squat to depth, drive up keeping torso vertical.',
  },
  {
    id: 'ex-pendulum-squat',
    name: 'Pendulum Squat',
    targetMuscleGroup: 'Quadriceps',
    secondaryMuscles: ['Glutes', 'Hamstrings'],
    equipmentRequired: 'Pendulum Squat Machine',
    difficulty: 'MEDIUM',
    category: 'STRENGTH',
    exerciseType: 'WEIGHTED',
    isCompound: true,
    instructions:
      'Stand on platform with shoulders under pads, squat down through the arc, press up.',
  },
  {
    id: 'ex-sissy-squat',
    name: 'Sissy Squat',
    targetMuscleGroup: 'Quadriceps',
    secondaryMuscles: ['Hip Flexors'],
    equipmentRequired: 'Sissy Squat Bench (optional)',
    difficulty: 'MEDIUM',
    category: 'FUNCTIONAL',
    exerciseType: 'BODYWEIGHT',
    isCompound: false,
    instructions:
      'Lean back on toes with knees driving forward, lower hips toward heels, return upright.',
  },

  // ── Hamstrings ────────────────────────────────────────────────────────────
  {
    id: 'ex-lying-leg-curl',
    name: 'Lying Leg Curl',
    targetMuscleGroup: 'Hamstrings',
    secondaryMuscles: ['Calves'],
    equipmentRequired: 'Lying Leg Curl Machine',
    difficulty: 'EASY',
    category: 'HYPERTROPHY',
    exerciseType: 'WEIGHTED',
    isCompound: false,
    instructions:
      'Lie face down, hook heels under pad, curl heels toward glutes, lower with control.',
  },
  {
    id: 'ex-seated-leg-curl',
    name: 'Seated Leg Curl',
    targetMuscleGroup: 'Hamstrings',
    secondaryMuscles: ['Calves'],
    equipmentRequired: 'Seated Leg Curl Machine',
    difficulty: 'EASY',
    category: 'HYPERTROPHY',
    exerciseType: 'WEIGHTED',
    isCompound: false,
    instructions: 'Sit upright, hook heels behind pad, curl legs down and back, return to start.',
  },

  // ── Glutes / Hips ─────────────────────────────────────────────────────────
  {
    id: 'ex-adductors',
    name: 'Adductors',
    targetMuscleGroup: 'Adductors',
    secondaryMuscles: [],
    equipmentRequired: 'Hip Adductor Machine',
    difficulty: 'EASY',
    category: 'HYPERTROPHY',
    exerciseType: 'WEIGHTED',
    isCompound: false,
    instructions:
      'Sit with legs against outer pads, squeeze legs together against resistance, return slowly.',
  },
  {
    id: 'ex-abductors',
    name: 'Abductors',
    targetMuscleGroup: 'Glutes',
    secondaryMuscles: ['Hip Abductors'],
    equipmentRequired: 'Hip Abductor Machine',
    difficulty: 'EASY',
    category: 'HYPERTROPHY',
    exerciseType: 'WEIGHTED',
    isCompound: false,
    instructions:
      'Sit with legs against inner pads, push legs outward against resistance, return slowly.',
  },
  {
    id: 'ex-glute-kickback',
    name: 'Glute Kickback',
    targetMuscleGroup: 'Glutes',
    secondaryMuscles: ['Hamstrings'],
    equipmentRequired: 'Glute Kickback Machine or Cable Machine',
    difficulty: 'EASY',
    category: 'HYPERTROPHY',
    exerciseType: 'WEIGHTED',
    isCompound: false,
    instructions:
      'Brace torso, drive working leg backward against resistance, squeeze glute, return.',
  },
  {
    id: 'ex-hip-thrust-machine',
    name: 'Hip Thrust (Machine)',
    targetMuscleGroup: 'Glutes',
    secondaryMuscles: ['Hamstrings', 'Core'],
    equipmentRequired: 'Hip Thrust Machine',
    difficulty: 'MEDIUM',
    category: 'HYPERTROPHY',
    exerciseType: 'WEIGHTED',
    isCompound: true,
    instructions:
      'Sit with upper back against pad, drive hips up until torso parallel to floor, squeeze glutes, lower.',
  },

  // ── Calves ────────────────────────────────────────────────────────────────
  {
    id: 'ex-seated-calf-raise',
    name: 'Seated Calf Raise',
    targetMuscleGroup: 'Calves',
    secondaryMuscles: [],
    equipmentRequired: 'Seated Calf Raise Machine',
    difficulty: 'EASY',
    category: 'HYPERTROPHY',
    exerciseType: 'WEIGHTED',
    isCompound: false,
    instructions:
      'Sit with knees under pad, balls of feet on platform, rise onto toes, lower heels below platform.',
  },
];

async function main() {
  const existing = await prisma.exercise.findMany({ select: { name: true } });
  const existingNames = new Set(existing.map((e) => e.name.toLowerCase().trim()));

  const toInsert = NEW_EXERCISES.filter((ex) => !existingNames.has(ex.name.toLowerCase().trim()));
  const skipped = NEW_EXERCISES.filter((ex) => existingNames.has(ex.name.toLowerCase().trim()));

  console.log(`Existing exercises in DB: ${existing.length}`);
  console.log(`Candidates to insert: ${NEW_EXERCISES.length}`);
  console.log(`Already present (skipped): ${skipped.length}`);
  if (skipped.length) {
    skipped.forEach((s) => console.log(`  - ${s.name}`));
  }
  console.log(`To insert: ${toInsert.length}`);

  if (toInsert.length === 0) {
    console.log('Nothing to insert. Exiting.');
    return;
  }

  let inserted = 0;
  for (const ex of toInsert) {
    await prisma.exercise.upsert({
      where: { id: ex.id },
      update: {},
      create: ex,
    });
    inserted++;
    console.log(`  + ${ex.name}`);
  }
  console.log(`\nInserted ${inserted} exercises.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
