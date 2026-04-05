/**
 * Seed comprehensive badge definitions for Sector 7.
 *
 * Run:  npx tsx prisma/seed-badges.ts
 *
 * Clears existing badge data (user_badges + badge_definitions) and re-seeds
 * with a motivational badge catalogue covering every exercise and milestone type.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ─── Helper types ──────────────────────────────────────────────────────────

type BadgeSeed = {
  type:
    | 'STREAK'
    | 'SESSION_MILESTONE'
    | 'PERSONAL_RECORD'
    | 'BODY_COMPOSITION'
    | 'WEIGHT_LIFTED'
    | 'EXERCISE_MILESTONE';
  name: string;
  description: string;
  howToEarn: string;
  icon: string;
  thresholdValue: number | null;
  thresholdUnit?: 'KG' | 'REPS' | 'SECONDS' | null;
  durationCondition?: 'LONGER_IS_BETTER' | 'SHORTER_IS_BETTER' | null;
  genderFilter?: 'ALL' | 'MALE' | 'FEMALE';
  exerciseId?: string | null;
};

// ─── STREAK BADGES ─────────────────────────────────────────────────────────

const STREAKS: BadgeSeed[] = [
  {
    type: 'STREAK',
    name: 'Getting Started',
    description: '3 sessions in a row — the habit is forming.',
    howToEarn: 'Attend 3 sessions without missing a week.',
    icon: '🌱',
    thresholdValue: 3,
  },
  {
    type: 'STREAK',
    name: 'On a Roll',
    description: '5 sessions in a row — momentum is building!',
    howToEarn: 'Attend 5 sessions without missing a week.',
    icon: '🔥',
    thresholdValue: 5,
  },
  {
    type: 'STREAK',
    name: 'Momentum Builder',
    description: '10 sessions straight. You show up. Every. Single. Time.',
    howToEarn: 'Attend 10 sessions without missing a week.',
    icon: '⚡',
    thresholdValue: 10,
  },
  {
    type: 'STREAK',
    name: 'Consistency King',
    description: '25 sessions without breaking the chain. Consistency is your superpower.',
    howToEarn: 'Attend 25 sessions without missing a week.',
    icon: '👑',
    thresholdValue: 25,
  },
  {
    type: 'STREAK',
    name: 'Iron Discipline',
    description: '50 sessions unbroken. Your discipline inspires everyone at Sector 7.',
    howToEarn: 'Attend 50 sessions without missing a week.',
    icon: '🦾',
    thresholdValue: 50,
  },
  {
    type: 'STREAK',
    name: 'Unstoppable Force',
    description: '100 sessions without a break. You ARE the gym.',
    howToEarn: 'Attend 100 sessions without missing a week.',
    icon: '💎',
    thresholdValue: 100,
  },
];

// ─── SESSION MILESTONES ────────────────────────────────────────────────────

const SESSION_MILESTONES: BadgeSeed[] = [
  {
    type: 'SESSION_MILESTONE',
    name: 'First Step',
    description: 'Completed your very first session. Every journey starts here.',
    howToEarn: 'Complete 1 training session.',
    icon: '👟',
    thresholdValue: 1,
  },
  {
    type: 'SESSION_MILESTONE',
    name: 'First 10',
    description: "10 sessions done. You're officially committed.",
    howToEarn: 'Complete 10 training sessions.',
    icon: '🎯',
    thresholdValue: 10,
  },
  {
    type: 'SESSION_MILESTONE',
    name: 'Quarter Century',
    description: '25 sessions in the books. The foundation is rock solid.',
    howToEarn: 'Complete 25 training sessions.',
    icon: '💪',
    thresholdValue: 25,
  },
  {
    type: 'SESSION_MILESTONE',
    name: 'Half Century',
    description: '50 sessions completed — halfway to the triple digits!',
    howToEarn: 'Complete 50 training sessions.',
    icon: '🏅',
    thresholdValue: 50,
  },
  {
    type: 'SESSION_MILESTONE',
    name: 'Century Club',
    description: "100 sessions. You're part of an elite group at Sector 7.",
    howToEarn: 'Complete 100 training sessions.',
    icon: '🏆',
    thresholdValue: 100,
  },
  {
    type: 'SESSION_MILESTONE',
    name: 'Sector 7 Legend',
    description: '200 sessions. Your name belongs on the wall.',
    howToEarn: 'Complete 200 training sessions.',
    icon: '🌟',
    thresholdValue: 200,
  },
  {
    type: 'SESSION_MILESTONE',
    name: 'Hall of Fame',
    description: '500 sessions. You are Sector 7.',
    howToEarn: 'Complete 500 training sessions.',
    icon: '🏛️',
    thresholdValue: 500,
  },
];

// ─── PERSONAL RECORD ───────────────────────────────────────────────────────

const PERSONAL_RECORDS: BadgeSeed[] = [
  {
    type: 'PERSONAL_RECORD',
    name: 'New Personal Best',
    description: "You just lifted more than ever before. That's growth.",
    howToEarn: 'Beat your previous best weight on any exercise.',
    icon: '🚀',
    thresholdValue: null,
  },
];

// ─── BODY COMPOSITION ──────────────────────────────────────────────────────

const BODY_COMPOSITION: BadgeSeed[] = [
  {
    type: 'BODY_COMPOSITION',
    name: 'First Milestone',
    description: 'Lost your first 2 kg. The hardest part is starting — and you did.',
    howToEarn: 'Lose 2 kg from your starting weight.',
    icon: '⚖️',
    thresholdValue: 2,
  },
  {
    type: 'BODY_COMPOSITION',
    name: 'Steady Progress',
    description: '5 kg down. Your clothes fit different. People notice.',
    howToEarn: 'Lose 5 kg from your starting weight.',
    icon: '📉',
    thresholdValue: 5,
  },
  {
    type: 'BODY_COMPOSITION',
    name: 'Transformation',
    description: "10 kg lost. You're not the same person who walked in.",
    howToEarn: 'Lose 10 kg from your starting weight.',
    icon: '✨',
    thresholdValue: 10,
  },
  {
    type: 'BODY_COMPOSITION',
    name: 'Complete Metamorphosis',
    description: "15 kg shed. Before & after photos don't even look like the same person.",
    howToEarn: 'Lose 15 kg from your starting weight.',
    icon: '🦋',
    thresholdValue: 15,
  },
  {
    type: 'BODY_COMPOSITION',
    name: 'New You',
    description: "20 kg lost. You've literally transformed your life.",
    howToEarn: 'Lose 20 kg from your starting weight.',
    icon: '🔥',
    thresholdValue: 20,
  },
];

// ─── EXERCISE MILESTONES (Weighted — KG) ───────────────────────────────────

function weightedMilestones(
  exerciseId: string,
  exerciseName: string,
  tiers: {
    kg: number;
    name: string;
    desc: string;
    icon: string;
    gender?: 'ALL' | 'MALE' | 'FEMALE';
  }[],
): BadgeSeed[] {
  return tiers.map((t) => ({
    type: 'EXERCISE_MILESTONE' as const,
    name: t.name,
    description: t.desc,
    howToEarn: `Lift ${t.kg} kg on ${exerciseName} in a single set.`,
    icon: t.icon,
    thresholdValue: t.kg,
    thresholdUnit: 'KG' as const,
    exerciseId,
    genderFilter: t.gender ?? ('ALL' as const),
  }));
}

const WEIGHTED_MILESTONES: BadgeSeed[] = [
  // ── Bench Press ──
  ...weightedMilestones('ex-bench-press', 'Bench Press', [
    { kg: 40, name: 'Bench Beginner', desc: 'Pressed 40 kg. Your chest is waking up!', icon: '🏋️' },
    {
      kg: 60,
      name: 'Bench Intermediate',
      desc: '60 kg bench — solid upper body strength.',
      icon: '💥',
    },
    { kg: 80, name: 'Bench Advanced', desc: '80 kg on the bar. Respect earned.', icon: '🔱' },
    {
      kg: 100,
      name: '100 Club – Bench',
      desc: 'Triple digits on bench press. Elite.',
      icon: '👑',
      gender: 'MALE',
    },
    {
      kg: 60,
      name: 'Strong Press – Women',
      desc: "60 kg bench press. You're breaking barriers.",
      icon: '👑',
      gender: 'FEMALE',
    },
  ]),

  // ── Barbell Squat ──
  ...weightedMilestones('ex-squat', 'Barbell Squat', [
    {
      kg: 40,
      name: 'Squat Starter',
      desc: '40 kg squat — building from the ground up.',
      icon: '🦵',
    },
    {
      kg: 60,
      name: 'Squat Solid',
      desc: '60 kg under the bar. Your legs are getting strong.',
      icon: '⚡',
    },
    {
      kg: 80,
      name: 'Squat Strong',
      desc: '80 kg squat. Your lower body is a powerhouse.',
      icon: '🔥',
    },
    {
      kg: 100,
      name: '100 Club – Squat',
      desc: 'Triple digit squat. The floor shakes when you walk.',
      icon: '🏆',
      gender: 'MALE',
    },
    {
      kg: 70,
      name: 'Power Squat – Women',
      desc: '70 kg squat. Absolute power.',
      icon: '🏆',
      gender: 'FEMALE',
    },
  ]),

  // ── Deadlift ──
  ...weightedMilestones('ex-deadlift', 'Deadlift', [
    {
      kg: 60,
      name: 'Deadlift Debut',
      desc: '60 kg off the floor. The king of lifts has begun.',
      icon: '🏗️',
    },
    {
      kg: 80,
      name: 'Deadlift Rising',
      desc: '80 kg deadlift. Your back and grip are serious.',
      icon: '⛓️',
    },
    { kg: 100, name: '100 Club – Deadlift', desc: 'Triple digit deadlift. Raw power.', icon: '💪' },
    {
      kg: 140,
      name: 'Deadlift Destroyer',
      desc: '140 kg. You could lift a person with one hand.',
      icon: '🦍',
      gender: 'MALE',
    },
    {
      kg: 80,
      name: 'Deadlift Queen',
      desc: '80 kg deadlift. You own the platform.',
      icon: '👸',
      gender: 'FEMALE',
    },
  ]),

  // ── Overhead Press ──
  ...weightedMilestones('ex-ohp', 'Overhead Press', [
    { kg: 20, name: 'Press Start', desc: '20 kg overhead. Shoulders are firing.', icon: '🙌' },
    {
      kg: 40,
      name: 'Shoulder Soldier',
      desc: '40 kg overhead press. Strong shoulders, strong foundation.',
      icon: '🎖️',
    },
    {
      kg: 60,
      name: 'OHP Beast',
      desc: "60 kg pressed overhead. That's impressive by any standard.",
      icon: '🦁',
    },
  ]),

  // ── Barbell Row ──
  ...weightedMilestones('ex-row', 'Barbell Row', [
    { kg: 40, name: 'Row Rookie', desc: '40 kg barbell row. Your back is growing.', icon: '🚣' },
    { kg: 60, name: 'Row Power', desc: '60 kg rows. A thick, strong back is forming.', icon: '💪' },
    {
      kg: 80,
      name: 'Row Machine',
      desc: '80 kg barbell row. Your back is a wall of muscle.',
      icon: '🏔️',
    },
  ]),

  // ── Leg Press ──
  ...weightedMilestones('ex-leg-press', 'Leg Press', [
    {
      kg: 80,
      name: 'Leg Press Starter',
      desc: '80 kg on the leg press. Legs day warrior.',
      icon: '🦿',
    },
    {
      kg: 140,
      name: 'Leg Press Power',
      desc: "140 kg leg press. Your legs don't skip leg day.",
      icon: '⚡',
    },
    {
      kg: 200,
      name: 'Leg Press Monster',
      desc: '200 kg on the sled. Absolutely monstrous.',
      icon: '🦖',
    },
  ]),

  // ── Romanian Deadlift ──
  ...weightedMilestones('ex-rdl', 'Romanian Deadlift', [
    {
      kg: 40,
      name: 'RDL Foundation',
      desc: '40 kg RDL — hamstrings and glutes are engaged.',
      icon: '🎯',
    },
    {
      kg: 60,
      name: 'RDL Strong',
      desc: '60 kg Romanian deadlift. Posterior chain of steel.',
      icon: '🔗',
    },
    {
      kg: 80,
      name: 'RDL Master',
      desc: '80 kg RDL. Your hamstrings could stop traffic.',
      icon: '🛡️',
    },
  ]),

  // ── Lat Pulldown ──
  ...weightedMilestones('ex-lat-pulldown', 'Lat Pulldown', [
    {
      kg: 40,
      name: 'Pulldown Beginner',
      desc: '40 kg lat pulldown. Wings are spreading.',
      icon: '🪽',
    },
    {
      kg: 60,
      name: 'Pulldown Power',
      desc: '60 kg pulldown. Your lats are building width.',
      icon: '🦅',
    },
    { kg: 80, name: 'Pulldown Pro', desc: '80 kg lat pulldown. V-taper incoming.', icon: '💎' },
  ]),

  // ── Dumbbell Shoulder Press ──
  ...weightedMilestones('ex-db-shoulder-press', 'Dumbbell Shoulder Press', [
    {
      kg: 15,
      name: 'DB Press Starter',
      desc: '15 kg per hand. Shoulders are on fire.',
      icon: '🔥',
    },
    {
      kg: 25,
      name: 'DB Press Strong',
      desc: '25 kg dumbbells overhead. Boulder shoulders loading.',
      icon: '🗿',
    },
    {
      kg: 35,
      name: 'DB Press Elite',
      desc: "35 kg per dumbbell. You're pressing serious weight.",
      icon: '⭐',
    },
  ]),

  // ── Incline Dumbbell Press ──
  ...weightedMilestones('ex-incline-db-press', 'Incline Dumbbell Press', [
    {
      kg: 15,
      name: 'Incline Starter',
      desc: '15 kg per hand on incline. Upper chest activated.',
      icon: '📐',
    },
    {
      kg: 25,
      name: 'Incline Strong',
      desc: '25 kg incline press. Your upper chest is filling out.',
      icon: '💥',
    },
    {
      kg: 35,
      name: 'Incline Elite',
      desc: '35 kg per dumbbell on incline. Chest of champions.',
      icon: '🏅',
    },
  ]),

  // ── Bicep Curl ──
  ...weightedMilestones('ex-curl', 'Bicep Curl', [
    { kg: 10, name: 'Curl Starter', desc: '10 kg curls. The gun show begins.', icon: '💪' },
    { kg: 15, name: 'Curl Solid', desc: '15 kg bicep curls. Arms are filling out.', icon: '🔱' },
    {
      kg: 20,
      name: 'Curl Master',
      desc: '20 kg curls. Your sleeves are feeling tight.',
      icon: '🦾',
    },
  ]),

  // ── Hammer Curl ──
  ...weightedMilestones('ex-hammer-curl', 'Hammer Curl', [
    {
      kg: 10,
      name: 'Hammer Time Starter',
      desc: '10 kg hammer curls. Forearms and biceps working.',
      icon: '🔨',
    },
    { kg: 15, name: 'Hammer Solid', desc: '15 kg hammers. Brachialis is popping.', icon: '⚒️' },
    {
      kg: 20,
      name: 'Hammer Master',
      desc: '20 kg hammer curls. Arm thickness unlocked.',
      icon: '🛠️',
    },
  ]),

  // ── Tricep Pushdown ──
  ...weightedMilestones('ex-tricep-pushdown', 'Tricep Pushdown', [
    {
      kg: 20,
      name: 'Pushdown Starter',
      desc: '20 kg tricep pushdown. Horseshoe loading.',
      icon: '🐴',
    },
    {
      kg: 35,
      name: 'Pushdown Strong',
      desc: '35 kg pushdown. Your triceps are sculpted.',
      icon: '💎',
    },
    { kg: 50, name: 'Pushdown Beast', desc: '50 kg tricep pushdown. Arms of steel.', icon: '⚔️' },
  ]),

  // ── Cable Fly ──
  ...weightedMilestones('ex-cable-fly', 'Cable Fly', [
    { kg: 10, name: 'Fly Starter', desc: '10 kg cable fly. Chest isolation begins.', icon: '🦋' },
    {
      kg: 20,
      name: 'Fly Strong',
      desc: '20 kg cable fly. Chest definition is showing.',
      icon: '🎯',
    },
    { kg: 30, name: 'Fly Master', desc: '30 kg cable fly. Pecs of granite.', icon: '🗿' },
  ]),

  // ── Seated Cable Row ──
  ...weightedMilestones('ex-seated-cable-row', 'Seated Cable Row', [
    {
      kg: 30,
      name: 'Cable Row Starter',
      desc: '30 kg seated row. Back width is building.',
      icon: '🚣',
    },
    { kg: 50, name: 'Cable Row Power', desc: '50 kg seated row. Thick back forming.', icon: '🏋️' },
    {
      kg: 70,
      name: 'Cable Row Master',
      desc: '70 kg seated row. Your back is a fortress.',
      icon: '🏰',
    },
  ]),

  // ── Leg Curl ──
  ...weightedMilestones('ex-leg-curl', 'Leg Curl', [
    {
      kg: 20,
      name: 'Curl Those Legs',
      desc: '20 kg leg curl. Hamstrings are waking up.',
      icon: '🦵',
    },
    {
      kg: 40,
      name: 'Leg Curl Strong',
      desc: '40 kg leg curls. Strong hamstrings protect your knees.',
      icon: '🛡️',
    },
    { kg: 60, name: 'Leg Curl Beast', desc: '60 kg leg curl. Hamstrings of steel.', icon: '⚡' },
  ]),

  // ── Standing Calf Raise ──
  ...weightedMilestones('ex-calf-raise', 'Standing Calf Raise', [
    { kg: 40, name: 'Calf Starter', desc: '40 kg calf raise. No more chicken legs.', icon: '🐔' },
    { kg: 80, name: 'Calf Strong', desc: '80 kg calf raises. Diamond calves forming.', icon: '💎' },
    {
      kg: 120,
      name: 'Calf Legend',
      desc: '120 kg calf raise. Your calves have their own zip code.',
      icon: '🏔️',
    },
  ]),
];

// ─── EXERCISE MILESTONES (Bodyweight — REPS) ───────────────────────────────

function bodyweightMilestones(
  exerciseId: string,
  exerciseName: string,
  tiers: { reps: number; name: string; desc: string; icon: string }[],
): BadgeSeed[] {
  return tiers.map((t) => ({
    type: 'EXERCISE_MILESTONE' as const,
    name: t.name,
    description: t.desc,
    howToEarn: `Complete ${t.reps} ${exerciseName.toLowerCase()}s in a single set.`,
    icon: t.icon,
    thresholdValue: t.reps,
    thresholdUnit: 'REPS' as const,
    exerciseId,
  }));
}

const BODYWEIGHT_MILESTONES: BadgeSeed[] = [
  // ── Push-ups ──
  ...bodyweightMilestones('ex-pushup', 'Push-up', [
    {
      reps: 10,
      name: 'Push-up Starter',
      desc: '10 push-ups in one set. Your chest is thanking you.',
      icon: '✋',
    },
    {
      reps: 25,
      name: 'Push-up Warrior',
      desc: '25 push-ups straight. Upper body endurance unlocked.',
      icon: '⚔️',
    },
    {
      reps: 50,
      name: 'Push-up Machine',
      desc: "50 push-ups in a set. You're basically a machine.",
      icon: '🤖',
    },
    {
      reps: 100,
      name: 'Push-up Legend',
      desc: "100 push-ups. You don't need a gym, you ARE the gym.",
      icon: '🦸',
    },
  ]),

  // ── Pull-ups ──
  ...bodyweightMilestones('ex-pullup', 'Pull-up', [
    {
      reps: 1,
      name: 'First Pull-up',
      desc: 'Your very first pull-up. Most people never get here.',
      icon: '🎉',
    },
    {
      reps: 5,
      name: 'Pull-up Solid',
      desc: '5 pull-ups. Your relative strength is impressive.',
      icon: '💪',
    },
    {
      reps: 10,
      name: 'Pull-up Pro',
      desc: '10 pull-ups in a row. Your back is built for this.',
      icon: '🦅',
    },
    {
      reps: 20,
      name: 'Pull-up Beast',
      desc: "20 pull-ups. Gravity doesn't apply to you.",
      icon: '🦍',
    },
  ]),

  // ── Dips ──
  ...bodyweightMilestones('ex-dip', 'Dip', [
    {
      reps: 5,
      name: 'Dip Beginner',
      desc: '5 dips. Triceps and chest working together.',
      icon: '🔽',
    },
    {
      reps: 10,
      name: 'Dip Solid',
      desc: '10 dips straight. Upper body pushing power is real.',
      icon: '⬇️',
    },
    {
      reps: 20,
      name: 'Dip Master',
      desc: '20 dips in a set. Your arms and chest are on fire.',
      icon: '🔥',
    },
  ]),

  // ── Bodyweight Squat ──
  ...bodyweightMilestones('ex-bw-squat', 'Bodyweight Squat', [
    { reps: 20, name: 'Squat Flow', desc: '20 bodyweight squats. Legs are pumped.', icon: '🏃' },
    {
      reps: 50,
      name: 'Squat Endurance',
      desc: "50 squats in one set. Your legs don't quit.",
      icon: '🦿',
    },
    {
      reps: 100,
      name: 'Squat Century',
      desc: '100 bodyweight squats. Cardiovascular and muscular endurance at its peak.',
      icon: '💯',
    },
  ]),

  // ── Walking Lunge ──
  ...bodyweightMilestones('ex-lunge', 'Walking Lunge', [
    {
      reps: 10,
      name: 'Lunge Starter',
      desc: '10 walking lunges. Balance and strength in motion.',
      icon: '🚶',
    },
    {
      reps: 20,
      name: 'Lunge Warrior',
      desc: '20 walking lunges. Your legs are burning in the best way.',
      icon: '🔥',
    },
    {
      reps: 40,
      name: 'Lunge Marathon',
      desc: '40 walking lunges in a set. Unreal endurance.',
      icon: '🏅',
    },
  ]),
];

// ─── EXERCISE MILESTONES (Duration — SECONDS) ─────────────────────────────

function durationMilestones(
  exerciseId: string,
  exerciseName: string,
  condition: 'LONGER_IS_BETTER' | 'SHORTER_IS_BETTER',
  tiers: { seconds: number; name: string; desc: string; icon: string }[],
): BadgeSeed[] {
  return tiers.map((t) => ({
    type: 'EXERCISE_MILESTONE' as const,
    name: t.name,
    description: t.desc,
    howToEarn:
      condition === 'LONGER_IS_BETTER'
        ? `Hold ${exerciseName.toLowerCase()} for at least ${t.seconds} seconds.`
        : `Complete ${exerciseName.toLowerCase()} in under ${t.seconds} seconds.`,
    icon: t.icon,
    thresholdValue: t.seconds,
    thresholdUnit: 'SECONDS' as const,
    durationCondition: condition,
    exerciseId,
  }));
}

const DURATION_MILESTONES: BadgeSeed[] = [
  // ── Plank (longer is better) ──
  ...durationMilestones('ex-plank', 'Plank', 'LONGER_IS_BETTER', [
    { seconds: 30, name: 'Plank Starter', desc: '30 seconds plank. Core activated.', icon: '🧱' },
    { seconds: 60, name: 'Plank Minute', desc: '1 minute plank. Your core is solid.', icon: '⏱️' },
    { seconds: 120, name: 'Plank Warrior', desc: '2 minutes plank. Iron core.', icon: '🛡️' },
    {
      seconds: 180,
      name: 'Plank Master',
      desc: '3 minutes plank. You could hold up a building.',
      icon: '🏗️',
    },
    {
      seconds: 300,
      name: 'Plank Legend',
      desc: '5 minutes. Your core is made of titanium.',
      icon: '🏆',
    },
  ]),

  // ── Wall Sit (longer is better) ──
  ...durationMilestones('ex-wall-sit', 'Wall Sit', 'LONGER_IS_BETTER', [
    {
      seconds: 30,
      name: 'Wall Sit Starter',
      desc: '30 seconds against the wall. Quads burning.',
      icon: '🧱',
    },
    {
      seconds: 60,
      name: 'Wall Sit Minute',
      desc: '1 minute wall sit. Your legs refuse to quit.',
      icon: '⏱️',
    },
    {
      seconds: 120,
      name: 'Wall Sit Warrior',
      desc: '2 minutes wall sit. Legs of concrete.',
      icon: '🗿',
    },
    {
      seconds: 180,
      name: 'Wall Sit Master',
      desc: "3 minutes. You're part of the wall now.",
      icon: '🏰',
    },
  ]),

  // ── Side Plank (longer is better) ──
  ...durationMilestones('ex-side-plank', 'Side Plank', 'LONGER_IS_BETTER', [
    {
      seconds: 20,
      name: 'Side Plank Starter',
      desc: '20 seconds side plank. Obliques engaged.',
      icon: '↗️',
    },
    {
      seconds: 45,
      name: 'Side Plank Solid',
      desc: '45 seconds per side. Core stability improving.',
      icon: '⚖️',
    },
    {
      seconds: 60,
      name: 'Side Plank Strong',
      desc: '1 minute side plank. Your obliques are steel cables.',
      icon: '🔗',
    },
    {
      seconds: 90,
      name: 'Side Plank Master',
      desc: '90 seconds side plank. Unshakeable core.',
      icon: '💎',
    },
  ]),
];

// ─── EXERCISE MILESTONES (Cardio — SECONDS, shorter is better) ─────────

const CARDIO_MILESTONES: BadgeSeed[] = [
  // ── Treadmill Run (shorter is better = faster pace records) ──
  // Note: these represent time to complete a reference distance set by the trainer
  ...durationMilestones('ex-treadmill', 'Treadmill Run', 'SHORTER_IS_BETTER', [
    {
      seconds: 600,
      name: 'First Run',
      desc: 'Completed a timed run under 10 minutes. You showed up and ran.',
      icon: '🏃',
    },
    {
      seconds: 480,
      name: 'Getting Faster',
      desc: 'Under 8 minutes. Your cardio is levelling up.',
      icon: '💨',
    },
    {
      seconds: 360,
      name: 'Speed Runner',
      desc: "Under 6 minutes. You're fast and you know it.",
      icon: '⚡',
    },
  ]),

  // ── Rowing Machine (shorter is better for timed challenges) ──
  ...durationMilestones('ex-rowing', 'Rowing Machine', 'SHORTER_IS_BETTER', [
    {
      seconds: 600,
      name: 'Row Starter',
      desc: 'Completed a rowing challenge under 10 minutes.',
      icon: '🚣',
    },
    {
      seconds: 480,
      name: 'Row Racer',
      desc: 'Under 8 minutes on the rower. Smooth and strong.',
      icon: '🏄',
    },
    {
      seconds: 360,
      name: 'Row Machine',
      desc: 'Under 6 minutes. You dominate the rower.',
      icon: '🔱',
    },
  ]),

  // ── Stationary Cycling (shorter is better for timed challenges) ──
  ...durationMilestones('ex-cycling', 'Stationary Cycling', 'SHORTER_IS_BETTER', [
    {
      seconds: 900,
      name: 'Cycle Starter',
      desc: 'Completed a cycling challenge under 15 minutes.',
      icon: '🚴',
    },
    {
      seconds: 600,
      name: 'Cycle Strong',
      desc: 'Under 10 minutes. Your legs are engines.',
      icon: '⚡',
    },
    { seconds: 420, name: 'Cycle Speedster', desc: 'Under 7 minutes. Lance who?', icon: '🏎️' },
  ]),
];

// ─── COMBINE ALL ───────────────────────────────────────────────────────────

const ALL_BADGES: BadgeSeed[] = [
  ...STREAKS,
  ...SESSION_MILESTONES,
  ...PERSONAL_RECORDS,
  ...BODY_COMPOSITION,
  ...WEIGHTED_MILESTONES,
  ...BODYWEIGHT_MILESTONES,
  ...DURATION_MILESTONES,
  ...CARDIO_MILESTONES,
];

// ─── SEED ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('Clearing existing badge data...');
  await prisma.userBadge.deleteMany();
  await prisma.badgeDefinition.deleteMany();
  console.log('  Cleared user_badges and badge_definitions.\n');

  console.log(`Seeding ${ALL_BADGES.length} badge definitions...\n`);

  let count = 0;
  for (const badge of ALL_BADGES) {
    await prisma.badgeDefinition.create({
      data: {
        type: badge.type,
        name: badge.name,
        description: badge.description,
        howToEarn: badge.howToEarn,
        icon: badge.icon,
        thresholdValue: badge.thresholdValue,
        thresholdUnit: badge.thresholdUnit ?? null,
        durationCondition: badge.durationCondition ?? null,
        genderFilter: badge.genderFilter ?? 'ALL',
        exerciseId: badge.exerciseId ?? null,
        isActive: true,
      },
    });
    count++;
    console.log(`  ${badge.icon} ${badge.name}`);
  }

  // Summary by type
  const summary = ALL_BADGES.reduce<Record<string, number>>((acc, b) => {
    acc[b.type] = (acc[b.type] ?? 0) + 1;
    return acc;
  }, {});

  console.log(`\nDone — ${count} badges seeded.`);
  console.log('Breakdown:');
  for (const [type, n] of Object.entries(summary)) {
    console.log(`  ${type}: ${n}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
