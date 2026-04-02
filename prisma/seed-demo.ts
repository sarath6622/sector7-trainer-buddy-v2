/**
 * Demo seed — adds realistic progress measurements + exercise logs for the client demo.
 * Safe to run multiple times (upserts existing entries, skips already-seeded workout logs).
 *
 * Run: npx tsx prisma/seed-demo.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ADMIN_ID = 'cmn5vwbuv00036r8ofx8kcu2x'; // Sarath (branch admin)

// ─── Client profiles ──────────────────────────────────────────────────────────
const C = {
  ananya: 'cmn5vwbvy000j6r8oisfmocnb',
  karthik: 'cmn5vwbw6000n6r8oww8fs0bu',
  meera: 'cmn5vwbwd000r6r8ocqij62oz',
  rohit: 'cmn5vwbwl000v6r8osurobrsc',
  sneha: 'cmn5vwbws000z6r8or35i5bno',
  arun: 'cmn5vwbwy00136r8olflt3d3w',
  ammu: 'cmn9xezpl0021w1fo0yp7gkp1',
};

// ─── Helper ───────────────────────────────────────────────────────────────────
function d(dateStr: string) {
  // dates stored as IST midnight → UTC 18:30 previous day
  return new Date(dateStr + 'T18:30:00.000Z');
}

function jitter(val: number, range = 0.3) {
  return parseFloat((val + (Math.random() - 0.5) * range).toFixed(2));
}

// ─── Progress data per client ─────────────────────────────────────────────────
// Columns: [date, weight, bodyFat%, muscleMass, chest, waist, hips, bicepL, bicepR, thighL, thighR, notes]

const PROGRESS: Record<
  string,
  {
    date: string;
    w: number;
    bf: number;
    mm: number;
    chest?: number;
    waist?: number;
    hips?: number;
    bicepL?: number;
    bicepR?: number;
    thighL?: number;
    thighR?: number;
    notes?: string;
  }[]
> = {
  // ── Ananya Sharma — Female, 27 | Goal: weight loss + toning
  ananya: [
    {
      date: '2026-01-09',
      w: 63.2,
      bf: 29.5,
      mm: 21.0,
      waist: 79,
      hips: 99,
      thighL: 54,
      thighR: 54,
    },
    {
      date: '2026-01-23',
      w: 62.4,
      bf: 28.8,
      mm: 21.3,
      waist: 78,
      hips: 98,
      thighL: 53.5,
      thighR: 53.5,
    },
    {
      date: '2026-02-06',
      w: 61.5,
      bf: 28.0,
      mm: 21.6,
      waist: 77,
      hips: 97.5,
      thighL: 53,
      thighR: 53,
    },
    {
      date: '2026-02-20',
      w: 60.3,
      bf: 27.2,
      mm: 22.0,
      waist: 75.5,
      hips: 96.5,
      thighL: 52.5,
      thighR: 52,
    },
    // Mar 6/13/20 already exist — will patch them below
    {
      date: '2026-03-27',
      w: 56.3,
      bf: 24.5,
      mm: 23.2,
      waist: 71.5,
      hips: 94,
      thighL: 50,
      thighR: 50,
    },
    {
      date: '2026-04-02',
      w: 55.8,
      bf: 23.9,
      mm: 23.5,
      waist: 71,
      hips: 93.5,
      thighL: 49.5,
      thighR: 49.5,
      notes: 'Consistent progress, energy levels up',
    },
  ],

  // ── Karthik Iyer — Male, 29 | Goal: muscle building (lean bulk)
  karthik: [
    {
      date: '2026-01-09',
      w: 76.5,
      bf: 16.5,
      mm: 31.5,
      chest: 93,
      bicepL: 34,
      bicepR: 34.5,
      thighL: 55,
      thighR: 55,
    },
    {
      date: '2026-01-23',
      w: 77.8,
      bf: 16.0,
      mm: 32.5,
      chest: 94,
      bicepL: 34.5,
      bicepR: 35,
      thighL: 55.5,
      thighR: 55.5,
    },
    {
      date: '2026-02-06',
      w: 78.9,
      bf: 15.5,
      mm: 33.8,
      chest: 95.5,
      bicepL: 35,
      bicepR: 35.5,
      thighL: 56,
      thighR: 56,
    },
    {
      date: '2026-02-20',
      w: 79.8,
      bf: 15.0,
      mm: 35.0,
      chest: 97,
      bicepL: 35.5,
      bicepR: 36,
      thighL: 56.5,
      thighR: 56.5,
    },
    {
      date: '2026-03-27',
      w: 81.8,
      bf: 14.0,
      mm: 37.2,
      chest: 99.5,
      bicepL: 36.5,
      bicepR: 37,
      thighL: 57.5,
      thighR: 57.5,
    },
    {
      date: '2026-04-02',
      w: 82.3,
      bf: 13.6,
      mm: 37.8,
      chest: 100.5,
      bicepL: 37,
      bicepR: 37.5,
      thighL: 58,
      thighR: 58,
      notes: 'Bench PR this week — 90kg',
    },
  ],

  // ── Meera Pillai — Female, 35 | Goal: general fitness + fat loss
  meera: [
    {
      date: '2026-01-09',
      w: 68.5,
      bf: 31.5,
      mm: 18.8,
      waist: 83,
      hips: 101,
      thighL: 57,
      thighR: 57,
    },
    {
      date: '2026-01-23',
      w: 67.8,
      bf: 30.8,
      mm: 19.1,
      waist: 82,
      hips: 100,
      thighL: 56.5,
      thighR: 56.5,
    },
    {
      date: '2026-02-06',
      w: 67.0,
      bf: 30.0,
      mm: 19.4,
      waist: 81,
      hips: 99.5,
      thighL: 56,
      thighR: 56,
    },
    {
      date: '2026-02-20',
      w: 66.1,
      bf: 29.2,
      mm: 19.7,
      waist: 80,
      hips: 98.5,
      thighL: 55.5,
      thighR: 55.5,
    },
    {
      date: '2026-03-27',
      w: 63.5,
      bf: 26.5,
      mm: 20.9,
      waist: 76,
      hips: 95.5,
      thighL: 53.5,
      thighR: 53.5,
    },
    {
      date: '2026-04-02',
      w: 63.1,
      bf: 26.0,
      mm: 21.1,
      waist: 75.5,
      hips: 95,
      thighL: 53,
      thighR: 53,
      notes: 'Fitting into old jeans now!',
    },
  ],

  // ── Rohit Das — Male, 31 | Goal: strength + body recomp
  rohit: [
    {
      date: '2026-01-09',
      w: 83.5,
      bf: 25.5,
      mm: 32.5,
      chest: 98,
      waist: 90,
      bicepL: 33.5,
      bicepR: 34,
      thighL: 57,
      thighR: 57,
    },
    {
      date: '2026-01-23',
      w: 82.8,
      bf: 25.0,
      mm: 33.2,
      chest: 98.5,
      waist: 89,
      bicepL: 34,
      bicepR: 34.5,
      thighL: 57.5,
      thighR: 57.5,
    },
    {
      date: '2026-02-06',
      w: 82.0,
      bf: 24.2,
      mm: 34.0,
      chest: 99,
      waist: 88,
      bicepL: 34.5,
      bicepR: 35,
      thighL: 58,
      thighR: 58,
    },
    {
      date: '2026-02-20',
      w: 80.8,
      bf: 23.5,
      mm: 34.8,
      chest: 99.5,
      waist: 87,
      bicepL: 35,
      bicepR: 35.5,
      thighL: 58.5,
      thighR: 58.5,
    },
    {
      date: '2026-03-27',
      w: 76.8,
      bf: 21.0,
      mm: 36.5,
      chest: 101,
      waist: 84.5,
      bicepL: 36.5,
      bicepR: 37,
      thighL: 59.5,
      thighR: 59.5,
    },
    {
      date: '2026-04-02',
      w: 76.5,
      bf: 20.5,
      mm: 37.0,
      chest: 101.5,
      waist: 84,
      bicepL: 37,
      bicepR: 37.5,
      thighL: 60,
      thighR: 60,
      notes: 'Deadlift at 120kg last session',
    },
  ],

  // ── Sneha Gupta — Female, 26 | Goal: significant weight loss
  sneha: [
    {
      date: '2026-01-09',
      w: 63.5,
      bf: 28.5,
      mm: 18.0,
      waist: 83,
      hips: 97,
      thighL: 55,
      thighR: 55,
    },
    {
      date: '2026-01-23',
      w: 62.3,
      bf: 27.8,
      mm: 18.2,
      waist: 82,
      hips: 96,
      thighL: 54.5,
      thighR: 54.5,
    },
    {
      date: '2026-02-06',
      w: 61.0,
      bf: 27.0,
      mm: 18.5,
      waist: 81,
      hips: 95.5,
      thighL: 54,
      thighR: 54,
    },
    {
      date: '2026-02-20',
      w: 59.5,
      bf: 26.0,
      mm: 18.8,
      waist: 79.5,
      hips: 94.5,
      thighL: 53.5,
      thighR: 53.5,
    },
    {
      date: '2026-03-27',
      w: 53.2,
      bf: 21.5,
      mm: 20.4,
      waist: 74.5,
      hips: 90.5,
      thighL: 50.5,
      thighR: 50.5,
    },
    {
      date: '2026-04-02',
      w: 52.8,
      bf: 21.0,
      mm: 20.6,
      waist: 74,
      hips: 90,
      thighL: 50,
      thighR: 50,
      notes: 'Down 10.7kg from start!',
    },
  ],

  // ── Arun Kumar — Male, 34 | Goal: major weight loss (obesity management)
  arun: [
    {
      date: '2026-01-09',
      w: 101.5,
      bf: 33.0,
      mm: 33.5,
      waist: 110,
      hips: 115,
      thighL: 65,
      thighR: 65,
    },
    {
      date: '2026-01-23',
      w: 99.8,
      bf: 32.2,
      mm: 33.8,
      waist: 108,
      hips: 113.5,
      thighL: 64.5,
      thighR: 64.5,
    },
    {
      date: '2026-02-06',
      w: 97.5,
      bf: 31.2,
      mm: 34.2,
      waist: 106,
      hips: 112,
      thighL: 64,
      thighR: 64,
    },
    {
      date: '2026-02-20',
      w: 95.0,
      bf: 30.0,
      mm: 34.8,
      waist: 103.5,
      hips: 110.5,
      thighL: 63.5,
      thighR: 63.5,
    },
    {
      date: '2026-03-27',
      w: 88.5,
      bf: 25.5,
      mm: 37.0,
      waist: 97,
      hips: 106,
      thighL: 61.5,
      thighR: 61.5,
    },
    {
      date: '2026-04-02',
      w: 87.8,
      bf: 25.0,
      mm: 37.5,
      waist: 96,
      hips: 105.5,
      thighL: 61,
      thighR: 61,
      notes: '13kg down! Blood pressure normal now',
    },
  ],

  // ── Ammu Client — Female, 30 | Goal: weight loss + toning
  ammu: [
    {
      date: '2026-01-09',
      w: 71.0,
      bf: 30.0,
      mm: 20.5,
      waist: 80,
      hips: 100,
      thighL: 56,
      thighR: 56,
    },
    {
      date: '2026-01-23',
      w: 69.5,
      bf: 29.2,
      mm: 20.8,
      waist: 79,
      hips: 99,
      thighL: 55.5,
      thighR: 55.5,
    },
    {
      date: '2026-02-06',
      w: 68.0,
      bf: 28.5,
      mm: 21.0,
      waist: 77.5,
      hips: 97.5,
      thighL: 55,
      thighR: 55,
    },
    {
      date: '2026-02-20',
      w: 66.5,
      bf: 27.8,
      mm: 21.3,
      waist: 76,
      hips: 96.5,
      thighL: 54.5,
      thighR: 54,
    },
    {
      date: '2026-03-06',
      w: 64.8,
      bf: 27.0,
      mm: 21.6,
      waist: 74.5,
      hips: 95.5,
      thighL: 54,
      thighR: 53.5,
    },
    {
      date: '2026-03-20',
      w: 63.0,
      bf: 26.0,
      mm: 22.0,
      waist: 73,
      hips: 94.5,
      thighL: 53.5,
      thighR: 53,
    },
    {
      date: '2026-03-27',
      w: 61.5,
      bf: 25.2,
      mm: 22.3,
      waist: 71.5,
      hips: 93.5,
      thighL: 53,
      thighR: 52.5,
    },
    // Mar 29 and Apr 2 already exist — will patch
  ],
};

// Existing progress entries for Mar 6/13/20 — patch body fat & measurements
// [clientKey, existingDate, bf, mm, extra measurements]
const EXISTING_PATCHES: {
  clientId: string;
  date: string;
  bf: number;
  mm: number;
  waist?: number;
  hips?: number;
  chest?: number;
  bicepL?: number;
  bicepR?: number;
  thighL?: number;
  thighR?: number;
}[] = [
  // Ananya — existing: 57.7 (Mar6), 57.5 (Mar13), 57.1 (Mar20)
  {
    clientId: C.ananya,
    date: '2026-03-06',
    bf: 26.5,
    mm: 22.4,
    waist: 74,
    hips: 95.5,
    thighL: 51.5,
    thighR: 51.5,
  },
  {
    clientId: C.ananya,
    date: '2026-03-13',
    bf: 25.8,
    mm: 22.7,
    waist: 73,
    hips: 95,
    thighL: 51,
    thighR: 51,
  },
  {
    clientId: C.ananya,
    date: '2026-03-20',
    bf: 25.2,
    mm: 22.9,
    waist: 72.5,
    hips: 94.5,
    thighL: 50.5,
    thighR: 50.5,
  },
  // Karthik — existing: 81.3 (Mar6), 81.1 (Mar13), 81.1 (Mar20)
  {
    clientId: C.karthik,
    date: '2026-03-06',
    bf: 14.8,
    mm: 35.8,
    chest: 97.5,
    bicepL: 36,
    bicepR: 36.5,
    thighL: 57,
    thighR: 57,
  },
  {
    clientId: C.karthik,
    date: '2026-03-13',
    bf: 14.5,
    mm: 36.2,
    chest: 98.5,
    bicepL: 36.3,
    bicepR: 36.8,
    thighL: 57.3,
    thighR: 57.3,
  },
  {
    clientId: C.karthik,
    date: '2026-03-20',
    bf: 14.2,
    mm: 36.8,
    chest: 99,
    bicepL: 36.5,
    bicepR: 37,
    thighL: 57.5,
    thighR: 57.5,
  },
  // Meera — existing: 64.7 (Mar6), 64.4 (Mar13), 64.1 (Mar20)
  {
    clientId: C.meera,
    date: '2026-03-06',
    bf: 28.5,
    mm: 20.0,
    waist: 78.5,
    hips: 97.5,
    thighL: 55,
    thighR: 55,
  },
  {
    clientId: C.meera,
    date: '2026-03-13',
    bf: 27.8,
    mm: 20.3,
    waist: 77.5,
    hips: 97,
    thighL: 54.5,
    thighR: 54.5,
  },
  {
    clientId: C.meera,
    date: '2026-03-20',
    bf: 27.2,
    mm: 20.6,
    waist: 76.5,
    hips: 96.5,
    thighL: 54,
    thighR: 54,
  },
  // Rohit — existing: 77.6 (Mar6), 77.3 (Mar13), 77.0 (Mar20)
  {
    clientId: C.rohit,
    date: '2026-03-06',
    bf: 22.5,
    mm: 35.2,
    chest: 100,
    waist: 86,
    bicepL: 35.5,
    bicepR: 36,
    thighL: 59,
    thighR: 59,
  },
  {
    clientId: C.rohit,
    date: '2026-03-13',
    bf: 22.0,
    mm: 35.8,
    chest: 100.5,
    waist: 85.5,
    bicepL: 36,
    bicepR: 36.5,
    thighL: 59.5,
    thighR: 59.5,
  },
  {
    clientId: C.rohit,
    date: '2026-03-20',
    bf: 21.5,
    mm: 36.2,
    chest: 101,
    waist: 85,
    bicepL: 36.5,
    bicepR: 37,
    thighL: 59.8,
    thighR: 59.8,
  },
  // Sneha — existing: 54.9 (Mar6), 54.5 (Mar13), 54.1 (Mar20)
  {
    clientId: C.sneha,
    date: '2026-03-06',
    bf: 23.5,
    mm: 19.5,
    waist: 77,
    hips: 93,
    thighL: 52,
    thighR: 52,
  },
  {
    clientId: C.sneha,
    date: '2026-03-13',
    bf: 22.8,
    mm: 19.8,
    waist: 76,
    hips: 92,
    thighL: 51.5,
    thighR: 51.5,
  },
  {
    clientId: C.sneha,
    date: '2026-03-20',
    bf: 22.2,
    mm: 20.1,
    waist: 75,
    hips: 91.5,
    thighL: 51,
    thighR: 51,
  },
  // Arun — no Mar6, existing Mar13: 89.3, Mar20: 89.1
  {
    clientId: C.arun,
    date: '2026-03-13',
    bf: 27.0,
    mm: 36.2,
    waist: 99.5,
    hips: 107.5,
    thighL: 62.5,
    thighR: 62.5,
  },
  {
    clientId: C.arun,
    date: '2026-03-20',
    bf: 26.2,
    mm: 36.7,
    waist: 98,
    hips: 106.5,
    thighL: 62,
    thighR: 62,
  },
];

// ─── Workout sessions to complete + log ───────────────────────────────────────
// [sessionId, clientProfileId, exercises[]]
// Each exercise: [exerciseId, sets[[reps, weightKg, durationSec, rpe]]]

type SetInput = [number | null, number | null, number | null, number]; // reps, kg, sec, rpe

const SESSIONS_TO_COMPLETE: {
  id: string;
  clientId: string;
  exercises: { exId: string; sets: SetInput[] }[];
}[] = [
  // ── Rohit Das — Strength training (Mar 26–31)
  {
    id: 'cmn6zackx000vw1fo0x2k6xcr',
    clientId: C.rohit, // Mar 26
    exercises: [
      {
        exId: 'ex-squat',
        sets: [
          [6, 100, null, 8],
          [6, 100, null, 8],
          [5, 105, null, 9],
          [5, 105, null, 9],
        ],
      },
      {
        exId: 'ex-leg-press',
        sets: [
          [12, 140, null, 7],
          [12, 140, null, 7],
          [10, 150, null, 8],
        ],
      },
      {
        exId: 'ex-rdl',
        sets: [
          [10, 80, null, 7],
          [10, 80, null, 8],
          [8, 85, null, 8],
        ],
      },
      {
        exId: 'ex-leg-curl',
        sets: [
          [12, 45, null, 7],
          [12, 45, null, 7],
          [10, 50, null, 8],
        ],
      },
    ],
  },
  {
    id: 'cmn6zaclk000zw1fojrrc1nqr',
    clientId: C.rohit, // Mar 27
    exercises: [
      {
        exId: 'ex-bench-press',
        sets: [
          [6, 85, null, 8],
          [6, 85, null, 8],
          [5, 90, null, 9],
          [5, 90, null, 9],
        ],
      },
      {
        exId: 'ex-incline-db-press',
        sets: [
          [10, 32, null, 7],
          [10, 32, null, 8],
          [8, 34, null, 8],
        ],
      },
      {
        exId: 'ex-cable-fly',
        sets: [
          [12, 15, null, 7],
          [12, 15, null, 7],
          [12, 15, null, 7],
        ],
      },
      {
        exId: 'ex-tricep-pushdown',
        sets: [
          [12, 30, null, 7],
          [12, 30, null, 7],
          [10, 32, null, 8],
        ],
      },
    ],
  },
  {
    id: 'cmn6zaclr0013w1foz6y9ne04',
    clientId: C.rohit, // Mar 28
    exercises: [
      {
        exId: 'ex-deadlift',
        sets: [
          [5, 120, null, 9],
          [5, 120, null, 9],
          [3, 130, null, 10],
        ],
      },
      {
        exId: 'ex-row',
        sets: [
          [8, 80, null, 8],
          [8, 80, null, 8],
          [8, 82.5, null, 8],
        ],
      },
      {
        exId: 'ex-lat-pulldown',
        sets: [
          [10, 65, null, 7],
          [10, 65, null, 7],
          [10, 67.5, null, 8],
        ],
      },
      {
        exId: 'ex-curl',
        sets: [
          [12, 16, null, 7],
          [12, 16, null, 7],
          [10, 18, null, 8],
        ],
      },
    ],
  },
  {
    id: 'cmn6zaclx0017w1fo0asom5mh',
    clientId: C.rohit, // Mar 29
    exercises: [
      {
        exId: 'ex-squat',
        sets: [
          [6, 102.5, null, 8],
          [6, 102.5, null, 8],
          [5, 107.5, null, 9],
        ],
      },
      {
        exId: 'ex-leg-press',
        sets: [
          [12, 145, null, 7],
          [12, 145, null, 7],
          [10, 155, null, 8],
        ],
      },
      {
        exId: 'ex-rdl',
        sets: [
          [10, 82.5, null, 8],
          [10, 82.5, null, 8],
          [8, 87.5, null, 9],
        ],
      },
      { exId: 'ex-treadmill', sets: [[null, null, 1200, 6]] }, // 20 min cooldown
    ],
  },
  {
    id: 'cmn6zacm3001bw1fo3ccfads8',
    clientId: C.rohit, // Mar 30
    exercises: [
      {
        exId: 'ex-bench-press',
        sets: [
          [5, 90, null, 9],
          [5, 90, null, 9],
          [5, 90, null, 9],
          [3, 95, null, 10],
        ],
      },
      {
        exId: 'ex-ohp',
        sets: [
          [8, 55, null, 8],
          [8, 55, null, 8],
          [6, 60, null, 9],
        ],
      },
      {
        exId: 'ex-dip',
        sets: [
          [10, null, null, 7],
          [10, null, null, 7],
          [8, null, null, 8],
        ],
      },
      {
        exId: 'ex-tricep-pushdown',
        sets: [
          [12, 32, null, 7],
          [12, 32, null, 7],
        ],
      },
    ],
  },
  {
    id: 'cmn6zacm7001fw1fozarnwsft',
    clientId: C.rohit, // Mar 31
    exercises: [
      {
        exId: 'ex-deadlift',
        sets: [
          [5, 122.5, null, 9],
          [5, 122.5, null, 9],
          [3, 132.5, null, 10],
        ],
      },
      {
        exId: 'ex-seated-cable-row',
        sets: [
          [10, 70, null, 7],
          [10, 70, null, 8],
          [8, 75, null, 8],
        ],
      },
      {
        exId: 'ex-hammer-curl',
        sets: [
          [12, 16, null, 7],
          [12, 16, null, 7],
          [10, 18, null, 8],
        ],
      },
      {
        exId: 'ex-plank',
        sets: [
          [null, null, 60, 6],
          [null, null, 60, 6],
          [null, null, 45, 7],
        ],
      },
    ],
  },

  // ── Sneha Gupta — Full body fat loss (Mar 26 – Apr 1)
  {
    id: 'cmn5yjqnp002p97nff33sby89',
    clientId: C.sneha, // Mar 26
    exercises: [
      {
        exId: 'ex-rdl',
        sets: [
          [12, 35, null, 7],
          [12, 35, null, 7],
          [10, 40, null, 8],
        ],
      },
      {
        exId: 'ex-leg-press',
        sets: [
          [15, 55, null, 7],
          [15, 55, null, 7],
          [12, 60, null, 8],
        ],
      },
      {
        exId: 'ex-lat-pulldown',
        sets: [
          [12, 32, null, 7],
          [12, 32, null, 7],
          [10, 35, null, 8],
        ],
      },
      { exId: 'ex-treadmill', sets: [[null, null, 1500, 7]] }, // 25 min
    ],
  },
  {
    id: 'cmn5yjqpg002t97nfs0q3rx9f',
    clientId: C.sneha, // Mar 27
    exercises: [
      {
        exId: 'ex-leg-curl',
        sets: [
          [15, 25, null, 7],
          [15, 25, null, 7],
          [12, 27.5, null, 8],
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
        exId: 'ex-pushup',
        sets: [
          [15, null, null, 7],
          [15, null, null, 8],
          [12, null, null, 8],
        ],
      },
      {
        exId: 'ex-plank',
        sets: [
          [null, null, 45, 6],
          [null, null, 45, 6],
          [null, null, 45, 7],
        ],
      },
      { exId: 'ex-cycling', sets: [[null, null, 1200, 6]] },
    ],
  },
  {
    id: 'cmn5yjqu6002x97nfnqw05dp9',
    clientId: C.sneha, // Mar 28
    exercises: [
      {
        exId: 'ex-rdl',
        sets: [
          [12, 37.5, null, 7],
          [12, 37.5, null, 8],
          [10, 42.5, null, 8],
        ],
      },
      {
        exId: 'ex-seated-cable-row',
        sets: [
          [12, 30, null, 7],
          [12, 30, null, 7],
          [10, 32.5, null, 8],
        ],
      },
      {
        exId: 'ex-db-shoulder-press',
        sets: [
          [12, 10, null, 7],
          [12, 10, null, 7],
          [10, 12, null, 8],
        ],
      },
      { exId: 'ex-treadmill', sets: [[null, null, 1800, 7]] }, // 30 min
    ],
  },
  {
    id: 'cmn5yjqvx003197nfkz4acyln',
    clientId: C.sneha, // Mar 29
    exercises: [
      {
        exId: 'ex-bw-squat',
        sets: [
          [20, null, null, 6],
          [20, null, null, 6],
          [15, null, null, 7],
        ],
      },
      {
        exId: 'ex-lunge',
        sets: [
          [15, null, null, 7],
          [15, null, null, 7],
          [12, null, null, 8],
        ],
      },
      {
        exId: 'ex-lat-pulldown',
        sets: [
          [12, 35, null, 7],
          [12, 35, null, 7],
          [10, 37.5, null, 8],
        ],
      },
      {
        exId: 'ex-side-plank',
        sets: [
          [null, null, 30, 6],
          [null, null, 30, 6],
          [null, null, 30, 7],
        ],
      },
    ],
  },
  {
    id: 'cmn5yjqy7003597nfv1j15ira',
    clientId: C.sneha, // Mar 30
    exercises: [
      {
        exId: 'ex-rdl',
        sets: [
          [12, 40, null, 7],
          [12, 40, null, 8],
          [10, 42.5, null, 8],
        ],
      },
      {
        exId: 'ex-leg-press',
        sets: [
          [15, 60, null, 7],
          [15, 60, null, 7],
          [12, 65, null, 8],
        ],
      },
      {
        exId: 'ex-pushup',
        sets: [
          [15, null, null, 7],
          [15, null, null, 7],
          [12, null, null, 8],
        ],
      },
      { exId: 'ex-rowing', sets: [[null, null, 1200, 7]] },
    ],
  },
  {
    id: 'cmn5yjr0a003997nfk0fsnqz1',
    clientId: C.sneha, // Mar 31
    exercises: [
      {
        exId: 'ex-leg-curl',
        sets: [
          [15, 27.5, null, 7],
          [15, 27.5, null, 7],
          [12, 30, null, 8],
        ],
      },
      {
        exId: 'ex-seated-cable-row',
        sets: [
          [12, 32.5, null, 7],
          [12, 32.5, null, 8],
          [10, 35, null, 8],
        ],
      },
      {
        exId: 'ex-db-shoulder-press',
        sets: [
          [12, 12, null, 7],
          [12, 12, null, 7],
          [10, 14, null, 8],
        ],
      },
      { exId: 'ex-treadmill', sets: [[null, null, 1800, 7]] },
    ],
  },
  {
    id: 'cmn5y8mox001p97nfx1l333h0',
    clientId: C.sneha, // Apr 1
    exercises: [
      {
        exId: 'ex-rdl',
        sets: [
          [12, 40, null, 7],
          [12, 40, null, 7],
          [10, 45, null, 8],
        ],
      },
      {
        exId: 'ex-lunge',
        sets: [
          [15, null, null, 7],
          [15, null, null, 7],
          [15, null, null, 8],
        ],
      },
      {
        exId: 'ex-lat-pulldown',
        sets: [
          [12, 37.5, null, 7],
          [12, 37.5, null, 7],
          [10, 40, null, 8],
        ],
      },
      {
        exId: 'ex-plank',
        sets: [
          [null, null, 60, 6],
          [null, null, 60, 7],
          [null, null, 60, 7],
        ],
      },
    ],
  },

  // ── Arun Kumar — Weight loss, heavy cardio + compound lifts (Mar 27–31)
  {
    id: 'cmn5y2wxm001597nfqnylplni',
    clientId: C.arun, // Mar 27
    exercises: [
      { exId: 'ex-treadmill', sets: [[null, null, 1800, 7]] },
      {
        exId: 'ex-leg-press',
        sets: [
          [15, 80, null, 7],
          [15, 80, null, 7],
          [12, 90, null, 8],
        ],
      },
      {
        exId: 'ex-lat-pulldown',
        sets: [
          [12, 55, null, 7],
          [12, 55, null, 7],
          [10, 60, null, 8],
        ],
      },
      {
        exId: 'ex-plank',
        sets: [
          [null, null, 40, 7],
          [null, null, 40, 7],
        ],
      },
    ],
  },
  {
    id: 'cmn5y2wzt001997nf1i2xbeyf',
    clientId: C.arun, // Mar 28
    exercises: [
      { exId: 'ex-rowing', sets: [[null, null, 1500, 7]] },
      {
        exId: 'ex-bw-squat',
        sets: [
          [20, null, null, 6],
          [20, null, null, 7],
          [15, null, null, 7],
        ],
      },
      {
        exId: 'ex-pushup',
        sets: [
          [10, null, null, 7],
          [10, null, null, 7],
          [8, null, null, 8],
        ],
      },
      {
        exId: 'ex-seated-cable-row',
        sets: [
          [12, 50, null, 7],
          [12, 50, null, 7],
          [10, 55, null, 8],
        ],
      },
    ],
  },
  {
    id: 'cmn5y2x2v001d97nf4rs4a7q0',
    clientId: C.arun, // Mar 29
    exercises: [
      { exId: 'ex-treadmill', sets: [[null, null, 2100, 8]] }, // 35 min
      {
        exId: 'ex-rdl',
        sets: [
          [12, 60, null, 7],
          [12, 60, null, 7],
          [10, 65, null, 8],
        ],
      },
      {
        exId: 'ex-lat-pulldown',
        sets: [
          [12, 57.5, null, 7],
          [12, 57.5, null, 7],
          [10, 62.5, null, 8],
        ],
      },
    ],
  },
  {
    id: 'cmn5y2x64001h97nfiaszwuqa',
    clientId: C.arun, // Mar 30
    exercises: [
      { exId: 'ex-cycling', sets: [[null, null, 1800, 7]] },
      {
        exId: 'ex-leg-press',
        sets: [
          [15, 85, null, 7],
          [15, 85, null, 7],
          [12, 95, null, 8],
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
          [null, null, 45, 6],
          [null, null, 45, 7],
          [null, null, 45, 7],
        ],
      },
    ],
  },
  {
    id: 'cmn5y2x7k001l97nfe2szlpwo',
    clientId: C.arun, // Mar 31
    exercises: [
      { exId: 'ex-treadmill', sets: [[null, null, 2100, 7]] },
      {
        exId: 'ex-bw-squat',
        sets: [
          [20, null, null, 6],
          [20, null, null, 7],
          [20, null, null, 7],
        ],
      },
      {
        exId: 'ex-seated-cable-row',
        sets: [
          [12, 52.5, null, 7],
          [12, 52.5, null, 7],
          [10, 57.5, null, 8],
        ],
      },
      {
        exId: 'ex-pushup',
        sets: [
          [12, null, null, 7],
          [10, null, null, 7],
          [10, null, null, 8],
        ],
      },
    ],
  },

  // ── Ammu Client — Full body toning (Mar 30–31)
  {
    id: 'cmnbp67h30039w1fowxbvkml1',
    clientId: C.ammu, // Mar 30
    exercises: [
      {
        exId: 'ex-rdl',
        sets: [
          [12, 30, null, 7],
          [12, 30, null, 7],
          [10, 35, null, 8],
        ],
      },
      {
        exId: 'ex-lat-pulldown',
        sets: [
          [12, 30, null, 7],
          [12, 30, null, 7],
          [10, 32.5, null, 8],
        ],
      },
      {
        exId: 'ex-leg-press',
        sets: [
          [15, 50, null, 7],
          [15, 50, null, 7],
          [12, 55, null, 8],
        ],
      },
      { exId: 'ex-treadmill', sets: [[null, null, 1200, 6]] },
    ],
  },
  {
    id: 'cmnbp67hb003dw1folvnpsv0r',
    clientId: C.ammu, // Mar 31
    exercises: [
      {
        exId: 'ex-pushup',
        sets: [
          [12, null, null, 7],
          [10, null, null, 7],
          [10, null, null, 8],
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
        exId: 'ex-db-shoulder-press',
        sets: [
          [12, 8, null, 7],
          [12, 8, null, 7],
          [10, 10, null, 8],
        ],
      },
      {
        exId: 'ex-plank',
        sets: [
          [null, null, 40, 6],
          [null, null, 40, 6],
          [null, null, 40, 7],
        ],
      },
      { exId: 'ex-cycling', sets: [[null, null, 1200, 6]] },
    ],
  },
];

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱 Starting demo seed...\n');

  // 1. Clean up Ammu's duplicate April-2 entry (keep the 55kg one — most recent)
  console.log('🧹 Cleaning up Ammu duplicate entries...');
  const ammuDupes = await prisma.progressEntry.findMany({
    where: { clientProfileId: C.ammu },
    orderBy: { recordedAt: 'asc' },
  });
  const apr2Entries = ammuDupes.filter((e) => e.recordedAt.toISOString().startsWith('2026-04-02'));
  if (apr2Entries.length > 1) {
    // delete all but the last
    const toDelete = apr2Entries.slice(0, -1).map((e) => e.id);
    await prisma.progressEntry.deleteMany({ where: { id: { in: toDelete } } });
    console.log(`  Deleted ${toDelete.length} duplicate Apr-2 entries for Ammu`);
  }
  // Delete the null-weight March-29 entry for Ammu
  const nullWeightEntry = ammuDupes.find((e) => e.weightKg === null);
  if (nullWeightEntry) {
    await prisma.progressEntry.delete({ where: { id: nullWeightEntry.id } });
    console.log('  Deleted null-weight entry for Ammu');
  }

  // 2. Patch existing Mar 6/13/20 entries with body fat + measurements
  console.log('\n📊 Patching existing entries with body fat & measurements...');
  for (const patch of EXISTING_PATCHES) {
    const start = new Date(patch.date + 'T00:00:00.000Z');
    const end = new Date(patch.date + 'T23:59:59.999Z');
    const existing = await prisma.progressEntry.findFirst({
      where: { clientProfileId: patch.clientId, recordedAt: { gte: start, lte: end } },
    });
    // Also check IST offset (date stored as T18:30:00Z = next calendar day IST)
    const startIST = new Date(patch.date + 'T18:00:00.000Z');
    const endIST = new Date(patch.date + 'T19:00:00.000Z');
    const existingIST = await prisma.progressEntry.findFirst({
      where: { clientProfileId: patch.clientId, recordedAt: { gte: startIST, lte: endIST } },
    });
    const target = existing ?? existingIST;
    if (target) {
      await prisma.progressEntry.update({
        where: { id: target.id },
        data: {
          bodyFatPercent: patch.bf,
          muscleMass: patch.mm,
          ...(patch.chest && { chest: patch.chest }),
          ...(patch.waist && { waist: patch.waist }),
          ...(patch.hips && { hips: patch.hips }),
          ...(patch.bicepL && { bicepLeft: patch.bicepL, bicepRight: patch.bicepR }),
          ...(patch.thighL && { thighLeft: patch.thighL, thighRight: patch.thighR }),
        },
      });
      console.log(`  ✓ Patched ${patch.date} for client ${patch.clientId.slice(-6)}`);
    } else {
      console.log(`  ⚠ No entry found for ${patch.date} / ${patch.clientId.slice(-6)}`);
    }
  }

  // 3. Insert new progress entries (skip if date already has an entry)
  console.log('\n📈 Inserting new progress entries...');
  let created = 0;
  let skipped = 0;
  for (const [clientKey, entries] of Object.entries(PROGRESS)) {
    const clientId = C[clientKey as keyof typeof C];
    for (const e of entries) {
      const dateStart = new Date(e.date + 'T00:00:00.000Z');
      const dateEnd = new Date(e.date + 'T23:59:59.999Z');
      const exists = await prisma.progressEntry.findFirst({
        where: { clientProfileId: clientId, recordedAt: { gte: dateStart, lte: dateEnd } },
      });
      // Check IST offset too
      const istStart = new Date(e.date + 'T17:30:00.000Z');
      const istEnd = new Date(e.date + 'T20:00:00.000Z');
      const existsIST = await prisma.progressEntry.findFirst({
        where: { clientProfileId: clientId, recordedAt: { gte: istStart, lte: istEnd } },
      });
      if (exists || existsIST) {
        skipped++;
        continue;
      }
      await prisma.progressEntry.create({
        data: {
          clientProfileId: clientId,
          recordedByUserId: ADMIN_ID,
          recordedAt: d(e.date),
          weightKg: jitter(e.w, 0.1),
          bodyFatPercent: jitter(e.bf, 0.2),
          muscleMass: jitter(e.mm, 0.15),
          chest: e.chest ? jitter(e.chest, 0.3) : null,
          waist: e.waist ? jitter(e.waist, 0.3) : null,
          hips: e.hips ? jitter(e.hips, 0.3) : null,
          bicepLeft: e.bicepL ? jitter(e.bicepL, 0.2) : null,
          bicepRight: e.bicepR ? jitter(e.bicepR, 0.2) : null,
          thighLeft: e.thighL ? jitter(e.thighL, 0.3) : null,
          thighRight: e.thighR ? jitter(e.thighR, 0.3) : null,
          notes: e.notes ?? null,
        },
      });
      created++;
    }
  }
  console.log(`  Created: ${created}, Skipped (already exist): ${skipped}`);

  // 4. Mark past SCHEDULED sessions as COMPLETED + add workout logs
  console.log('\n🏋️ Completing sessions and adding workout logs...');
  let sessionsDone = 0;
  let logsCreated = 0;
  for (const sess of SESSIONS_TO_COMPLETE) {
    // Check if already completed
    const existing = await prisma.sessionInstance.findUnique({ where: { id: sess.id } });
    if (!existing) {
      console.log(`  ⚠ Session ${sess.id} not found`);
      continue;
    }
    if (existing.status !== 'SCHEDULED') {
      console.log(`  ⏭ Session ${sess.id} already ${existing.status}`);
      continue;
    }

    // Complete the session
    const startedAt = new Date(existing.scheduledDate);
    const [h, m] = existing.scheduledTime.split(':').map(Number);
    startedAt.setHours(h!, m!, 0, 0);
    const endedAt = new Date(startedAt.getTime() + existing.durationMin * 60 * 1000);

    await prisma.sessionInstance.update({
      where: { id: sess.id },
      data: {
        status: 'COMPLETED',
        startedAt,
        endedAt,
        actualDurationMin: existing.durationMin,
      },
    });

    // Add workout logs
    for (let exIdx = 0; exIdx < sess.exercises.length; exIdx++) {
      const ex = sess.exercises[exIdx]!;
      // Skip if log already exists for this exercise in this session
      const existingLog = await prisma.workoutLog.findFirst({
        where: { sessionInstanceId: sess.id, exerciseId: ex.exId },
      });
      if (existingLog) continue;

      await prisma.workoutLog.create({
        data: {
          sessionInstanceId: sess.id,
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
    sessionsDone++;
  }
  console.log(`  Sessions completed: ${sessionsDone}, Workout logs created: ${logsCreated}`);

  // 5. Summary
  const [totalProgress, totalLogs] = await Promise.all([
    prisma.progressEntry.count(),
    prisma.workoutLog.count(),
  ]);
  console.log(`\n✅ Done!`);
  console.log(`   Total progress entries in DB: ${totalProgress}`);
  console.log(`   Total workout logs in DB: ${totalLogs}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
