/**
 * Expansion seed: rounds out the exercise library with commonly-programmed
 * movements across chest, back, shoulders, arms, legs, posterior chain, core,
 * Olympic/power, cardio, and flexibility.
 *
 * Idempotent — skips any exercise whose name already exists (case-insensitive).
 *   npx tsx scripts/seed-exercise-library-expansion.ts
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
    id: 'ex-decline-bench-press',
    name: 'Decline Bench Press',
    targetMuscleGroup: 'Chest',
    secondaryMuscles: ['Triceps', 'Shoulders'],
    equipmentRequired: 'Barbell, Decline Bench',
    difficulty: 'MEDIUM',
    category: 'HYPERTROPHY',
    exerciseType: 'WEIGHTED',
    isCompound: true,
    instructions: 'Lie on decline bench, unrack bar, lower to lower chest, press up to lockout.',
  },
  {
    id: 'ex-db-bench-press',
    name: 'Dumbbell Bench Press',
    targetMuscleGroup: 'Chest',
    secondaryMuscles: ['Triceps', 'Shoulders'],
    equipmentRequired: 'Dumbbells, Bench',
    difficulty: 'MEDIUM',
    category: 'HYPERTROPHY',
    exerciseType: 'WEIGHTED',
    isCompound: true,
    instructions:
      'Lie on flat bench, press dumbbells from chest to full extension, lower with control.',
  },
  {
    id: 'ex-cable-crossover',
    name: 'Cable Crossover',
    targetMuscleGroup: 'Chest',
    secondaryMuscles: ['Shoulders'],
    equipmentRequired: 'Cable Machine',
    difficulty: 'EASY',
    category: 'HYPERTROPHY',
    exerciseType: 'WEIGHTED',
    isCompound: false,
    instructions:
      'Set cables high, step forward, sweep handles down and across body, squeeze chest.',
  },

  // ── Back ──────────────────────────────────────────────────────────────────
  {
    id: 'ex-tbar-row',
    name: 'T-Bar Row',
    targetMuscleGroup: 'Back',
    secondaryMuscles: ['Biceps', 'Rear Deltoid'],
    equipmentRequired: 'T-Bar Row Machine',
    difficulty: 'MEDIUM',
    category: 'HYPERTROPHY',
    exerciseType: 'WEIGHTED',
    isCompound: true,
    instructions:
      'Straddle bar, hinge forward, row handles to lower chest, squeeze shoulder blades.',
  },
  {
    id: 'ex-single-arm-db-row',
    name: 'Single-Arm Dumbbell Row',
    targetMuscleGroup: 'Back',
    secondaryMuscles: ['Biceps', 'Core'],
    equipmentRequired: 'Dumbbell, Bench',
    difficulty: 'EASY',
    category: 'HYPERTROPHY',
    exerciseType: 'WEIGHTED',
    isCompound: true,
    instructions: 'Brace one hand and knee on bench, row dumbbell to hip, lower with control.',
  },
  {
    id: 'ex-chest-supported-row',
    name: 'Chest-Supported Row',
    targetMuscleGroup: 'Back',
    secondaryMuscles: ['Biceps', 'Rear Deltoid'],
    equipmentRequired: 'Chest-Supported Row Machine',
    difficulty: 'EASY',
    category: 'HYPERTROPHY',
    exerciseType: 'WEIGHTED',
    isCompound: true,
    instructions:
      'Lie chest down on pad, row handles toward torso, drive elbows back, lower controlled.',
  },
  {
    id: 'ex-face-pull',
    name: 'Face Pull',
    targetMuscleGroup: 'Rear Deltoid',
    secondaryMuscles: ['Upper Back', 'Rotator Cuff'],
    equipmentRequired: 'Cable Machine, Rope Attachment',
    difficulty: 'EASY',
    category: 'HYPERTROPHY',
    exerciseType: 'WEIGHTED',
    isCompound: false,
    instructions:
      'Set cable above head, pull rope to face flaring elbows wide, externally rotate shoulders.',
  },
  {
    id: 'ex-straight-arm-pulldown',
    name: 'Straight-Arm Pulldown',
    targetMuscleGroup: 'Back',
    secondaryMuscles: ['Triceps', 'Core'],
    equipmentRequired: 'Cable Machine',
    difficulty: 'EASY',
    category: 'HYPERTROPHY',
    exerciseType: 'WEIGHTED',
    isCompound: false,
    instructions:
      'Stand back from cable, arms straight, drive bar down to thighs by squeezing lats.',
  },
  {
    id: 'ex-shrugs',
    name: 'Shrugs',
    targetMuscleGroup: 'Traps',
    secondaryMuscles: ['Forearms'],
    equipmentRequired: 'Barbell or Dumbbells',
    difficulty: 'EASY',
    category: 'HYPERTROPHY',
    exerciseType: 'WEIGHTED',
    isCompound: false,
    instructions:
      'Stand tall holding load, elevate shoulders straight up toward ears, hold, lower slowly.',
  },
  {
    id: 'ex-hyperextension',
    name: 'Hyperextension',
    targetMuscleGroup: 'Lower Back',
    secondaryMuscles: ['Glutes', 'Hamstrings'],
    equipmentRequired: 'Hyperextension Bench',
    difficulty: 'EASY',
    category: 'HYPERTROPHY',
    exerciseType: 'BODYWEIGHT',
    isCompound: false,
    instructions:
      'Lock feet, hinge from hips, lower torso, then extend back up to neutral, squeeze glutes.',
  },
  {
    id: 'ex-good-morning',
    name: 'Good Morning',
    targetMuscleGroup: 'Hamstrings',
    secondaryMuscles: ['Lower Back', 'Glutes'],
    equipmentRequired: 'Barbell',
    difficulty: 'MEDIUM',
    category: 'STRENGTH',
    exerciseType: 'WEIGHTED',
    isCompound: true,
    instructions:
      'Bar on upper back, hinge at hips with slight knee bend, lower torso to parallel, return.',
  },

  // ── Shoulders ─────────────────────────────────────────────────────────────
  {
    id: 'ex-lateral-raise',
    name: 'Lateral Raise',
    targetMuscleGroup: 'Shoulders',
    secondaryMuscles: ['Traps'],
    equipmentRequired: 'Dumbbells',
    difficulty: 'EASY',
    category: 'HYPERTROPHY',
    exerciseType: 'WEIGHTED',
    isCompound: false,
    instructions:
      'Stand with dumbbells at sides, raise arms out to shoulder height, lower with control.',
  },
  {
    id: 'ex-front-raise',
    name: 'Front Raise',
    targetMuscleGroup: 'Shoulders',
    secondaryMuscles: [],
    equipmentRequired: 'Dumbbells or Plate',
    difficulty: 'EASY',
    category: 'HYPERTROPHY',
    exerciseType: 'WEIGHTED',
    isCompound: false,
    instructions:
      'Hold weight in front of thighs, raise arms straight to shoulder height, lower slowly.',
  },
  {
    id: 'ex-reverse-fly',
    name: 'Reverse Fly',
    targetMuscleGroup: 'Rear Deltoid',
    secondaryMuscles: ['Upper Back'],
    equipmentRequired: 'Reverse Pec Deck Machine or Dumbbells',
    difficulty: 'EASY',
    category: 'HYPERTROPHY',
    exerciseType: 'WEIGHTED',
    isCompound: false,
    instructions:
      'Sit/stand bent over, sweep arms back and out, squeeze rear delts, return controlled.',
  },
  {
    id: 'ex-arnold-press',
    name: 'Arnold Press',
    targetMuscleGroup: 'Shoulders',
    secondaryMuscles: ['Triceps'],
    equipmentRequired: 'Dumbbells',
    difficulty: 'MEDIUM',
    category: 'HYPERTROPHY',
    exerciseType: 'WEIGHTED',
    isCompound: true,
    instructions:
      'Start palms-in at chin, rotate palms forward as you press overhead, reverse on descent.',
  },
  {
    id: 'ex-upright-row',
    name: 'Upright Row',
    targetMuscleGroup: 'Shoulders',
    secondaryMuscles: ['Traps', 'Biceps'],
    equipmentRequired: 'Barbell or Dumbbells',
    difficulty: 'EASY',
    category: 'HYPERTROPHY',
    exerciseType: 'WEIGHTED',
    isCompound: false,
    instructions:
      'Hold load at thighs, pull straight up under chin leading with elbows, lower with control.',
  },

  // ── Arms ──────────────────────────────────────────────────────────────────
  {
    id: 'ex-skullcrusher',
    name: 'Skullcrusher',
    targetMuscleGroup: 'Triceps',
    secondaryMuscles: [],
    equipmentRequired: 'EZ Bar or Dumbbells, Bench',
    difficulty: 'MEDIUM',
    category: 'HYPERTROPHY',
    exerciseType: 'WEIGHTED',
    isCompound: false,
    instructions:
      'Lie on bench, press bar overhead, hinge at elbows lowering bar to forehead, extend back up.',
  },
  {
    id: 'ex-overhead-tricep-extension',
    name: 'Overhead Tricep Extension',
    targetMuscleGroup: 'Triceps',
    secondaryMuscles: [],
    equipmentRequired: 'Dumbbell or Cable',
    difficulty: 'EASY',
    category: 'HYPERTROPHY',
    exerciseType: 'WEIGHTED',
    isCompound: false,
    instructions:
      'Hold weight overhead, lower behind head by bending elbows, extend back up keeping elbows tight.',
  },
  {
    id: 'ex-close-grip-bench-press',
    name: 'Close-Grip Bench Press',
    targetMuscleGroup: 'Triceps',
    secondaryMuscles: ['Chest', 'Shoulders'],
    equipmentRequired: 'Barbell, Bench',
    difficulty: 'MEDIUM',
    category: 'STRENGTH',
    exerciseType: 'WEIGHTED',
    isCompound: true,
    instructions:
      'Grip bar shoulder-width, lower to lower chest with elbows tucked, press to lockout.',
  },
  {
    id: 'ex-concentration-curl',
    name: 'Concentration Curl',
    targetMuscleGroup: 'Biceps',
    secondaryMuscles: ['Forearms'],
    equipmentRequired: 'Dumbbell, Bench',
    difficulty: 'EASY',
    category: 'HYPERTROPHY',
    exerciseType: 'WEIGHTED',
    isCompound: false,
    instructions:
      'Sit with elbow braced on inner thigh, curl dumbbell to shoulder, lower under control.',
  },
  {
    id: 'ex-cable-curl',
    name: 'Cable Curl',
    targetMuscleGroup: 'Biceps',
    secondaryMuscles: ['Forearms'],
    equipmentRequired: 'Cable Machine',
    difficulty: 'EASY',
    category: 'HYPERTROPHY',
    exerciseType: 'WEIGHTED',
    isCompound: false,
    instructions:
      'Set cable low, grip bar/handles, curl up keeping elbows pinned, lower with constant tension.',
  },
  {
    id: 'ex-ez-bar-curl',
    name: 'EZ Bar Curl',
    targetMuscleGroup: 'Biceps',
    secondaryMuscles: ['Forearms'],
    equipmentRequired: 'EZ Bar',
    difficulty: 'EASY',
    category: 'HYPERTROPHY',
    exerciseType: 'WEIGHTED',
    isCompound: false,
    instructions:
      'Stand tall, grip bar at angled inner notches, curl up to chest, lower under control.',
  },
  {
    id: 'ex-spider-curl',
    name: 'Spider Curl',
    targetMuscleGroup: 'Biceps',
    secondaryMuscles: ['Forearms'],
    equipmentRequired: 'Incline Bench, Dumbbells or EZ Bar',
    difficulty: 'MEDIUM',
    category: 'HYPERTROPHY',
    exerciseType: 'WEIGHTED',
    isCompound: false,
    instructions:
      'Lie chest down on incline bench, arms hanging, curl weight up to shoulders, lower slowly.',
  },

  // ── Quads / Legs ──────────────────────────────────────────────────────────
  {
    id: 'ex-front-squat',
    name: 'Front Squat',
    targetMuscleGroup: 'Quadriceps',
    secondaryMuscles: ['Glutes', 'Core', 'Upper Back'],
    equipmentRequired: 'Barbell, Squat Rack',
    difficulty: 'HARD',
    category: 'STRENGTH',
    exerciseType: 'WEIGHTED',
    isCompound: true,
    instructions:
      'Rack bar on front delts, elbows high, squat down keeping torso upright, drive up.',
  },
  {
    id: 'ex-goblet-squat',
    name: 'Goblet Squat',
    targetMuscleGroup: 'Quadriceps',
    secondaryMuscles: ['Glutes', 'Core'],
    equipmentRequired: 'Dumbbell or Kettlebell',
    difficulty: 'EASY',
    category: 'FUNCTIONAL',
    exerciseType: 'WEIGHTED',
    isCompound: true,
    instructions:
      'Hold weight at chest, squat to depth keeping torso upright, drive up through midfoot.',
  },
  {
    id: 'ex-hack-squat',
    name: 'Hack Squat',
    targetMuscleGroup: 'Quadriceps',
    secondaryMuscles: ['Glutes', 'Hamstrings'],
    equipmentRequired: 'Hack Squat Machine',
    difficulty: 'MEDIUM',
    category: 'STRENGTH',
    exerciseType: 'WEIGHTED',
    isCompound: true,
    instructions:
      'Stand on platform with shoulders under pads, squat down through guided rails, press up.',
  },
  {
    id: 'ex-bulgarian-split-squat',
    name: 'Bulgarian Split Squat',
    targetMuscleGroup: 'Quadriceps',
    secondaryMuscles: ['Glutes', 'Hamstrings'],
    equipmentRequired: 'Bench, Dumbbells (optional)',
    difficulty: 'MEDIUM',
    category: 'FUNCTIONAL',
    exerciseType: 'WEIGHTED',
    isCompound: true,
    instructions:
      'Rear foot on bench, lower into a deep lunge with front leg, drive up through front heel.',
  },
  {
    id: 'ex-step-up',
    name: 'Step-up',
    targetMuscleGroup: 'Quadriceps',
    secondaryMuscles: ['Glutes', 'Hamstrings'],
    equipmentRequired: 'Box or Bench, Dumbbells (optional)',
    difficulty: 'EASY',
    category: 'FUNCTIONAL',
    exerciseType: 'WEIGHTED',
    isCompound: true,
    instructions:
      'Step one foot onto box, drive through heel to stand fully, step down with control, alternate.',
  },
  {
    id: 'ex-reverse-lunge',
    name: 'Reverse Lunge',
    targetMuscleGroup: 'Quadriceps',
    secondaryMuscles: ['Glutes', 'Hamstrings'],
    equipmentRequired: 'Dumbbells (optional)',
    difficulty: 'EASY',
    category: 'FUNCTIONAL',
    exerciseType: 'WEIGHTED',
    isCompound: true,
    instructions:
      'Step one leg back into lunge, lower until back knee nears floor, push back to standing.',
  },

  // ── Posterior Chain ───────────────────────────────────────────────────────
  {
    id: 'ex-sumo-deadlift',
    name: 'Sumo Deadlift',
    targetMuscleGroup: 'Hamstrings',
    secondaryMuscles: ['Glutes', 'Adductors', 'Lower Back'],
    equipmentRequired: 'Barbell',
    difficulty: 'HARD',
    category: 'STRENGTH',
    exerciseType: 'WEIGHTED',
    isCompound: true,
    instructions:
      'Wide stance, toes turned out, grip bar inside legs, drive through floor to stand tall.',
  },
  {
    id: 'ex-stiff-leg-deadlift',
    name: 'Stiff-Leg Deadlift',
    targetMuscleGroup: 'Hamstrings',
    secondaryMuscles: ['Glutes', 'Lower Back'],
    equipmentRequired: 'Barbell',
    difficulty: 'MEDIUM',
    category: 'STRENGTH',
    exerciseType: 'WEIGHTED',
    isCompound: true,
    instructions:
      'Hold bar at hips, hinge with minimal knee bend, lower bar to mid-shin, return to standing.',
  },
  {
    id: 'ex-trap-bar-deadlift',
    name: 'Trap Bar Deadlift',
    targetMuscleGroup: 'Hamstrings',
    secondaryMuscles: ['Glutes', 'Quadriceps', 'Traps'],
    equipmentRequired: 'Trap Bar',
    difficulty: 'MEDIUM',
    category: 'STRENGTH',
    exerciseType: 'WEIGHTED',
    isCompound: true,
    instructions:
      'Stand inside trap bar, hinge to grip handles, drive through floor to stand tall.',
  },
  {
    id: 'ex-cable-pull-through',
    name: 'Cable Pull-through',
    targetMuscleGroup: 'Glutes',
    secondaryMuscles: ['Hamstrings', 'Lower Back'],
    equipmentRequired: 'Cable Machine, Rope Attachment',
    difficulty: 'EASY',
    category: 'HYPERTROPHY',
    exerciseType: 'WEIGHTED',
    isCompound: false,
    instructions:
      'Face away from cable, rope between legs, hinge forward, drive hips through to standing.',
  },
  {
    id: 'ex-glute-bridge',
    name: 'Glute Bridge',
    targetMuscleGroup: 'Glutes',
    secondaryMuscles: ['Hamstrings', 'Core'],
    equipmentRequired: 'None',
    difficulty: 'EASY',
    category: 'FUNCTIONAL',
    exerciseType: 'BODYWEIGHT',
    isCompound: false,
    instructions: 'Lie on back, knees bent, drive hips up squeezing glutes, hold briefly, lower.',
  },
  {
    id: 'ex-nordic-curl',
    name: 'Nordic Curl',
    targetMuscleGroup: 'Hamstrings',
    secondaryMuscles: ['Calves'],
    equipmentRequired: 'Padded Bench or Partner',
    difficulty: 'HARD',
    category: 'STRENGTH',
    exerciseType: 'BODYWEIGHT',
    isCompound: false,
    instructions:
      'Anchor heels, slowly lower torso to floor resisting with hamstrings, push back up with hands.',
  },

  // ── Core ──────────────────────────────────────────────────────────────────
  {
    id: 'ex-crunch',
    name: 'Crunch',
    targetMuscleGroup: 'Core',
    secondaryMuscles: [],
    equipmentRequired: 'None',
    difficulty: 'EASY',
    category: 'FUNCTIONAL',
    exerciseType: 'BODYWEIGHT',
    isCompound: false,
    instructions:
      'Lie on back, knees bent, curl shoulders off floor by contracting abs, lower under control.',
  },
  {
    id: 'ex-hanging-leg-raise',
    name: 'Hanging Leg Raise',
    targetMuscleGroup: 'Core',
    secondaryMuscles: ['Hip Flexors', 'Forearms'],
    equipmentRequired: 'Pull-up Bar',
    difficulty: 'HARD',
    category: 'FUNCTIONAL',
    exerciseType: 'BODYWEIGHT',
    isCompound: false,
    instructions: 'Hang from bar, raise straight legs to parallel (or higher), lower with control.',
  },
  {
    id: 'ex-cable-crunch',
    name: 'Cable Crunch',
    targetMuscleGroup: 'Core',
    secondaryMuscles: [],
    equipmentRequired: 'Cable Machine, Rope Attachment',
    difficulty: 'EASY',
    category: 'HYPERTROPHY',
    exerciseType: 'WEIGHTED',
    isCompound: false,
    instructions:
      'Kneel facing cable, rope at temples, crunch torso down by contracting abs, return.',
  },
  {
    id: 'ex-russian-twist',
    name: 'Russian Twist',
    targetMuscleGroup: 'Core',
    secondaryMuscles: ['Obliques'],
    equipmentRequired: 'None or Plate',
    difficulty: 'EASY',
    category: 'FUNCTIONAL',
    exerciseType: 'BODYWEIGHT',
    isCompound: false,
    instructions:
      'Sit with knees bent, lean back slightly, rotate torso side to side touching floor or plate.',
  },
  {
    id: 'ex-ab-wheel-rollout',
    name: 'Ab Wheel Rollout',
    targetMuscleGroup: 'Core',
    secondaryMuscles: ['Shoulders', 'Lats'],
    equipmentRequired: 'Ab Wheel',
    difficulty: 'MEDIUM',
    category: 'FUNCTIONAL',
    exerciseType: 'BODYWEIGHT',
    isCompound: false,
    instructions:
      'Kneel gripping wheel, roll out keeping core braced, pull back with abs to start position.',
  },
  {
    id: 'ex-mountain-climber',
    name: 'Mountain Climber',
    targetMuscleGroup: 'Core',
    secondaryMuscles: ['Shoulders', 'Hip Flexors'],
    equipmentRequired: 'None',
    difficulty: 'EASY',
    category: 'FUNCTIONAL',
    exerciseType: 'BODYWEIGHT',
    isCompound: false,
    instructions: 'In plank, drive knees alternately toward chest at a fast pace keeping hips low.',
  },
  {
    id: 'ex-dead-bug',
    name: 'Dead Bug',
    targetMuscleGroup: 'Core',
    secondaryMuscles: [],
    equipmentRequired: 'None',
    difficulty: 'EASY',
    category: 'FUNCTIONAL',
    exerciseType: 'BODYWEIGHT',
    isCompound: false,
    instructions:
      'Lie on back, arms up and knees over hips, lower opposite arm/leg keeping low back flat.',
  },
  {
    id: 'ex-bird-dog',
    name: 'Bird Dog',
    targetMuscleGroup: 'Core',
    secondaryMuscles: ['Glutes', 'Lower Back'],
    equipmentRequired: 'None',
    difficulty: 'EASY',
    category: 'FUNCTIONAL',
    exerciseType: 'BODYWEIGHT',
    isCompound: false,
    instructions:
      'On hands and knees, extend opposite arm and leg, hold briefly, return, alternate.',
  },
  {
    id: 'ex-pallof-press',
    name: 'Pallof Press',
    targetMuscleGroup: 'Core',
    secondaryMuscles: ['Obliques', 'Shoulders'],
    equipmentRequired: 'Cable Machine',
    difficulty: 'EASY',
    category: 'FUNCTIONAL',
    exerciseType: 'WEIGHTED',
    isCompound: false,
    instructions:
      'Stand sideways to cable, press handle straight out resisting rotation, return to chest.',
  },

  // ── Olympic / Power ───────────────────────────────────────────────────────
  {
    id: 'ex-clean-and-press',
    name: 'Clean and Press',
    targetMuscleGroup: 'Full Body',
    secondaryMuscles: ['Shoulders', 'Quadriceps', 'Back'],
    equipmentRequired: 'Barbell',
    difficulty: 'HARD',
    category: 'STRENGTH',
    exerciseType: 'WEIGHTED',
    isCompound: true,
    instructions: 'Pull bar from floor to shoulders in one motion, then press overhead to lockout.',
  },
  {
    id: 'ex-push-press',
    name: 'Push Press',
    targetMuscleGroup: 'Shoulders',
    secondaryMuscles: ['Triceps', 'Quadriceps', 'Core'],
    equipmentRequired: 'Barbell',
    difficulty: 'MEDIUM',
    category: 'STRENGTH',
    exerciseType: 'WEIGHTED',
    isCompound: true,
    instructions:
      'Bar at shoulders, dip slightly with legs, drive up using leg power to press bar overhead.',
  },
  {
    id: 'ex-thruster',
    name: 'Thruster',
    targetMuscleGroup: 'Full Body',
    secondaryMuscles: ['Quadriceps', 'Shoulders', 'Glutes'],
    equipmentRequired: 'Barbell or Dumbbells',
    difficulty: 'MEDIUM',
    category: 'STRENGTH',
    exerciseType: 'WEIGHTED',
    isCompound: true,
    instructions:
      'Front squat down, drive up explosively and use momentum to press weight overhead.',
  },
  {
    id: 'ex-kettlebell-swing',
    name: 'Kettlebell Swing',
    targetMuscleGroup: 'Glutes',
    secondaryMuscles: ['Hamstrings', 'Core', 'Shoulders'],
    equipmentRequired: 'Kettlebell',
    difficulty: 'MEDIUM',
    category: 'FUNCTIONAL',
    exerciseType: 'WEIGHTED',
    isCompound: true,
    instructions:
      'Hinge at hips, swing kettlebell between legs, snap hips forward to drive bell to chest height.',
  },
  {
    id: 'ex-farmers-carry',
    name: "Farmer's Carry",
    targetMuscleGroup: 'Full Body',
    secondaryMuscles: ['Forearms', 'Traps', 'Core'],
    equipmentRequired: 'Dumbbells or Kettlebells',
    difficulty: 'MEDIUM',
    category: 'FUNCTIONAL',
    exerciseType: 'DURATION',
    isCompound: true,
    instructions:
      'Hold heavy load at sides, walk a set distance/time keeping torso tall and shoulders packed.',
  },
  {
    id: 'ex-turkish-getup',
    name: 'Turkish Get-up',
    targetMuscleGroup: 'Full Body',
    secondaryMuscles: ['Shoulders', 'Core', 'Glutes'],
    equipmentRequired: 'Kettlebell or Dumbbell',
    difficulty: 'HARD',
    category: 'FUNCTIONAL',
    exerciseType: 'WEIGHTED',
    isCompound: true,
    instructions:
      'From lying, press weight overhead and stand up while keeping arm locked out, reverse to start.',
  },

  // ── Cardio ────────────────────────────────────────────────────────────────
  {
    id: 'ex-stair-climber',
    name: 'Stair Climber',
    targetMuscleGroup: 'Full Body',
    secondaryMuscles: ['Quadriceps', 'Glutes', 'Calves'],
    equipmentRequired: 'Stair Climber Machine',
    difficulty: 'EASY',
    category: 'CARDIO',
    exerciseType: 'CARDIO',
    isCompound: true,
    instructions:
      'Step at steady cadence keeping torso upright; avoid leaning on handrails for full effort.',
  },
  {
    id: 'ex-elliptical',
    name: 'Elliptical',
    targetMuscleGroup: 'Full Body',
    secondaryMuscles: ['Quadriceps', 'Glutes', 'Calves'],
    equipmentRequired: 'Elliptical Trainer',
    difficulty: 'EASY',
    category: 'CARDIO',
    exerciseType: 'CARDIO',
    isCompound: true,
    instructions:
      'Drive through heels, push and pull arms in rhythm, vary resistance and incline as needed.',
  },
  {
    id: 'ex-jump-rope',
    name: 'Jump Rope',
    targetMuscleGroup: 'Full Body',
    secondaryMuscles: ['Calves', 'Shoulders', 'Core'],
    equipmentRequired: 'Jump Rope',
    difficulty: 'EASY',
    category: 'CARDIO',
    exerciseType: 'CARDIO',
    isCompound: true,
    instructions: 'Bounce on balls of feet, rotate rope from wrists, keep elbows close to torso.',
  },
  {
    id: 'ex-battle-ropes',
    name: 'Battle Ropes',
    targetMuscleGroup: 'Full Body',
    secondaryMuscles: ['Shoulders', 'Core', 'Forearms'],
    equipmentRequired: 'Battle Ropes',
    difficulty: 'MEDIUM',
    category: 'CARDIO',
    exerciseType: 'CARDIO',
    isCompound: true,
    instructions:
      'Grip rope ends, drive waves continuously with alternating or simultaneous arm slams.',
  },
  {
    id: 'ex-sled-push',
    name: 'Sled Push',
    targetMuscleGroup: 'Full Body',
    secondaryMuscles: ['Quadriceps', 'Glutes', 'Calves'],
    equipmentRequired: 'Sled',
    difficulty: 'MEDIUM',
    category: 'FUNCTIONAL',
    exerciseType: 'CARDIO',
    isCompound: true,
    instructions:
      'Brace against sled handles in low stance, drive sled forward with powerful leg drives.',
  },
  {
    id: 'ex-burpee',
    name: 'Burpee',
    targetMuscleGroup: 'Full Body',
    secondaryMuscles: ['Chest', 'Quadriceps', 'Core'],
    equipmentRequired: 'None',
    difficulty: 'MEDIUM',
    category: 'FUNCTIONAL',
    exerciseType: 'BODYWEIGHT',
    isCompound: true,
    instructions:
      'Squat, hands down, kick feet back to plank, push-up (optional), jump feet forward, stand and jump.',
  },

  // ── Flexibility ───────────────────────────────────────────────────────────
  {
    id: 'ex-hamstring-stretch',
    name: 'Hamstring Stretch',
    targetMuscleGroup: 'Hamstrings',
    secondaryMuscles: ['Calves'],
    equipmentRequired: 'None',
    difficulty: 'EASY',
    category: 'FLEXIBILITY',
    exerciseType: 'DURATION',
    isCompound: false,
    instructions:
      'Sit or stand, hinge at hips reaching toward toes, hold the stretch breathing slowly.',
  },
  {
    id: 'ex-hip-flexor-stretch',
    name: 'Hip Flexor Stretch',
    targetMuscleGroup: 'Hip Flexors',
    secondaryMuscles: ['Quadriceps'],
    equipmentRequired: 'None',
    difficulty: 'EASY',
    category: 'FLEXIBILITY',
    exerciseType: 'DURATION',
    isCompound: false,
    instructions:
      'Half-kneel, tuck pelvis and shift hips forward feeling stretch in front of rear hip, hold.',
  },
  {
    id: 'ex-pigeon-pose',
    name: 'Pigeon Pose',
    targetMuscleGroup: 'Glutes',
    secondaryMuscles: ['Hip Flexors'],
    equipmentRequired: 'None',
    difficulty: 'EASY',
    category: 'FLEXIBILITY',
    exerciseType: 'DURATION',
    isCompound: false,
    instructions:
      'From all fours, bring one shin forward angled, extend back leg, sink hips, hold and breathe.',
  },
  {
    id: 'ex-cat-cow',
    name: 'Cat-Cow',
    targetMuscleGroup: 'Spine',
    secondaryMuscles: ['Core'],
    equipmentRequired: 'None',
    difficulty: 'EASY',
    category: 'FLEXIBILITY',
    exerciseType: 'DURATION',
    isCompound: false,
    instructions:
      'On hands and knees, alternate arching back and rounding spine in rhythm with breath.',
  },
  {
    id: 'ex-foam-rolling',
    name: 'Foam Rolling',
    targetMuscleGroup: 'Full Body',
    secondaryMuscles: [],
    equipmentRequired: 'Foam Roller',
    difficulty: 'EASY',
    category: 'FLEXIBILITY',
    exerciseType: 'DURATION',
    isCompound: false,
    instructions:
      'Roll target muscle slowly over foam roller, pausing on tight spots and breathing through tension.',
  },
];

async function main() {
  const existing = await prisma.exercise.findMany({ select: { name: true } });
  const existingNames = new Set(existing.map((e) => e.name.toLowerCase().trim()));

  const toInsert = NEW_EXERCISES.filter((ex) => !existingNames.has(ex.name.toLowerCase().trim()));
  const skipped = NEW_EXERCISES.filter((ex) => existingNames.has(ex.name.toLowerCase().trim()));

  console.log(`Existing exercises in DB: ${existing.length}`);
  console.log(`Candidates: ${NEW_EXERCISES.length}`);
  console.log(`Already present (skipped): ${skipped.length}`);
  if (skipped.length) skipped.forEach((s) => console.log(`  - ${s.name}`));
  console.log(`To insert: ${toInsert.length}\n`);

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
