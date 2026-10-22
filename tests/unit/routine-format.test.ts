import { describe, it, expect } from 'vitest';
import {
  formatReps,
  formatDuration,
  formatSetTarget,
  summarizeExerciseTarget,
  ghostTargets,
  targetToSetValues,
  routineTargetsByExercise,
  type RoutineSetTarget,
} from '@/lib/routine-format';

function set(over: Partial<RoutineSetTarget> = {}): RoutineSetTarget {
  return {
    setNumber: 1,
    setType: 'NORMAL',
    targetRepsMin: null,
    targetRepsMax: null,
    targetWeightKg: null,
    targetDurationSec: null,
    targetStepsCount: null,
    targetDistance: null,
    ...over,
  };
}

describe('formatReps', () => {
  it('formats fixed reps, ranges and unset', () => {
    expect(formatReps(12, 12)).toBe('12');
    expect(formatReps(12, null)).toBe('12');
    expect(formatReps(null, 15)).toBe('15');
    expect(formatReps(8, 12)).toBe('8–12');
    expect(formatReps(null, null)).toBeNull();
  });
});

describe('formatDuration', () => {
  it('uses seconds under a minute, minutes otherwise', () => {
    expect(formatDuration(45)).toBe('45s');
    expect(formatDuration(60)).toBe('1 min');
    expect(formatDuration(90)).toBe('1:30');
    expect(formatDuration(null)).toBeNull();
  });
});

describe('formatSetTarget', () => {
  it('WEIGHTED: reps × kg, or whichever is set', () => {
    expect(
      formatSetTarget(
        set({ targetRepsMin: 12, targetRepsMax: 15, targetWeightKg: 40 }),
        'WEIGHTED',
      ),
    ).toBe('12–15 × 40 kg');
    expect(formatSetTarget(set({ targetRepsMin: 15, targetRepsMax: 15 }), 'WEIGHTED')).toBe(
      '15 reps',
    );
    expect(formatSetTarget(set({ targetWeightKg: 22.5 }), 'WEIGHTED')).toBe('22.5 kg');
    expect(formatSetTarget(set(), 'WEIGHTED')).toBeNull();
  });

  it('BODYWEIGHT ignores weight; DURATION shows time', () => {
    expect(formatSetTarget(set({ targetRepsMin: 20, targetWeightKg: 10 }), 'BODYWEIGHT')).toBe(
      '20 reps',
    );
    expect(formatSetTarget(set({ targetDurationSec: 60 }), 'DURATION')).toBe('1 min');
  });

  it('CARDIO combines time with the exercise secondary metric', () => {
    const s = set({ targetDurationSec: 1200, targetDistance: 3, targetStepsCount: 2000 });
    expect(formatSetTarget(s, 'CARDIO', 'KM')).toBe('20 min · 3 km');
    expect(formatSetTarget(s, 'CARDIO', 'METERS')).toBe('20 min · 3 m');
    expect(formatSetTarget(s, 'CARDIO', 'STEPS')).toBe('20 min · 2000 steps');
    expect(formatSetTarget(s, 'CARDIO', 'NONE')).toBe('20 min');
  });
});

describe('summarizeExerciseTarget', () => {
  it('collapses uniform working sets to N × target', () => {
    const sets = [1, 2, 3].map((n) => set({ setNumber: n, targetRepsMin: 15, targetRepsMax: 15 }));
    expect(summarizeExerciseTarget(sets, 'WEIGHTED')).toBe('3 × 15 reps');
  });

  it('counts warm-ups separately from working sets', () => {
    const sets = [
      set({ setNumber: 1, setType: 'WARMUP', targetRepsMin: 20 }),
      set({ setNumber: 2, targetRepsMin: 12 }),
      set({ setNumber: 3, targetRepsMin: 12 }),
    ];
    expect(summarizeExerciseTarget(sets, 'WEIGHTED')).toBe('2 × 12 reps + 1 warm-up');
  });

  it('falls back to a set count when targets differ (pyramid)', () => {
    const sets = [
      set({ setNumber: 1, targetRepsMin: 12, targetWeightKg: 40 }),
      set({ setNumber: 2, targetRepsMin: 10, targetWeightKg: 45 }),
    ];
    expect(summarizeExerciseTarget(sets, 'WEIGHTED')).toBe('2 sets');
  });

  it('handles sets with no targets', () => {
    expect(summarizeExerciseTarget([set(), set({ setNumber: 2 })], 'WEIGHTED')).toBe('2 sets');
    expect(summarizeExerciseTarget([], 'WEIGHTED')).toBe('No sets');
  });
});

describe('ghostTargets', () => {
  it('returns only the planned sets beyond the rows already in the logger', () => {
    const sets = [1, 2, 3, 4].map((n) => set({ setNumber: n }));
    expect(ghostTargets(sets, 1).map((s) => s.setNumber)).toEqual([2, 3, 4]);
    expect(ghostTargets(sets, 4)).toEqual([]);
    expect(ghostTargets(sets, 6)).toEqual([]);
  });
});

describe('targetToSetValues', () => {
  it('fills the top of a rep range plus the weight for WEIGHTED', () => {
    expect(
      targetToSetValues(
        set({ targetRepsMin: 12, targetRepsMax: 15, targetWeightKg: 40 }),
        'WEIGHTED',
      ),
    ).toEqual({ reps: 15, weightKg: 40 });
  });

  it('never returns a field that has no target (a tap must not blank typed values)', () => {
    expect(targetToSetValues(set({ targetRepsMin: 10 }), 'WEIGHTED')).toEqual({ reps: 10 });
    expect(targetToSetValues(set(), 'WEIGHTED')).toEqual({});
  });

  it('ignores weight on BODYWEIGHT', () => {
    expect(targetToSetValues(set({ targetRepsMin: 20, targetWeightKg: 5 }), 'BODYWEIGHT')).toEqual({
      reps: 20,
    });
  });

  it('maps CARDIO distance into the notes column and steps into stepsCount', () => {
    const s = set({ targetDurationSec: 600, targetDistance: 1.5, targetStepsCount: 900 });
    expect(targetToSetValues(s, 'CARDIO', 'KM')).toEqual({ durationSec: 600, notes: '1.5' });
    expect(targetToSetValues(s, 'CARDIO', 'STEPS')).toEqual({ durationSec: 600, stepsCount: 900 });
    expect(targetToSetValues(s, 'CARDIO', 'NONE')).toEqual({ durationSec: 600 });
  });
});

describe('routineTargetsByExercise', () => {
  it('indexes by exerciseId and tolerates a null routine', () => {
    expect(routineTargetsByExercise(null).size).toBe(0);
    const map = routineTargetsByExercise({
      id: 'r',
      name: 'Day A',
      notes: null,
      exercises: [{ exerciseId: 'ex-1', orderIndex: 0, restSec: 90, notes: null, sets: [] }],
    });
    expect(map.get('ex-1')?.restSec).toBe(90);
  });
});
