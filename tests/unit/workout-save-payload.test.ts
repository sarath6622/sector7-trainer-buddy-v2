import { describe, it, expect } from 'vitest';
import {
  buildSavePayload,
  isSetComplete,
  normalizeSet,
  setSignature,
  signaturesOf,
  type ExerciseEntry,
  type SetData,
} from '@/components/workout/WorkoutLogger';

// Covers the "only save once the work fields are entered" rule and the per-set
// "saved" signatures that drive the green state in the workout logger.
//   - buildSavePayload drops partial sets (e.g. WEIGHTED kg without reps) and
//     exercises left with no complete set, while keeping each kept exercise's
//     original position as orderIndex.
//   - a row's signature changes the moment any value is edited, so the green
//     state only sticks while the on-screen values match what was saved.

function makeSet(over: Partial<SetData> = {}): SetData {
  return {
    setNumber: 1,
    reps: undefined,
    weightKg: undefined,
    durationSec: undefined,
    rpe: undefined,
    restSec: undefined,
    stepsCount: undefined,
    notes: '',
    ...over,
  };
}

function makeEntry(over: Partial<ExerciseEntry> = {}): ExerciseEntry {
  return {
    tempId: 'temp-1',
    exerciseId: 'ex-1',
    exerciseName: 'Bench Press',
    targetMuscle: 'Chest',
    category: 'Compound',
    exerciseType: 'WEIGHTED',
    secondaryMetric: 'NONE',
    sets: [makeSet()],
    collapsed: false,
    isCompleted: false,
    ...over,
  };
}

describe('isSetComplete', () => {
  it('WEIGHTED needs both reps and weight', () => {
    expect(isSetComplete(makeSet({ weightKg: 10, reps: 10 }), 'WEIGHTED')).toBe(true);
    expect(isSetComplete(makeSet({ weightKg: 10 }), 'WEIGHTED')).toBe(false);
    expect(isSetComplete(makeSet({ reps: 10 }), 'WEIGHTED')).toBe(false);
  });

  it('BODYWEIGHT needs reps only', () => {
    expect(isSetComplete(makeSet({ reps: 12 }), 'BODYWEIGHT')).toBe(true);
    expect(isSetComplete(makeSet(), 'BODYWEIGHT')).toBe(false);
  });

  it('DURATION and CARDIO need duration only', () => {
    expect(isSetComplete(makeSet({ durationSec: 60 }), 'DURATION')).toBe(true);
    expect(isSetComplete(makeSet({ durationSec: 60 }), 'CARDIO')).toBe(true);
    expect(isSetComplete(makeSet(), 'CARDIO')).toBe(false);
  });
});

describe('buildSavePayload', () => {
  it('keeps only complete sets within an exercise', () => {
    const entry = makeEntry({
      sets: [
        makeSet({ setNumber: 1, weightKg: 10, reps: 10 }),
        makeSet({ setNumber: 2, weightKg: 10 }), // partial — kg only
      ],
    });
    const payload = buildSavePayload([entry]);
    expect(payload).toHaveLength(1);
    expect(payload[0]!.sets).toHaveLength(1);
    expect(payload[0]!.sets[0]!.setNumber).toBe(1);
  });

  it('drops exercises with no complete set entirely', () => {
    const entry = makeEntry({ sets: [makeSet({ weightKg: 10 })] }); // kg, no reps
    expect(buildSavePayload([entry])).toEqual([]);
  });

  it('preserves original position as orderIndex when an earlier exercise is dropped', () => {
    const empty = makeEntry({ exerciseId: 'ex-empty', sets: [makeSet()] });
    const logged = makeEntry({
      exerciseId: 'ex-logged',
      sets: [makeSet({ weightKg: 20, reps: 8 })],
    });
    const payload = buildSavePayload([empty, logged]);
    expect(payload).toHaveLength(1);
    expect(payload[0]!.exerciseId).toBe('ex-logged');
    expect(payload[0]!.orderIndex).toBe(1); // its index in the full array, not 0
  });
});

describe('set signatures', () => {
  it('matches a saved set and breaks when any value is edited', () => {
    const entry = makeEntry({ sets: [makeSet({ weightKg: 10, reps: 10 })] });
    const saved = signaturesOf(buildSavePayload([entry]));

    // Same values → still saved (green).
    expect(saved.has(setSignature(entry.exerciseId, normalizeSet(entry.sets[0]!)))).toBe(true);

    // Edited reps → signature no longer matches (green drops).
    const edited = { ...entry.sets[0]!, reps: 12 };
    expect(saved.has(setSignature(entry.exerciseId, normalizeSet(edited)))).toBe(false);
  });
});
