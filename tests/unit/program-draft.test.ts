import { describe, it, expect } from 'vitest';
import {
  DraftError,
  defaultDraftSets,
  draftFromProgram,
  draftToInput,
  emptyDraftSet,
  moveItem,
  nextDraftSet,
  parseRepsField,
  type ProgramDetailDto,
  type ProgramDraft,
} from '@/components/routines/program-draft';
import { routineProgramInputSchema } from '@/lib/validators';

const bench = {
  id: 'ex-bench',
  name: 'Bench Press',
  targetMuscleGroup: 'Chest',
  category: 'STRENGTH',
  exerciseType: 'WEIGHTED' as const,
  secondaryMetric: 'KM' as const,
};

describe('parseRepsField', () => {
  it('parses fixed reps, ranges and blanks', () => {
    expect(parseRepsField('12')).toEqual({ min: 12, max: 12 });
    expect(parseRepsField('8-12')).toEqual({ min: 8, max: 12 });
    expect(parseRepsField(' 8 – 12 ')).toEqual({ min: 8, max: 12 });
    expect(parseRepsField('12-8')).toEqual({ min: 8, max: 12 });
    expect(parseRepsField('')).toEqual({ min: null, max: null });
  });
  it('rejects junk', () => {
    expect(parseRepsField('twelve')).toBeNull();
    expect(parseRepsField('12.5')).toBeNull();
  });
});

describe('nextDraftSet', () => {
  it('copies the previous set (Hevy behaviour) with a fresh key', () => {
    const prev = { ...emptyDraftSet(), reps: '12', weightKg: '40' };
    const next = nextDraftSet(prev);
    expect(next).toMatchObject({ reps: '12', weightKg: '40', setType: 'NORMAL' });
    expect(next.key).not.toBe(prev.key);
  });
  it('turns a warm-up follower into a working set', () => {
    expect(nextDraftSet({ ...emptyDraftSet(), setType: 'WARMUP' }).setType).toBe('NORMAL');
  });
});

describe('defaultDraftSets', () => {
  it("defaults to the gym's 3 × 15 for rep-based exercises", () => {
    const sets = defaultDraftSets('WEIGHTED');
    expect(sets).toHaveLength(3);
    expect(sets.every((s) => s.reps === '15')).toBe(true);
    expect(defaultDraftSets('DURATION').every((s) => s.durationSec === '60')).toBe(true);
  });
});

describe('draft ⇄ input', () => {
  const program: ProgramDetailDto = {
    id: 'prog-1',
    name: 'PPL',
    notes: null,
    clientProfileId: null,
    sourceProgramId: null,
    isActive: true,
    isArchived: false,
    updatedAt: '2026-10-18T00:00:00.000Z',
    routines: [
      {
        id: 'r-a',
        name: 'Push Day',
        notes: null,
        orderIndex: 0,
        exercises: [
          {
            id: 're-1',
            exerciseId: 'ex-bench',
            orderIndex: 0,
            restSec: 90,
            notes: null,
            exercise: bench,
            sets: [
              {
                setNumber: 1,
                setType: 'WARMUP',
                targetRepsMin: 20,
                targetRepsMax: 20,
                targetWeightKg: null,
                targetDurationSec: null,
                targetStepsCount: null,
                targetDistance: null,
              },
              {
                setNumber: 2,
                setType: 'NORMAL',
                targetRepsMin: 12,
                targetRepsMax: 15,
                targetWeightKg: 40,
                targetDurationSec: null,
                targetStepsCount: null,
                targetDistance: null,
              },
            ],
          },
        ],
      },
    ],
  };

  it('round-trips a stored program, keeping the routine id for PUT', () => {
    const draft = draftFromProgram(program);
    expect(draft.routines[0]?.exercises[0]?.sets[1]?.reps).toBe('12-15');
    const input = draftToInput(draft);
    expect(input.routines[0]?.id).toBe('r-a');
    expect(input.routines[0]?.exercises[0]).toEqual({
      exerciseId: 'ex-bench',
      restSec: 90,
      notes: null,
      sets: [
        {
          setType: 'WARMUP',
          targetRepsMin: 20,
          targetRepsMax: 20,
          targetWeightKg: null,
          targetDurationSec: null,
          targetStepsCount: null,
          targetDistance: null,
        },
        {
          setType: 'NORMAL',
          targetRepsMin: 12,
          targetRepsMax: 15,
          targetWeightKg: 40,
          targetDurationSec: null,
          targetStepsCount: null,
          targetDistance: null,
        },
      ],
    });
    expect(routineProgramInputSchema.safeParse(input).success).toBe(true);
  });

  it('names the exact routine, exercise and set when a field is unparseable', () => {
    const draft: ProgramDraft = draftFromProgram(program);
    draft.routines[0]!.exercises[0]!.sets[1]!.reps = 'lots';
    expect(() => draftToInput(draft)).toThrow(DraftError);
    expect(() => draftToInput(draft)).toThrow('Push Day · Bench Press · set 2');
  });

  it('the shared schema rejects a routine with the same exercise twice', () => {
    const draft = draftFromProgram(program);
    const ex = draft.routines[0]!.exercises[0]!;
    draft.routines[0]!.exercises.push({ ...ex, key: 'dup' });
    expect(routineProgramInputSchema.safeParse(draftToInput(draft)).success).toBe(false);
  });
});

describe('moveItem', () => {
  it('moves within bounds and ignores out-of-range moves', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
    expect(moveItem(['a', 'b', 'c'], 2, -1)).toEqual(['a', 'c', 'b']);
    expect(moveItem(['a', 'b'], 0, -1)).toEqual(['a', 'b']);
  });
});
