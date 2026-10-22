// ADR-053 — editor state for a routine program, and the conversions between
// it, the API's ProgramDetail and the ProgramInput the API accepts. Inputs are
// kept as strings while editing (empty = no target) and parsed on save. Pure —
// unit-tested in tests/unit/program-draft.test.ts.

import type {
  RoutineExerciseType,
  RoutineSecondaryMetric,
  RoutineSetTarget,
  RoutineSetType,
} from '@/lib/routine-format';
import type { RoutineProgramInput } from '@/lib/validators';

// ─── API shapes (client side: dates arrive as strings) ───────────────────────

export interface ExerciseLite {
  id: string;
  name: string;
  targetMuscleGroup: string;
  category: string;
  exerciseType: RoutineExerciseType;
  secondaryMetric: RoutineSecondaryMetric;
}

export interface RoutineDetailDto {
  id: string;
  name: string;
  notes: string | null;
  orderIndex: number;
  exercises: {
    id: string;
    exerciseId: string;
    orderIndex: number;
    restSec: number | null;
    notes: string | null;
    exercise: ExerciseLite;
    sets: RoutineSetTarget[];
  }[];
}

export interface ProgramDetailDto {
  id: string;
  name: string;
  notes: string | null;
  clientProfileId: string | null;
  sourceProgramId: string | null;
  isActive: boolean;
  isArchived: boolean;
  updatedAt: string;
  routines: RoutineDetailDto[];
}

export interface ClientProgramDto extends ProgramDetailDto {
  nextRoutineId: string | null;
  lastUsed: { routineId: string; sessionId: string; scheduledDate: string } | null;
}

export interface ProgramSummaryDto {
  id: string;
  name: string;
  notes: string | null;
  isArchived: boolean;
  updatedAt: string;
  routineCount: number;
  exerciseCount: number;
  routines: { id: string; name: string; exerciseCount: number }[];
}

// ─── Draft ───────────────────────────────────────────────────────────────────

export interface DraftSet {
  key: string;
  setType: RoutineSetType;
  reps: string; // "12" or "12-15"
  weightKg: string;
  durationSec: string;
  stepsCount: string;
  distance: string;
}

export interface DraftExercise {
  key: string;
  exercise: ExerciseLite;
  restSec: string;
  notes: string;
  sets: DraftSet[];
}

export interface DraftRoutine {
  key: string;
  id?: string; // existing routine id — kept on PUT so linked sessions stay linked
  name: string;
  notes: string;
  exercises: DraftExercise[];
}

export interface ProgramDraft {
  name: string;
  notes: string;
  routines: DraftRoutine[];
}

let keySeq = 0;
export function newKey(prefix: string): string {
  keySeq += 1;
  return `${prefix}-${Date.now().toString(36)}-${keySeq}`;
}

const numToStr = (n: number | null | undefined) => (n == null ? '' : String(n));

export function emptyDraftSet(): DraftSet {
  return {
    key: newKey('set'),
    setType: 'NORMAL',
    reps: '',
    weightKg: '',
    durationSec: '',
    stepsCount: '',
    distance: '',
  };
}

/** Hevy behaviour: a new set starts as a copy of the one above it. */
export function nextDraftSet(previous: DraftSet | undefined): DraftSet {
  if (!previous) return emptyDraftSet();
  return {
    ...previous,
    key: newKey('set'),
    // A warm-up's follower is a working set, not another warm-up.
    setType: previous.setType === 'WARMUP' ? 'NORMAL' : previous.setType,
  };
}

/** Default for an exercise freshly added in the editor: the gym's 3 × 15. */
export function defaultDraftSets(type: RoutineExerciseType): DraftSet[] {
  return [0, 1, 2].map(() => ({
    ...emptyDraftSet(),
    reps: type === 'WEIGHTED' || type === 'BODYWEIGHT' ? '15' : '',
    durationSec: type === 'DURATION' ? '60' : '',
  }));
}

export function emptyDraftRoutine(index: number): DraftRoutine {
  const letter = String.fromCharCode(65 + (index % 26));
  return { key: newKey('routine'), name: `Day ${letter}`, notes: '', exercises: [] };
}

