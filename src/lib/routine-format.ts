// ADR-053 — pure helpers for rendering routine targets. Shared by the
// WorkoutLogger (target strip, ghost rows, tap-to-fill), the program editor
// and the client's read-only program view. No React, no fetch — unit-tested.

export type RoutineSetType = 'WARMUP' | 'NORMAL' | 'FAILURE' | 'DROP';
export type RoutineExerciseType = 'WEIGHTED' | 'BODYWEIGHT' | 'DURATION' | 'CARDIO';
export type RoutineSecondaryMetric = 'KM' | 'STEPS' | 'METERS' | 'NONE';

export interface RoutineSetTarget {
  setNumber: number;
  setType: RoutineSetType;
  targetRepsMin: number | null;
  targetRepsMax: number | null;
  targetWeightKg: number | null;
  targetDurationSec: number | null;
  targetStepsCount: number | null;
  targetDistance: number | null;
}

export interface SessionRoutineExercise {
  exerciseId: string;
  orderIndex: number;
  restSec: number | null;
  notes: string | null;
  sets: RoutineSetTarget[];
}

/** The `routine` block embedded in the trainer + client session payloads. */
export interface SessionRoutine {
  id: string;
  name: string;
  notes: string | null;
  exercises: SessionRoutineExercise[];
}

export const SET_TYPE_LABEL: Record<RoutineSetType, string> = {
  WARMUP: 'Warm-up',
  NORMAL: 'Working',
  FAILURE: 'To failure',
  DROP: 'Drop set',
};

/** One-letter badge Hevy-style; null for normal sets (no badge). */
export const SET_TYPE_SHORT: Record<RoutineSetType, string | null> = {
  WARMUP: 'W',
  NORMAL: null,
  FAILURE: 'F',
  DROP: 'D',
};

function trimNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

/** "12" for a fixed count, "8–12" for a range, null when unset. */
export function formatReps(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null;
  if (min == null) return String(max);
  if (max == null || max === min) return String(min);
  return `${min}–${max}`;
}

/** 45 → "45s", 60 → "1 min", 90 → "1:30". */
export function formatDuration(sec: number | null): string | null {
  if (sec == null) return null;
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s === 0 ? `${m} min` : `${m}:${String(s).padStart(2, '0')}`;
}

function formatDistance(distance: number | null, metric: RoutineSecondaryMetric): string | null {
  if (distance == null) return null;
  return metric === 'METERS' ? `${trimNumber(distance)} m` : `${trimNumber(distance)} km`;
}

/**
 * Human target for a single set, in the shape trainers read it:
 * WEIGHTED "12–15 × 40 kg", BODYWEIGHT "15 reps", DURATION "1 min",
 * CARDIO "20 min · 3 km". Returns null when the set has no targets at all.
 */
export function formatSetTarget(
  set: RoutineSetTarget,
  exerciseType: RoutineExerciseType,
  secondaryMetric: RoutineSecondaryMetric = 'KM',
): string | null {
  const reps = formatReps(set.targetRepsMin, set.targetRepsMax);
  if (exerciseType === 'WEIGHTED') {
    const kg = set.targetWeightKg != null ? `${trimNumber(set.targetWeightKg)} kg` : null;
    if (reps && kg) return `${reps} × ${kg}`;
    if (reps) return `${reps} reps`;
    return kg;
  }
  if (exerciseType === 'BODYWEIGHT') {
    return reps ? `${reps} reps` : null;
  }
  if (exerciseType === 'DURATION') {
    return formatDuration(set.targetDurationSec);
  }
  // CARDIO
  const parts = [
    formatDuration(set.targetDurationSec),
    secondaryMetric === 'STEPS'
      ? set.targetStepsCount != null
        ? `${set.targetStepsCount} steps`
        : null
      : secondaryMetric === 'NONE'
        ? null
        : formatDistance(set.targetDistance, secondaryMetric),
  ].filter((p): p is string => p !== null);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/**
 * One-line summary for a whole exercise: "3 × 12–15 × 40 kg" when every
 * working set shares a target, "4 sets" otherwise; warm-ups are counted
 * separately ("+ 1 warm-up") so "3 × 12" means three WORKING sets.
 */
export function summarizeExerciseTarget(
  sets: RoutineSetTarget[],
  exerciseType: RoutineExerciseType,
  secondaryMetric: RoutineSecondaryMetric = 'KM',
): string {
  const working = sets.filter((s) => s.setType !== 'WARMUP');
  const warmups = sets.length - working.length;
  const targets = working.map((s) => formatSetTarget(s, exerciseType, secondaryMetric));
  const first = targets[0];
  const uniform = working.length > 0 && targets.every((t) => t === first);

  let main: string;
  if (working.length === 0) {
    main = '';
  } else if (uniform && first) {
    main = `${working.length} × ${first}`;
  } else {
    main = `${working.length} ${working.length === 1 ? 'set' : 'sets'}`;
  }
  const warm = warmups > 0 ? `${warmups} warm-up${warmups === 1 ? '' : 's'}` : '';
  if (main && warm) return `${main} + ${warm}`;
  return main || warm || 'No sets';
}

export function formatRest(sec: number | null): string | null {
  if (sec == null) return null;
  return `Rest ${formatDuration(sec) ?? ''}`.trim();
}

/** Targets for planned sets the logger hasn't materialised as rows yet. */
export function ghostTargets(sets: RoutineSetTarget[], realRowCount: number): RoutineSetTarget[] {
  return sets.filter((s) => s.setNumber > realRowCount);
}

/**
 * Values to write into a logger row when the trainer taps a set's number to
 * "fill the target". Ranges fill the TOP of the range (the goal). Only fields
 * with a target are returned, so a tap never blanks something already typed.
 * CARDIO distance lives in the row's `notes` column (see WorkoutLogger colsFor).
 */
export function targetToSetValues(
  set: RoutineSetTarget,
  exerciseType: RoutineExerciseType,
  secondaryMetric: RoutineSecondaryMetric = 'KM',
): { reps?: number; weightKg?: number; durationSec?: number; stepsCount?: number; notes?: string } {
  const out: {
    reps?: number;
    weightKg?: number;
    durationSec?: number;
    stepsCount?: number;
    notes?: string;
  } = {};
  const reps = set.targetRepsMax ?? set.targetRepsMin;
  if ((exerciseType === 'WEIGHTED' || exerciseType === 'BODYWEIGHT') && reps != null) {
    out.reps = reps;
  }
  if (exerciseType === 'WEIGHTED' && set.targetWeightKg != null) {
    out.weightKg = set.targetWeightKg;
  }
  if ((exerciseType === 'DURATION' || exerciseType === 'CARDIO') && set.targetDurationSec != null) {
    out.durationSec = set.targetDurationSec;
  }
  if (exerciseType === 'CARDIO') {
    if (secondaryMetric === 'STEPS' && set.targetStepsCount != null) {
      out.stepsCount = set.targetStepsCount;
    }
    if ((secondaryMetric === 'KM' || secondaryMetric === 'METERS') && set.targetDistance != null) {
      out.notes = trimNumber(set.targetDistance);
    }
  }
  return out;
}

/** Index the session routine by exerciseId for O(1) card lookups. */
export function routineTargetsByExercise(
  routine: SessionRoutine | null | undefined,
): Map<string, SessionRoutineExercise> {
  return new Map((routine?.exercises ?? []).map((e) => [e.exerciseId, e]));
}