export function emptyProgramDraft(): ProgramDraft {
  return { name: '', notes: '', routines: [emptyDraftRoutine(0)] };
}

function repsToStr(min: number | null, max: number | null): string {
  if (min == null && max == null) return '';
  if (min == null) return String(max);
  if (max == null || max === min) return String(min);
  return `${min}-${max}`;
}

export function draftFromProgram(program: ProgramDetailDto): ProgramDraft {
  return {
    name: program.name,
    notes: program.notes ?? '',
    routines: program.routines.map((r) => ({
      key: newKey('routine'),
      id: r.id,
      name: r.name,
      notes: r.notes ?? '',
      exercises: r.exercises.map((e) => ({
        key: newKey('ex'),
        exercise: e.exercise,
        restSec: numToStr(e.restSec),
        notes: e.notes ?? '',
        sets: e.sets.map((s) => ({
          key: newKey('set'),
          setType: s.setType,
          reps: repsToStr(s.targetRepsMin, s.targetRepsMax),
          weightKg: numToStr(s.targetWeightKg),
          durationSec: numToStr(s.targetDurationSec),
          stepsCount: numToStr(s.targetStepsCount),
          distance: numToStr(s.targetDistance),
        })),
      })),
    })),
  };
}

/**
 * Parse the reps field. Accepts "12", "12-15", "12 – 15". Returns
 * `{ min, max }` (both null when blank) or `null` when unparseable.
 */
export function parseRepsField(value: string): { min: number | null; max: number | null } | null {
  const v = value.trim();
  if (v === '') return { min: null, max: null };
  const single = /^(\d{1,3})$/.exec(v);
  if (single) {
    const n = Number(single[1]);
    return { min: n, max: n };
  }
  const range = /^(\d{1,3})\s*[-–—to]+\s*(\d{1,3})$/i.exec(v);
  if (range) {
    const a = Number(range[1]);
    const b = Number(range[2]);
    return { min: Math.min(a, b), max: Math.max(a, b) };
  }
  return null;
}

function strToNum(value: string): number | null {
  const v = value.trim();
  if (v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

export class DraftError extends Error {}

/**
 * Convert the draft to the API body. Throws DraftError with a message that
 * names the routine/exercise when a field can't be parsed; range/limit checks
 * are left to the shared Zod schema the caller runs next.
 */
export function draftToInput(draft: ProgramDraft): RoutineProgramInput {
  return {
    name: draft.name,
    notes: draft.notes.trim() === '' ? null : draft.notes,
    routines: draft.routines.map((r) => ({
      ...(r.id ? { id: r.id } : {}),
      name: r.name,
      notes: r.notes.trim() === '' ? null : r.notes,
      exercises: r.exercises.map((e) => {
        const rest = strToNum(e.restSec);
        if (Number.isNaN(rest)) {
          throw new DraftError(`${r.name} · ${e.exercise.name}: rest must be a number of seconds`);
        }
        return {
          exerciseId: e.exercise.id,
          restSec: rest,
          notes: e.notes.trim() === '' ? null : e.notes,
          sets: e.sets.map((s, idx) => {
            const label = `${r.name} · ${e.exercise.name} · set ${idx + 1}`;
            const reps = parseRepsField(s.reps);
            if (!reps) throw new DraftError(`${label}: reps should look like 12 or 8-12`);
            const fields = {
              targetWeightKg: strToNum(s.weightKg),
              targetDurationSec: strToNum(s.durationSec),
              targetStepsCount: strToNum(s.stepsCount),
              targetDistance: strToNum(s.distance),
            };
            for (const [k, v] of Object.entries(fields)) {
              if (Number.isNaN(v))
                throw new DraftError(`${label}: ${k.replace('target', '')} must be a number`);
            }
            return {
              setType: s.setType,
              targetRepsMin: reps.min,
              targetRepsMax: reps.max,
              ...fields,
            };
          }),
        };
      }),
    })),
  };
}

/** Move an item one slot up (-1) or down (+1); out-of-range moves are no-ops. */
export function moveItem<T>(items: T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(index, 1);
  if (item === undefined) return items;
  next.splice(target, 0, item);
  return next;
}
