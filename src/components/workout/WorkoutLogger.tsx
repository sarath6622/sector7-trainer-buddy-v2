'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { flushSync } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Plus,
  Search,
  Trash2,
  Check,
  X,
  Dumbbell,
  Activity,
  Timer,
  User2,
  ChevronDown,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Clock,
  Sparkles,
  Loader2,
  AlertCircle,
  History as HistoryIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { BadgeCelebration } from '@/components/badges/BadgeCelebration';
import { MuscleGroupPicker, GROUP_THEME, type PickedExercise } from './MuscleGroupPicker';
import { WorkoutHistoryList } from './WorkoutHistoryList';
import {
  CURATED_MUSCLE_GROUPS,
  curatedGroupOf,
  type CuratedMuscleGroupId,
} from '@/lib/muscle-groups';
import { writeOutbox, readOutbox, clearOutbox } from '@/lib/workout-outbox';
import { workoutSetSchema } from '@/lib/validators';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';

type ExerciseType = 'WEIGHTED' | 'BODYWEIGHT' | 'DURATION' | 'CARDIO';

interface ExerciseOption {
  id: string;
  name: string;
  targetMuscleGroup: string;
  category: string;
  exerciseType: ExerciseType;
  secondaryMetric: SecondaryMetric;
  equipmentRequired: string | null;
}

export interface SetData {
  setNumber: number;
  reps: number | undefined;
  weightKg: number | undefined;
  durationSec: number | undefined;
  rpe: number | undefined;
  restSec: number | undefined;
  // Only populated when the parent exercise has secondaryMetric=STEPS
  // (e.g. Stair Climber). Other CARDIO exercises store km in `notes`.
  stepsCount: number | undefined;
  notes: string;
}

// A fresh, blank set row — every metric empty. Shared by the "add exercise"
// and "Add Set" paths, and used as the single placeholder row when an exercise
// is hydrated from the server with no logged sets yet (added-but-not-logged).
export function emptySet(setNumber: number): SetData {
  return {
    setNumber,
    reps: undefined,
    weightKg: undefined,
    durationSec: undefined,
    rpe: undefined,
    restSec: undefined,
    stepsCount: undefined,
    notes: '',
  };
}

type SecondaryMetric = 'KM' | 'STEPS' | 'METERS' | 'NONE';

interface LastSetSnapshot {
  setNumber: number;
  reps: number | null;
  weightKg: number | null;
  durationSec: number | null;
  rpe: number | null;
  restSec: number | null;
  stepsCount: number | null;
}

export interface ExerciseEntry {
  tempId: string;
  exerciseId: string;
  exerciseName: string;
  targetMuscle: string;
  category: string;
  exerciseType: ExerciseType;
  // Only meaningful for CARDIO; drives which second column the logger
  // renders. Defaulted to 'KM' for entries hydrated before the field existed
  // server-side.
  secondaryMetric: SecondaryMetric;
  sets: SetData[];
  collapsed: boolean;
  // ADR-037: mark-complete state. Completed exercises sort to the bottom
  // of the list, render with a strikethrough header + "Completed" pill,
  // default-collapsed. Tapping still expands them so the user can add or
  // edit sets; "Unmark" inside the card flips this back to false.
  isCompleted: boolean;
}

type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface WorkoutLoggerProps {
  sessionInstanceId: string;
  clientProfileId?: string; // when set, enables per-exercise progress modal
  clientName?: string; // shown in the workout-log header so the trainer always knows whose log this is
  onUnsavedChange?: (hasUnsaved: boolean) => void;
  // Called when the app returns to the foreground (tab re-focused / phone
  // unlocked). The parent should refetch the session so the screen reflects the
  // latest server state instead of showing stale data after a long background.
  onForeground?: () => void;
  onRequestRest?: () => void; // when set, shows a Rest button alongside Add Set
  // Most-recently-finished rest timer total in seconds. When set, the next
  // Add Set click prefills the new row's `restSec` and the consumer should
  // clear this via `onConsumeRest` so it isn't reused for subsequent sets.
  lastFinishedRestSec?: number | null;
  onConsumeRest?: () => void;
  // Live rest-timer state. When the active row matches `pendingRestTarget`,
  // its rest cell renders the live countdown instead of the idle button.
  restTimerRemaining?: number | null;
  restTimerPaused?: boolean;
  existingLogs?: {
    id: string;
    exerciseId: string;
    orderIndex: number;
    // ADR-037 — optional for backwards-compat with any legacy caller that
    // narrows the shape; the API returns it on all reads.
    isCompleted?: boolean;
    exercise: {
      id: string;
      name: string;
      targetMuscleGroup: string;
      category: string;
      exerciseType: ExerciseType;
      // Older API readers may omit this — defaults to 'KM' on hydration.
      secondaryMetric?: SecondaryMetric;
    };
    sets: {
      setNumber: number;
      reps: number | null;
      weightKg: number | null;
      durationSec: number | null;
      rpe: number | null;
      restSec: number | null;
      stepsCount?: number | null;
      notes: string | null;
    }[];
  }[];
}

// ─── Type config ─────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<
  ExerciseType,
  { label: string; icon: React.ElementType; accent: string; bg: string; text: string }
> = {
  WEIGHTED: {
    label: 'Weighted',
    icon: Dumbbell,
    accent: '#3b82f6',
    bg: 'bg-blue-500/10',
    text: 'text-blue-500',
  },
  BODYWEIGHT: {
    label: 'Bodyweight',
    icon: User2,
    accent: '#22c55e',
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-500',
  },
  DURATION: {
    label: 'Duration',
    icon: Timer,
    accent: '#f59e0b',
    bg: 'bg-amber-500/10',
    text: 'text-amber-500',
  },
  CARDIO: {
    label: 'Cardio',
    icon: Activity,
    accent: '#ef4444',
    bg: 'bg-red-500/10',
    text: 'text-red-500',
  },
};

type ColDef = { key: keyof SetData; label: string; step?: string; min?: number; max?: number };

// Mobile keypad selection per column. `decimal` for fields that accept
// fractional values (kg, distance in km/m); `numeric` for whole-number fields
// (reps, seconds, steps). `numeric` shows a tighter keypad (no decimal point)
// which reduces mis-taps for reps and rest seconds — the most-typed fields.
function inputModeFor(key: keyof SetData): 'decimal' | 'numeric' {
  return key === 'weightKg' || key === 'notes' ? 'decimal' : 'numeric';
}

// Raise the mobile soft keyboard the moment the search opens. iOS Safari only
// opens the keyboard when focus() runs *inside* the originating tap gesture,
// but our search input mounts a render later — so a deferred focus moves the
// cursor without showing the keyboard. Trick: synchronously focus a throwaway
// off-screen input while still in the tap, which raises the keyboard; the
// real input then takes focus on mount and the keyboard stays up. Must be
// called directly from the tap handler (not a setTimeout) to keep the gesture.
function primeMobileKeyboard() {
  if (typeof document === 'undefined') return;
  const ghost = document.createElement('input');
  ghost.type = 'text';
  // Off-screen but focusable — display:none / visibility:hidden can't focus.
  // 16px font-size avoids iOS auto-zoom; opacity 0 keeps it invisible.
  ghost.style.cssText =
    'position:fixed;top:0;left:0;height:1px;width:1px;opacity:0;font-size:16px;border:0;padding:0;z-index:-1;';
  document.body.appendChild(ghost);
  ghost.focus();
  // The real input grabs focus ~50ms later (showSearch effect); remove the
  // ghost after that so focus has already moved and the keyboard never drops.
  setTimeout(() => ghost.remove(), 500);
}

// Rest column is shown alongside the type-specific work columns. We surface
// rest taken before the set instead of RPE — the rpe field still exists on
// the model but is no longer entered here (other surfaces / future trainer
// modes can bring it back if needed). Capped at 60 min via the rest timer
// validator; the input accepts seconds for compactness.
//
// CARDIO's second column is per-exercise (Exercise.secondaryMetric):
//   KM     → distance in km, stored in WorkoutSet.notes (legacy)
//   STEPS  → integer step count, stored in WorkoutSet.stepsCount (Stair Climber)
//   METERS → distance in m, stored in WorkoutSet.notes
//   NONE   → no second column (just duration)
// Resolve via `colsFor(entry)` rather than a static lookup.
const STATIC_TYPE_COLS: Record<Exclude<ExerciseType, 'CARDIO'>, ColDef[]> = {
  WEIGHTED: [
    { key: 'weightKg', label: 'kg', step: '0.5' },
    { key: 'reps', label: 'Reps' },
    { key: 'restSec', label: 'Rest', min: 0, max: 3600 },
  ],
  BODYWEIGHT: [
    { key: 'reps', label: 'Reps' },
    { key: 'restSec', label: 'Rest', min: 0, max: 3600 },
  ],
  DURATION: [
    { key: 'durationSec', label: 'sec' },
    { key: 'restSec', label: 'Rest', min: 0, max: 3600 },
  ],
};

function colsFor(exerciseType: ExerciseType, secondaryMetric: SecondaryMetric): ColDef[] {
  if (exerciseType !== 'CARDIO') {
    return STATIC_TYPE_COLS[exerciseType] ?? STATIC_TYPE_COLS.WEIGHTED;
  }
  const second: ColDef | null =
    secondaryMetric === 'STEPS'
      ? { key: 'stepsCount', label: 'steps', min: 0, max: 100000 }
      : secondaryMetric === 'METERS'
        ? { key: 'notes', label: 'm' }
        : secondaryMetric === 'NONE'
          ? null
          : { key: 'notes', label: 'km' };
  return second
    ? [{ key: 'durationSec', label: 'sec' }, second]
    : [{ key: 'durationSec', label: 'sec' }];
}

// Resolve the unit displayed in the per-exercise Progress modal. For CARDIO
// this mirrors the second-column metric so the chart axis matches what the
// trainer just typed in.
function progressUnitFor(
  exerciseType: ExerciseType,
  secondaryMetric: SecondaryMetric,
): 'kg' | 'km' | 'steps' | 'm' | 'sec' | 'reps' {
  if (exerciseType === 'WEIGHTED') return 'kg';
  if (exerciseType === 'DURATION') return 'sec';
  if (exerciseType === 'CARDIO') {
    if (secondaryMetric === 'STEPS') return 'steps';
    if (secondaryMetric === 'METERS') return 'm';
    return 'km';
  }
  return 'reps';
}

// A set only "counts" once its type's required work fields are filled — the
// same gate the mark-complete pill uses (WEIGHTED needs reps + kg, BODYWEIGHT
// needs reps, DURATION/CARDIO need duration). Partial rows (kg but no reps)
// are treated as not-yet-entered: excluded from the save payload so a half-
// typed set never hits the DB, and never rendered in the saved (green) state.
const hasValue = (v: number | null | undefined) => v !== undefined && v !== null;

// Per-field mirror of the server's workoutSetSchema constraints (reps/duration
// are positive ints, weight > 0, rest 0–3600s, …). The set cells are free-text
// inputs behind a bare parseFloat, so values the API rejects (0 reps, 12.5 reps)
// are typeable; checking with the same schema lets the UI flag the exact cell.
export function isSetFieldValid(key: keyof SetData, value: number | string | undefined): boolean {
  if (value === undefined || key === 'notes') return true;
  return workoutSetSchema.shape[key].safeParse(value).success;
}

export function isSetComplete(set: SetData, exerciseType: ExerciseType): boolean {
  const requiredFilled = (() => {
    switch (exerciseType) {
      case 'WEIGHTED':
        return hasValue(set.reps) && hasValue(set.weightKg);
      case 'BODYWEIGHT':
        return hasValue(set.reps);
      case 'DURATION':
      case 'CARDIO':
        return hasValue(set.durationSec);
    }
  })();
  // …and every entered value must be one the server will accept. The POST is a
  // full session snapshot, so a single rejected value (0 reps, decimal reps)
  // 422s the save for EVERYTHING logged after it — such a set must stay a
  // local draft until the offending cell is corrected.
  return requiredFilled && workoutSetSchema.safeParse(normalizeSet(set)).success;
}

// Canonical wire shape for a single set. Shared by the save payload, the
// unsaved-diff hash, and the per-set "saved" signature so all three agree on
// exactly what counts as a change.
export function normalizeSet(s: SetData) {
  return {
    setNumber: s.setNumber,
    reps: s.reps,
    weightKg: s.weightKg,
    durationSec: s.durationSec,
    rpe: s.rpe,
    restSec: s.restSec,
    stepsCount: s.stepsCount,
    notes: s.notes || undefined,
  };
}

export type SavePayloadEntry = {
  exerciseId: string;
  orderIndex: number;
  isCompleted: boolean;
  sets: ReturnType<typeof normalizeSet>[];
};

// A row "has ink" once the user typed anything into it, even if it isn't
// complete enough to save (kg without reps). Such rows live only in local
// state — buildSavePayload drops them.
const setHasAnyValue = (s: SetData) =>
  hasValue(s.reps) ||
  hasValue(s.weightKg) ||
  hasValue(s.durationSec) ||
  hasValue(s.rpe) ||
  hasValue(s.restSec) ||
  hasValue(s.stepsCount) ||
  (s.notes ?? '').trim() !== '';

// True when local state holds work the save payload can't carry: a half-typed
// set, or extra blank rows beyond what's saved (a fresh "Add Set"). The
// payload-hash comparison alone reports both as "nothing unsaved", which let
// the 10s poll / Pusher refetch rehydrate from the server and wipe a row the
// user was mid-way through typing. Every card renders one blank placeholder
// row even for a zero-set log, so a single empty row is never a draft.
export function hasDraftRows(exercises: ExerciseEntry[], lastSaved: SavePayloadEntry[]): boolean {
  const savedSetCount = new Map(lastSaved.map((e) => [e.exerciseId, e.sets.length]));
  for (const e of exercises) {
    if (e.sets.length > Math.max(1, savedSetCount.get(e.exerciseId) ?? 0)) return true;
    for (const s of e.sets) {
      if (!isSetComplete(s, e.exerciseType) && setHasAnyValue(s)) return true;
    }
  }
  return false;
}

// Build the POST body. An exercise is persisted as soon as it's added — its
// row (position + completion flag) survives a tab switch or navigation even
// before any set is logged, so the trainer never has to re-add it. Within each
// exercise only *complete* sets are included; a half-typed set (e.g. WEIGHTED
// kg without reps) is dropped so it never hits the DB. The backend replaces the
// session's logs with exactly this, so an exercise with no complete set yet
// persists as a zero-set log. `orderIndex` is the entry's position in the list.
export function buildSavePayload(exercises: ExerciseEntry[]): SavePayloadEntry[] {
  return exercises.map((entry, idx) => ({
    exerciseId: entry.exerciseId,
    orderIndex: idx,
    isCompleted: entry.isCompleted,
    sets: entry.sets.filter((s) => isSetComplete(s, entry.exerciseType)).map(normalizeSet),
  }));
}

// Drop any recovered set the server would reject. Outboxes written before the
// client mirrored workoutSetSchema can carry invalid values (0 reps, decimal
// reps); a validation reject is deterministic, so replaying them verbatim
// would 422 on every mount forever. Exercises keep their structural row even
// when all of their sets are dropped.
export function sanitizeRecoveredExercises(exercises: SavePayloadEntry[]): SavePayloadEntry[] {
  return exercises.map((e) => ({
    ...e,
    sets: e.sets.filter((s) => workoutSetSchema.safeParse(s).success),
  }));
}

// Per-set identity used to flag a row as saved. Encodes the exercise plus the
// exact persisted values, so any edit to the row changes the signature and the
// green state drops until the next successful save re-records it.
export function setSignature(exerciseId: string, set: ReturnType<typeof normalizeSet>): string {
  return `${exerciseId}::${JSON.stringify(set)}`;
}
export function signaturesOf(payload: SavePayloadEntry[]): Set<string> {
  const out = new Set<string>();
  for (const e of payload) for (const s of e.sets) out.add(setSignature(e.exerciseId, s));
  return out;
}

// Diff the last-saved snapshot against the current one so the server can scope
// the write to exactly what THIS device changed (ADR-036 shared write path).
// Without scoping, two writers each POST a full snapshot and the last one wins —
// a trainer saving a stale view silently deletes a set the client just logged.
// With it:
//   • dirtyExerciseIds — exercises whose values changed (or are brand new); the
//     server reconciles only these (upsert sets + drop the ones removed within).
//   • removedExerciseIds — exercises that were saved before but the user has
//     since deleted; the server drops exactly these.
// Everything the writer didn't touch is left alone, so a peer's concurrent edit
// to a different exercise survives.
export function diffExercises(
  lastSaved: SavePayloadEntry[],
  current: SavePayloadEntry[],
): {
  dirtyExerciseIds: string[];
  removedExerciseIds: string[];
  removedSetsByExerciseId: Record<string, number[]>;
} {
  const lastById = new Map(lastSaved.map((e) => [e.exerciseId, e]));
  const currentIds = new Set(current.map((e) => e.exerciseId));
  const dirty = current.filter(
    (e) => JSON.stringify(lastById.get(e.exerciseId)) !== JSON.stringify(e),
  );
  const removedExerciseIds = lastSaved
    .filter((e) => !currentIds.has(e.exerciseId))
    .map((e) => e.exerciseId);
  // Set numbers this device explicitly dropped within each dirty exercise.
  // The server's per-set merge deletes ONLY these, so set rows the writer has
  // never seen — a peer's concurrent additions to the SAME exercise — survive
  // a save from a stale copy. Always sent (even when empty) so the server can
  // tell a per-set-aware writer from a legacy bundle.
  const removedSetsByExerciseId: Record<string, number[]> = {};
  for (const e of dirty) {
    const prev = lastById.get(e.exerciseId);
    if (!prev) continue;
    const currentSetNums = new Set(e.sets.map((s) => s.setNumber));
    const removed = prev.sets.map((s) => s.setNumber).filter((n) => !currentSetNums.has(n));
    if (removed.length > 0) removedSetsByExerciseId[e.exerciseId] = removed;
  }
  return {
    dirtyExerciseIds: dirty.map((e) => e.exerciseId),
    removedExerciseIds,
    removedSetsByExerciseId,
  };
}

// ─── WorkoutLogger ────────────────────────────────────────────────────────────

export function WorkoutLogger({
  sessionInstanceId,
  clientProfileId,
  clientName: _clientName,
  onUnsavedChange,
  onForeground,
  onRequestRest,
  lastFinishedRestSec,
  onConsumeRest,
  restTimerRemaining,
  restTimerPaused,
  existingLogs,
}: WorkoutLoggerProps) {
  const [exercises, setExercises] = useState<ExerciseEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ExerciseOption[]>([]);
  // True when the server found no strict match and fell back to near
  // misses. They're worth showing — a trainer mistyping a lift shouldn't
  // hit a dead end — but they must be labelled as guesses, not hits.
  const [searchRelaxed, setSearchRelaxed] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  // Filter chips inside the search modal. Either filter alone (no query)
  // still triggers a fetch so trainers can browse "all chest" without typing.
  const [searchMuscleGroups, setSearchMuscleGroups] = useState<Set<CuratedMuscleGroupId>>(
    new Set(),
  );
  const [searchExerciseType, setSearchExerciseType] = useState<ExerciseType | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  // Multi-select cart inside the search modal. Tapping a row toggles its ID
  // in this set; the footer "Add N to workout" button commits the batch via
  // `addExercisesFromPicker` so we reuse the existing dedupe + collapse logic.
  const [searchSelectedIds, setSearchSelectedIds] = useState<Set<string>>(new Set());
  const [autoSaveStatus, setAutoSaveStatus] = useState<AutoSaveStatus>('idle');
  // Per-set signatures (exerciseId + persisted values) for every set currently
  // saved to the server. A row whose live values match its signature renders
  // green; any edit drops the match until the next successful save.
  const [savedSignatures, setSavedSignatures] = useState<Set<string>>(() => new Set());
  // When the trainer taps the per-row Rest button, we remember which set
  // requested it. The next finished/stopped rest writes to that exact set
  // (covers the edge case where the rest is "after the last set" — Add Set
  // would never get called there). When unset, the addSet fallback writes
  // to the previous set instead.
  const [pendingRestTarget, setPendingRestTarget] = useState<{
    tempId: string;
    setNumber: number;
  } | null>(null);
  // Hash of the payload last successfully sent to the server. We compare the
  // current payload against this to decide whether anything is unsaved —
  // covers add/edit/remove/reorder uniformly without a per-entry dirty flag.
  const lastSavedHashRef = useRef<string>('[]');
  // The structured payload behind `lastSavedHashRef`. `diffExercises` reads it
  // to tell the server which exercises this device changed vs the last sync, so
  // the write merges with a peer's concurrent edits instead of replacing them.
  const lastSavedPayloadRef = useRef<SavePayloadEntry[]>([]);
  // In-flight tracking so the debounced auto-save never fires concurrent
  // POSTs (which could race and clobber each other).
  const inFlightRef = useRef(false);
  const pendingRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusFadeRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Structural changes (exercise add/remove/mark-complete) bypass the 5s
  // typing debounce so the peer's screen reflects the new state in <1s
  // instead of feeling laggy. Set by the handler, consumed by the debounce
  // useEffect on the next render.
  const flushImmediatelyRef = useRef(false);
  // Prior-session sets per exercise, keyed by exerciseId. Kept separate from
  // `exercises` so it survives hydration (parent refetches replace
  // existingLogs but mustn't wipe placeholders). Empty array = fetched, no
  // prior data; key absent = not yet fetched.
  const [lastSetsByExId, setLastSetsByExId] = useState<Map<string, LastSetSnapshot[]>>(
    () => new Map(),
  );
  const [celebrationBadges, setCelebrationBadges] = useState<
    { name: string; icon: string; description?: string }[]
  >([]);
  const [autoPostIds, setAutoPostIds] = useState<string[]>([]);
  const [progressModal, setProgressModal] = useState<{
    exerciseId: string;
    exerciseName: string;
    unit: string;
  } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Top-level view inside the session screen. 'log' is the live workout
  // logger; 'history' shows past sessions for the same client (read-only).
  // Switching between them keeps state in WorkoutLogger so auto-save and
  // pending picker state survive a quick peek at history.
  const [view, setView] = useState<'log' | 'history'>('log');
  // 'groups' opens the standard muscle-group picker; 'suggestions' jumps
  // straight to the exercise list with all 8 curated groups pre-selected so
  // the trainer can recall every past exercise without picking again.
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  // Today's focus — the curated muscle groups the trainer has committed to
  // for this session. Fed by every Continue action in the picker (empty-state
  // and "By Muscle"), and used as the filter when the trainer hits
  // "Suggestions" so the recall list matches the day's plan instead of
  // dumping every past exercise.
  const [focusGroupIds, setFocusGroupIds] = useState<Set<CuratedMuscleGroupId>>(new Set());
  // While a numeric cell is being edited we keep the raw keystroke string here,
  // keyed by `${exIdx}-${setIdx}-${field}`. Without this, coercing to a number on
  // every keystroke strips a trailing "." or ".0" — making decimals like 100.5
  // impossible to type. Cleared on blur so the field reverts to the canonical value.
  const [cellDrafts, setCellDrafts] = useState<Record<string, string>>({});
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!existingLogs || existingLogs.length === 0) return;

    type Log = (typeof existingLogs)[number];
    type RawSet = Log['sets'][number];

    // Score a set by how many fields have data (higher = more complete)
    const score = (s: RawSet) =>
      (s.reps != null ? 1 : 0) +
      (s.weightKg != null ? 1 : 0) +
      (s.durationSec != null ? 1 : 0) +
      (s.rpe != null ? 1 : 0);

    // Group duplicate WorkoutLog records by exercise.id (logs are ordered oldest→newest via id ASC)
    const groups = new Map<
      string,
      { primary: Log; setMap: Map<number, RawSet>; isCompleted: boolean }
    >();
    for (const log of existingLogs) {
      const group = groups.get(log.exercise.id);
      if (!group) {
        const setMap = new Map<number, RawSet>();
        for (const s of log.sets) setMap.set(s.setNumber, s);
        groups.set(log.exercise.id, {
          primary: log,
          setMap,
          isCompleted: log.isCompleted ?? false,
        });
      } else {
        // Merge sets: newer log's set wins if it has more data; new set
        // numbers are appended. isCompleted ORs across duplicates so a
        // legacy dup group with one completed row stays completed in the UI.
        for (const s of log.sets) {
          const existing = group.setMap.get(s.setNumber);
          if (!existing || score(s) > score(existing)) {
            group.setMap.set(s.setNumber, s);
          }
        }
        if (log.isCompleted) group.isCompleted = true;
      }
    }

    const deduped = [...groups.values()]
      .sort((a, b) => a.primary.orderIndex - b.primary.orderIndex)
      .map(({ primary, setMap, isCompleted }) => ({
        ...primary,
        isCompleted,
        sets: [...setMap.values()].sort((a, b) => a.setNumber - b.setNumber),
      }));

    // Seed the per-set "saved" signatures from the server snapshot so already
    // logged sets render green on load and stay in sync as the peer edits / we
    // poll. Only complete sets get a signature — partial rows are never saved.
    // Computed from the server state regardless of the unsaved-local guard
    // below: these signatures describe what's persisted, not the local draft.
    const serverSig = new Set<string>();
    for (const log of deduped) {
      for (const s of log.sets) {
        const set: SetData = {
          setNumber: s.setNumber,
          reps: s.reps ?? undefined,
          weightKg: s.weightKg ?? undefined,
          durationSec: s.durationSec ?? undefined,
          rpe: s.rpe ?? undefined,
          restSec: s.restSec ?? undefined,
          stepsCount: s.stepsCount ?? undefined,
          notes: s.notes ?? '',
        };
        if (isSetComplete(set, log.exercise.exerciseType)) {
          serverSig.add(setSignature(log.exercise.id, normalizeSet(set)));
        }
      }
    }
    setSavedSignatures(serverSig);

    setExercises((prev) => {
      // Two preservation rules across server re-hydration (this effect fires
      // every time `existingLogs` changes — e.g. on each 10s/30s poll):
      //
      //   1. If the local copy has unsaved changes — a payload diff OR a
      //      draft row the payload can't carry (half-typed set, fresh blank
      //      "Add Set" row; see hasDraftRows) — drop the server payload on
      //      the floor. Saveable changes reach the server via auto-save and
      //      the next poll reflects them; draft rows simply survive locally
      //      until they're complete. Without this the poll's stale snapshot
      //      stomps the user's mid-type values.
      //   2. Otherwise preserve `collapsed` per exerciseId — the server
      //      doesn't track UI state, so the freshly-built `initial` array
      //      would re-collapse everything except the last exercise on every
      //      tick. The reported bug: expanding one card auto-collapses it on
      //      the next poll and expands the bottom one.
      const currentHash = JSON.stringify(buildSavePayload(prev));
      const hasUnsavedLocal =
        prev.length > 0 &&
        (currentHash !== lastSavedHashRef.current ||
          hasDraftRows(prev, lastSavedPayloadRef.current));
      if (hasUnsavedLocal) return prev;

      const prevCollapsedById = new Map(prev.map((e) => [e.exerciseId, e.collapsed]));
      const isFirstHydration = prev.length === 0;

      const initial = deduped.map<ExerciseEntry>((log, idx) => {
        const isCompleted = log.isCompleted;
        return {
          tempId: log.id,
          exerciseId: log.exercise.id,
          exerciseName: log.exercise.name,
          targetMuscle: log.exercise.targetMuscleGroup,
          category: log.exercise.category,
          exerciseType: log.exercise.exerciseType,
          secondaryMetric: log.exercise.secondaryMetric ?? 'KM',
          // A zero-set log is an exercise that was added but not yet logged.
          // Give it one blank placeholder row so the card shows an editable
          // set, matching a freshly-added exercise.
          sets:
            log.sets.length > 0
              ? log.sets.map((s) => ({
                  setNumber: s.setNumber,
                  reps: s.reps ?? undefined,
                  weightKg: s.weightKg ?? undefined,
                  durationSec: s.durationSec ?? undefined,
                  rpe: s.rpe ?? undefined,
                  restSec: s.restSec ?? undefined,
                  stepsCount: s.stepsCount ?? undefined,
                  notes: s.notes ?? '',
                }))
              : [emptySet(1)],
          // Collapse rules:
          //   - Re-hydration: preserve the user's last choice for this exerciseId.
          //   - First hydration of a completed log: collapsed.
          //   - First hydration of the last incomplete log: expanded.
          //   - Anything else first-time: collapsed.
          //   - Brand-new server-pushed exercise mid-session: expanded (so peer
          //     additions from the trainer aren't invisible to the client).
          collapsed: prevCollapsedById.has(log.exercise.id)
            ? (prevCollapsedById.get(log.exercise.id) ?? false)
            : isFirstHydration
              ? isCompleted || idx !== deduped.length - 1
              : false,
          isCompleted,
        };
      });

      // Seed the last-saved snapshot (hash + structured payload) so auto-save
      // doesn't re-POST the data we just hydrated, and so the next diff is
      // measured against the freshly-synced server state. Shape must match the
      // payload built in `currentPayload`.
      const hydratedPayload = buildSavePayload(initial);
      lastSavedHashRef.current = JSON.stringify(hydratedPayload);
      lastSavedPayloadRef.current = hydratedPayload;
      return initial;
    });

    // Bootstrap today's focus from whatever exercises were already logged
    // before this mount (session resumed or page refreshed). Each exercise's
    // catalog muscle maps to one curated bucket. Re-runs on every poll are
    // a no-op because `setFocusGroupIds` does referential-equality dedup.
    const seeded = new Set<CuratedMuscleGroupId>();
    for (const log of deduped) {
      const id = curatedGroupOf(log.exercise.targetMuscleGroup);
      if (id) seeded.add(id);
    }
    if (seeded.size > 0) setFocusGroupIds(seeded);
  }, [existingLogs]);

  const searchExercises = useCallback(
    async (
      query: string,
      groupIds: CuratedMuscleGroupId[],
      type: ExerciseType | null,
      signal?: AbortSignal,
    ) => {
      // Empty modal — show the prompt state, not a 500-row dump of the catalog.
      if (!query.trim() && groupIds.length === 0 && !type) {
        setSearchResults([]);
        setSearchRelaxed(false);
        setSearchLoading(false);
        return;
      }
      const params = new URLSearchParams();
      if (query.trim()) params.set('search', query.trim());
      if (groupIds.length > 0) params.set('muscleGroups', groupIds.join(','));
      if (type) params.set('exerciseType', type);
      params.set('pageSize', '20');
      setSearchLoading(true);
      try {
        const res = await fetch(`/api/exercises?${params.toString()}`, { signal });
        if (res.ok) {
          const r = await res.json();
          setSearchResults(r.data);
          setSearchRelaxed(Boolean(r.relaxed));
        }
      } catch {
        /* silent — abort or network */
      } finally {
        setSearchLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    const groupIds = [...searchMuscleGroups];
    const t = setTimeout(
      () => searchExercises(searchQuery, groupIds, searchExerciseType, ctrl.signal),
      300,
    );
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [searchQuery, searchMuscleGroups, searchExerciseType, searchExercises]);

  // Fallback focus for any path that opens the search without a tap gesture to
  // ride (`openSearch` already focuses synchronously). Re-focusing an input
  // that already has focus is a no-op, so this never disturbs the keyboard.
  useEffect(() => {
    if (showSearch) setTimeout(() => searchRef.current?.focus(), 50);
  }, [showSearch]);

  // Lock the page behind the search overlay. Without this, touch-scrolling the
  // results list chains past its boundary into the body and scrolls the page
  // behind the modal (iOS Safari ignores overscroll-behavior in many cases).
  // Pinning the body with position:fixed stops it dead; we stash and restore
  // the exact scroll position so closing the modal lands the user where they
  // were instead of jumping to the top.
  useEffect(() => {
    if (!showSearch) return;
    const { body } = document;
    const scrollY = window.scrollY;
    const prev = {
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      overflow: body.style.overflow,
    };
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.width = '100%';
    body.style.overflow = 'hidden';
    return () => {
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.width = prev.width;
      body.style.overflow = prev.overflow;
      window.scrollTo(0, scrollY);
    };
  }, [showSearch]);

  // Fetch prior-session lastSet for any exercise we don't already have a
  // snapshot for (key absent from the map). The picker seeds known IDs at
  // pick-time, but exercises added via Search or hydrated from existingLogs
  // need this round-trip to populate placeholder hints. Keyed by a sorted
  // join of missing IDs so the effect only re-runs when that set actually
  // changes — keystrokes don't fire spurious aborts.
  const missingLastSetKey = useMemo(() => {
    const ids: string[] = [];
    const seen = new Set<string>();
    for (const e of exercises) {
      if (seen.has(e.exerciseId)) continue;
      seen.add(e.exerciseId);
      if (!lastSetsByExId.has(e.exerciseId)) ids.push(e.exerciseId);
    }
    return ids.sort().join(',');
  }, [exercises, lastSetsByExId]);

  useEffect(() => {
    if (!clientProfileId || !missingLastSetKey) return;
    const missing = missingLastSetKey.split(',');
    const ctrl = new AbortController();
    const url = `/api/trainer/clients/${clientProfileId}/last-sets?exerciseIds=${encodeURIComponent(
      missing.join(','),
    )}&excludeSessionId=${encodeURIComponent(sessionInstanceId)}`;
    fetch(url, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then(({ data }: { data: Array<{ exerciseId: string; sets: LastSetSnapshot[] }> }) => {
        setLastSetsByExId((prev) => {
          const next = new Map(prev);
          // Mark every requested ID as fetched (empty array = no prior data)
          // so we don't refetch on the next render.
          for (const id of missing) {
            if (!next.has(id)) next.set(id, []);
          }
          for (const item of data ?? []) {
            next.set(item.exerciseId, item.sets ?? []);
          }
          return next;
        });
      })
      .catch(() => {
        /* network/abort — leave keys unset so a future render can retry */
      });

    return () => ctrl.abort();
  }, [clientProfileId, sessionInstanceId, missingLastSetKey]);

  // Open the search modal with "All" muscle groups selected by default so the
  // trainer can search the whole catalog freely. Pre-seeding today's focus
  // (e.g. "Chest day") made people think they had to pick a group first — a
  // query like "squat" was silently scoped to the focus group and found
  // nothing. The "All" chip stays the default; focus is still used by the
  // separate Suggestions recall.
  function openSearch() {
    // Raise the soft keyboard immediately so the trainer can type without a
    // second tap. iOS only opens it for a focus() that happens inside the
    // originating tap gesture, so the whole sequence stays synchronous:
    //   1. prime — focus a throwaway input, which raises the keyboard now,
    //      before the real one exists;
    //   2. flushSync — mount the modal on the spot instead of on React's next
    //      render, so the real input is in the DOM while we still hold the
    //      gesture;
    //   3. focus it — a handoff between two inputs, which keeps the keyboard
    //      up rather than dismissing and re-raising it.
    primeMobileKeyboard();
    flushSync(() => {
      setSearchMuscleGroups(new Set());
      setShowSearch(true);
    });
    searchRef.current?.focus();
    // No scroll-to-top here: the body is pinned while the overlay is open
    // (see the scroll-lock effect), so the page stays put and the fixed modal
    // sits over the current view.
  }

  function addExercisesFromPicker(picked: PickedExercise[]) {
    // Structural change — flush the next save immediately so the peer sees
    // the new exercise in ~1s instead of after the 5s typing debounce.
    flushImmediatelyRef.current = true;
    // No picker-side seed — the on-demand fetch effect populates per-set
    // priors. The picker only carries one snapshot per exercise, which would
    // mask the richer per-row hints once the fetch returns.
    setExercises((prev) => {
      const existingIds = new Set(prev.map((e) => e.exerciseId));
      // Skip exercises the trainer already added this session — re-opening
      // the picker shouldn't quietly duplicate rows.
      const fresh = picked.filter((p) => !existingIds.has(p.exerciseId));
      if (fresh.length === 0) {
        toast('Already added — pick something else');
        return prev;
      }
      if (fresh.length < picked.length) {
        toast(`Added ${fresh.length} (skipped ${picked.length - fresh.length} already in workout)`);
      }
      const collapsed = prev.map((e) => ({ ...e, collapsed: true }));
      const additions = fresh.map<ExerciseEntry>((p, idx) => ({
        tempId: `temp-${Date.now()}-${idx}`,
        exerciseId: p.exerciseId,
        exerciseName: p.name,
        targetMuscle: p.targetMuscleGroup,
        category: p.category,
        exerciseType: p.exerciseType,
        secondaryMetric: p.secondaryMetric,
        sets: [emptySet(1)],
        // Expand only the last addition so the trainer lands on a fresh card
        collapsed: idx !== fresh.length - 1,
        isCompleted: false,
        lastSet: p.lastSet
          ? {
              reps: p.lastSet.reps,
              weightKg: p.lastSet.weightKg,
              durationSec: p.lastSet.durationSec,
              rpe: p.lastSet.rpe,
            }
          : null,
      }));
      // Keep completed exercises at the bottom even after a fresh addition
      // (incomplete first, then completed in their existing order).
      const sorted = [...collapsed].sort((a, b) => Number(a.isCompleted) - Number(b.isCompleted));
      const completedTail = sorted.filter((e) => e.isCompleted);
      const incompleteHead = sorted.filter((e) => !e.isCompleted);
      return [...incompleteHead, ...additions, ...completedTail];
    });
    setPickerOpen(false);
    setSuggestionsOpen(false);
  }

  function removeExercise(tempId: string) {
    flushImmediatelyRef.current = true;
    setExercises((prev) => prev.filter((e) => e.tempId !== tempId));
  }

  function toggleCollapse(tempId: string) {
    setExercises((prev) => {
      const target = prev.find((e) => e.tempId === tempId);
      const isCollapsed = target?.collapsed ?? false;
      return prev.map((e) =>
        e.tempId === tempId ? { ...e, collapsed: !isCollapsed } : { ...e, collapsed: true },
      );
    });
  }

  /**
   * Flip the mark-complete flag on a single exercise (ADR-037).
   * - Marking complete: collapse this card, sort completed exercises to the
   *   bottom (preserving relative order among incomplete + completed), and
   *   auto-expand the first remaining incomplete exercise so the user
   *   doesn't have to hunt for the next thing to log.
   * - Unmarking: flip the flag and expand the card (the user just brought
   *   it back into focus). Sort still moves it back up among the incompletes.
   * Auto-save (debounced ~800ms) picks up the new isCompleted on its next
   * pass and persists it to the server.
   */
  function setExerciseCompleted(tempId: string, completed: boolean) {
    flushImmediatelyRef.current = true;
    setExercises((prev) => {
      const flipped = prev.map((e) =>
        e.tempId === tempId ? { ...e, isCompleted: completed, collapsed: completed } : e,
      );
      // Stable sort: incomplete first, then completed. Items keep their
      // existing order within each group, so users see a predictable list.
      const incomplete = flipped.filter((e) => !e.isCompleted);
      const completedItems = flipped.filter((e) => e.isCompleted);
      const reordered = [...incomplete, ...completedItems];
      // Auto-advance: when the user marks something complete, expand the
      // next incomplete card so logging flows top-to-bottom without an
      // extra tap. No-op when nothing is left to log (everything is done).
      if (completed) {
        const nextIncomplete = reordered.findIndex((e) => !e.isCompleted);
        if (nextIncomplete !== -1) {
          return reordered.map((e, idx) =>
            idx === nextIncomplete ? { ...e, collapsed: false } : { ...e, collapsed: true },
          );
        }
      } else {
        // Unmark: expand the just-uncompleted card, collapse the rest.
        return reordered.map((e) =>
          e.tempId === tempId ? { ...e, collapsed: false } : { ...e, collapsed: true },
        );
      }
      return reordered;
    });
  }

  function addSet(exerciseIndex: number) {
    // Fallback prefill: if a rest just finished and no per-row Rest button
    // was used to bind it to a specific set, write that rest onto the
    // *previous* set (rest taken AFTER set N, BEFORE the new set). Skipped
    // when pendingRestTarget is set because the per-row write effect
    // already attributed it.
    const prefillRest =
      pendingRestTarget === null &&
      lastFinishedRestSec !== null &&
      lastFinishedRestSec !== undefined
        ? lastFinishedRestSec
        : undefined;
    setExercises((prev) => {
      const updated = [...prev];
      const entry = { ...updated[exerciseIndex]! };
      let sets = entry.sets;
      if (prefillRest !== undefined && sets.length > 0) {
        sets = sets.map((s, i) => (i === sets.length - 1 ? { ...s, restSec: prefillRest } : s));
      }
      entry.sets = [...sets, emptySet(sets.length + 1)];
      updated[exerciseIndex] = entry;
      return updated;
    });
    if (prefillRest !== undefined) onConsumeRest?.();
  }

  // ── Per-row rest binding ──────────────────────────────────────────────────
  // Trainer taps the Rest button next to a specific set → we mark that set as
  // the target AND open the rest-timer sheet. When the timer eventually ends
  // (naturally or via Stop), the parent surfaces `lastFinishedRestSec`, which
  // the effect below writes onto the targeted set.
  function requestRestForSet(tempId: string, setNumber: number) {
    setPendingRestTarget({ tempId, setNumber });
    onRequestRest?.();
  }

  useEffect(() => {
    if (lastFinishedRestSec === null || lastFinishedRestSec === undefined) return;
    if (!pendingRestTarget) return;
    const target = pendingRestTarget;
    setExercises((prev) =>
      prev.map((entry) =>
        entry.tempId === target.tempId
          ? {
              ...entry,
              sets: entry.sets.map((s) =>
                s.setNumber === target.setNumber ? { ...s, restSec: lastFinishedRestSec } : s,
              ),
            }
          : entry,
      ),
    );
    setPendingRestTarget(null);
    onConsumeRest?.();
  }, [lastFinishedRestSec, pendingRestTarget, onConsumeRest]);

  function removeSet(exerciseIndex: number, setIndex: number) {
    setExercises((prev) => {
      const updated = [...prev];
      const entry = { ...updated[exerciseIndex]! };
      entry.sets = entry.sets
        .filter((_, i) => i !== setIndex)
        .map((s, i) => ({ ...s, setNumber: i + 1 }));
      updated[exerciseIndex] = entry;
      return updated;
    });
  }

  function updateSet(exerciseIndex: number, setIndex: number, field: keyof SetData, value: string) {
    setExercises((prev) => {
      const updated = [...prev];
      const entry = { ...updated[exerciseIndex]! };
      const set = { ...entry.sets[setIndex]! };
      if (field === 'notes') {
        set.notes = value;
      } else if (field === 'setNumber') {
        set.setNumber = parseInt(value) || 1;
      } else {
        const num = parseFloat(value);
        (set as Record<string, unknown>)[field] = isNaN(num) ? undefined : num;
      }
      entry.sets = entry.sets.map((s, i) => (i === setIndex ? set : s));
      updated[exerciseIndex] = entry;
      return updated;
    });
  }

  // Snapshot of the current state in the exact shape we POST. Memoized so
  // its identity is stable across renders that don't actually change the
  // logged workout, which keeps the auto-save effect from churning.
  const currentPayload = useMemo(() => buildSavePayload(exercises), [exercises]);
  const currentHash = useMemo(() => JSON.stringify(currentPayload), [currentPayload]);
  // Two tiers of "unsaved":
  //   • hasUnsavedPayload — the saveable snapshot differs from the last save;
  //     drives the auto-save debounce (no point POSTing an unchanged payload).
  //   • hasUnsaved — adds draft rows the payload can't carry (half-typed set,
  //     fresh blank "Add Set" row). Reported to the parent so it pauses the
  //     10s poll / Pusher refetch, and mirrored by the rehydration guard —
  //     otherwise a refetch wipes the row mid-type even though nothing is
  //     POSTable yet (the bug trainers hit after "only persist complete sets").
  const hasUnsavedPayload = currentHash !== lastSavedHashRef.current;
  const hasUnsaved = hasUnsavedPayload || hasDraftRows(exercises, lastSavedPayloadRef.current);

  // Durable backup of the unsaved payload (see workout-outbox). Mirrored to
  // localStorage *synchronously* on every change so a freeze/kill of a
  // backgrounded PWA — or a keepalive POST that's dropped or hits an expired
  // session — can't lose the sets the user just typed. The next mount / online
  // event replays whatever is still here (attemptRecovery). Cleared the moment
  // everything the device holds is confirmed on the server.
  useEffect(() => {
    if (hasUnsavedPayload) {
      writeOutbox(sessionInstanceId, currentPayload);
    } else {
      clearOutbox(sessionInstanceId);
    }
  }, [hasUnsavedPayload, currentHash, currentPayload, sessionInstanceId]);

  // Persist to the server. The write is scoped to what this device changed
  // since its last sync (see `diffExercises`) so a debounced save from a stale
  // peer can't clobber the other side's concurrent edits. Serialized via
  // inFlight/pending refs so a mid-save edit doesn't race the in-flight request.
  const saveWorkout = useCallback(async () => {
    if (currentPayload.length === 0) return; // schema requires ≥1 exercise
    if (inFlightRef.current) {
      pendingRef.current = true;
      return;
    }
    inFlightRef.current = true;
    setAutoSaveStatus('saving');
    const sentPayload = currentPayload;
    const sentHash = JSON.stringify(sentPayload);
    const { dirtyExerciseIds, removedExerciseIds, removedSetsByExerciseId } = diffExercises(
      lastSavedPayloadRef.current,
      sentPayload,
    );
    try {
      // Shared trainer/client write path (ADR-036). The route uses
      // assertSessionAccess so either the session's trainer or its client
      // can save; sessionInstanceId moves from the body to the URL.
      const res = await fetch(`/api/sessions/${sessionInstanceId}/workouts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exercises: sentPayload,
          dirtyExerciseIds,
          removedExerciseIds,
          removedSetsByExerciseId,
        }),
      });
      if (res.ok) {
        lastSavedHashRef.current = sentHash;
        lastSavedPayloadRef.current = sentPayload;
        // Flip every set we just persisted to its saved (green) state. The
        // writer doesn't get its own Pusher echo, so we can't wait for a
        // refetch — record signatures straight from the payload we sent.
        setSavedSignatures(signaturesOf(sentPayload));
        const body = await res.json();
        const newBadges: { name: string; icon: string; description?: string }[] =
          body?.newBadges ?? [];
        if (newBadges.length > 0) setCelebrationBadges(newBadges);
        const postIds: string[] = body?.autoGeneratedPostIds ?? [];
        if (postIds.length > 0) setAutoPostIds((prev) => [...prev, ...postIds]);
        setAutoSaveStatus('saved');
        if (statusFadeRef.current) clearTimeout(statusFadeRef.current);
        statusFadeRef.current = setTimeout(() => {
          setAutoSaveStatus((prev) => (prev === 'saved' ? 'idle' : prev));
        }, 1500);
      } else {
        const err = await res.json().catch(() => ({}));
        setAutoSaveStatus('error');
        // Backstop — client-side validation should keep rejected values out of
        // the payload, but if a 422 still happens, name the field instead of
        // surfacing the opaque "Invalid payload".
        const issue = err?.issues?.[0];
        toast.error(
          issue?.path?.length
            ? `Couldn't save — invalid ${issue.path[issue.path.length - 1]}: ${issue.message}`
            : err.error || 'Auto-save failed',
        );
      }
    } catch {
      setAutoSaveStatus('error');
    } finally {
      inFlightRef.current = false;
      // If a change came in while the request was in flight, fire another
      // pass so the latest state lands on the server.
      if (pendingRef.current) {
        pendingRef.current = false;
        setTimeout(() => void saveWorkout(), 50);
      }
    }
  }, [currentPayload, sessionInstanceId]);

  // Force an immediate save, bypassing the 5s debounce. Wired to the per-set
  // save tick so the user can persist a row the instant they finish it instead
  // of waiting on (or trusting) the auto-save. Cancels the pending debounce so
  // the same payload doesn't get POSTed twice.
  const saveNow = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    void saveWorkout();
  }, [saveWorkout]);

  // Debounce: wait 5s for typing / corrections to settle, then auto-save.
  // Cancels and resets on every change so a flurry of keystrokes results
  // in one POST. The window is deliberately wide — typos (e.g. "4515" for
  // "45") have time to be corrected before the PR/badge eval fires
  // server-side; the trade-off is up to 5s of data risk if the user
  // navigates away mid-debounce, mitigated by the unmount flush below.
  //
  // Exception: structural changes (add/remove/mark-complete) set
  // `flushImmediatelyRef`, dropping the delay to 0 so the peer sees the new
  // shape in ~1s via Pusher rather than waiting on the debounce.
  useEffect(() => {
    if (!hasUnsavedPayload) return;
    if (currentPayload.length === 0) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    const delay = flushImmediatelyRef.current ? 0 : 5000;
    flushImmediatelyRef.current = false;
    saveTimerRef.current = setTimeout(() => {
      void saveWorkout();
    }, delay);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [hasUnsavedPayload, currentHash, currentPayload.length, saveWorkout]);

  // Keep refs aligned with latest values so the flush/visibility effects
  // (which bind once) can read the most recent payload + hash + callbacks
  // without re-binding their listeners on every keystroke.
  const currentPayloadRef = useRef(currentPayload);
  const currentHashRef = useRef(currentHash);
  useEffect(() => {
    currentPayloadRef.current = currentPayload;
    currentHashRef.current = currentHash;
  }, [currentPayload, currentHash]);

  // `saveWorkout` and `onForeground` change identity as state/props change, so
  // the stable visibility listener reaches them through refs.
  const saveWorkoutRef = useRef(saveWorkout);
  const onForegroundRef = useRef(onForeground);
  useEffect(() => {
    saveWorkoutRef.current = saveWorkout;
    onForegroundRef.current = onForeground;
  }, [saveWorkout, onForeground]);

  // Best-effort flush of any pending edit via a keepalive request, so the
  // latest values survive teardown — a hard navigation AND, crucially, the
  // app being backgrounded. `keepalive` lets the POST outlive the page going
  // away; clearing the debounce timer stops a duplicate fire on resume.
  const flushPendingSave = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const payload = currentPayloadRef.current;
    const hashAtFlush = currentHashRef.current;
    if (payload.length === 0 || hashAtFlush === lastSavedHashRef.current) return;
    // Synchronously persist the freshest payload before the OS can freeze or
    // kill us. The keepalive POST below is best-effort and can be dropped
    // (frozen process, dead socket, expired cookie); the outbox is the durable
    // record that attemptRecovery replays on the next mount / reconnect.
    writeOutbox(sessionInstanceId, payload);
    // Scope the teardown flush the same way as a normal save so it can't
    // full-replace over a peer's edits on the way out.
    const { dirtyExerciseIds, removedExerciseIds, removedSetsByExerciseId } = diffExercises(
      lastSavedPayloadRef.current,
      payload,
    );
    void fetch(`/api/sessions/${sessionInstanceId}/workouts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        exercises: payload,
        dirtyExerciseIds,
        removedExerciseIds,
        removedSetsByExerciseId,
      }),
      keepalive: true,
    });
  }, [sessionInstanceId]);

  useEffect(() => {
    return () => {
      if (statusFadeRef.current) clearTimeout(statusFadeRef.current);
      // Unmount flush — best-effort save before teardown (e.g. switching
      // session tabs or navigating back).
      flushPendingSave();
    };
  }, [flushPendingSave]);

  // Survive the phone being locked / app backgrounded. The reported case was
  // Android, where Chrome freezes a backgrounded PWA and can discard its
  // process under memory pressure (iOS behaves the same); either way the app
  // cold-starts on return and the last few keystrokes typed inside the 5s
  // auto-save debounce were lost. We flush the moment the page is hidden — and
  // again on `freeze`/`pagehide`, the last callbacks before a discard — with a
  // keepalive POST. On the way back we (a) re-save anything a dropped keepalive
  // missed, then (b) let the parent refetch so the screen shows fresh server
  // state. The hydration guard keeps unsaved local edits from being clobbered
  // by (b).
  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === 'hidden') {
        flushPendingSave();
        return;
      }
      if (
        currentPayloadRef.current.length > 0 &&
        currentHashRef.current !== lastSavedHashRef.current
      ) {
        void saveWorkoutRef.current();
      }
      onForegroundRef.current?.();
    }
    document.addEventListener('visibilitychange', onVisibility);
    // freeze: Android Chrome's Page Lifecycle hook, fired right before a
    // backgrounded tab is frozen/discarded. pagehide: tab teardown without a
    // final visibilitychange. Both are last-chance flush points.
    document.addEventListener('freeze', flushPendingSave);
    window.addEventListener('pagehide', flushPendingSave);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('freeze', flushPendingSave);
      window.removeEventListener('pagehide', flushPendingSave);
    };
  }, [flushPendingSave]);

  // Replay any outbox left behind by a previous run that died before its save
  // landed (frozen/killed PWA, dropped keepalive, expired session). This is the
  // recovery half of the durability fix: the mirror effect / teardown flush
  // wrote the unsaved payload to localStorage synchronously; here we push it to
  // the server on the next mount and on every reconnect.
  //
  // The replay is strictly *additive*: dirtyExerciseIds = every recovered
  // exercise, removedExerciseIds = []. The lost data is data that never reached
  // the DB, so we only ever ADD it back — a recovery can't clobber a peer's
  // concurrent edits with a stale delete. We also skip the replay entirely when
  // the server already holds everything in the outbox (stale leftover), so a
  // clean resume doesn't fire a redundant POST.
  const attemptRecovery = useCallback(async () => {
    const record = readOutbox<SavePayloadEntry>(sessionInstanceId);
    if (!record || record.exercises.length === 0) return;

    // Strip sets the server would 422 (outboxes written before the client
    // validated against workoutSetSchema can hold 0-reps / decimal-reps rows) —
    // otherwise one bad value blocks the replay of everything else in it.
    const exercises = sanitizeRecoveredExercises(record.exercises);

    // lastSavedPayloadRef holds the freshly-hydrated server snapshot. If every
    // exercise and complete set in the outbox is already persisted, this is
    // stale leftover — just drop it.
    const serverSigs = signaturesOf(lastSavedPayloadRef.current);
    const serverExIds = new Set(lastSavedPayloadRef.current.map((e) => e.exerciseId));
    const outboxSigs = signaturesOf(exercises);
    const hasUnsynced =
      exercises.some((e) => !serverExIds.has(e.exerciseId)) ||
      [...outboxSigs].some((sig) => !serverSigs.has(sig));
    if (!hasUnsynced) {
      clearOutbox(sessionInstanceId);
      return;
    }

    try {
      const res = await fetch(`/api/sessions/${sessionInstanceId}/workouts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exercises,
          dirtyExerciseIds: exercises.map((e) => e.exerciseId),
          removedExerciseIds: [],
          removedSetsByExerciseId: {},
        }),
      });
      if (res.ok) {
        clearOutbox(sessionInstanceId);
        // Pull the now-persisted data back so the UI shows it with full
        // metadata (the outbox only carries ids, not exercise names/types).
        onForegroundRef.current?.();
      } else if (res.status === 422) {
        // A validation reject is deterministic — the same payload would fail
        // on every future mount/reconnect too. Drop it instead of retrying.
        clearOutbox(sessionInstanceId);
      }
      // On any other non-ok response (e.g. still-expired session) leave the
      // outbox in place — the next mount or `online` event retries.
    } catch {
      /* offline — keep the outbox and retry on reconnect */
    }
  }, [sessionInstanceId]);

  // Run recovery once, after the parent's first session fetch has hydrated the
  // server snapshot (so we can tell genuinely-lost data from stale leftover).
  // `existingLogs === undefined` means the fetch hasn't resolved yet; an empty
  // array is a valid "server has nothing" — which, with an outbox present, is
  // exactly the total-loss case we must replay.
  const recoveryDoneRef = useRef(false);
  useEffect(() => {
    if (recoveryDoneRef.current || existingLogs === undefined) return;
    recoveryDoneRef.current = true;
    void attemptRecovery();
  }, [existingLogs, attemptRecovery]);

  // Reconnect handling. When the network returns, push the latest state: prefer
  // the live in-memory payload if the component is still alive and dirty;
  // otherwise replay the outbox (covers a prior run whose save never landed).
  useEffect(() => {
    function onOnline() {
      const hasLiveUnsaved =
        currentPayloadRef.current.length > 0 && currentHashRef.current !== lastSavedHashRef.current;
      if (hasLiveUnsaved) {
        void saveWorkoutRef.current();
      } else {
        void attemptRecovery();
      }
    }
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [attemptRecovery]);

  useEffect(() => {
    onUnsavedChange?.(hasUnsaved);
  }, [hasUnsaved, onUnsavedChange]);

  return (
    <div className="space-y-3">
      {/* ── Badge celebration overlay ── */}
      {celebrationBadges.length > 0 && (
        <BadgeCelebration badges={celebrationBadges} onDone={() => setCelebrationBadges([])} />
      )}

      {/* ── Auto-post PR banner ── */}
      {autoPostIds.length > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-sm">
          <span className="text-orange-300 font-medium">🏆 New PR posted to Community feed</span>
          <button
            className="text-xs text-orange-400/70 hover:text-orange-300 underline underline-offset-2"
            onClick={async () => {
              await Promise.all(
                autoPostIds.map((id) => fetch(`/api/community/posts/${id}`, { method: 'DELETE' })),
              );
              setAutoPostIds([]);
              toast.success('Post removed from community');
            }}
          >
            Remove
          </button>
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 pt-2.5 items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Workout Log
          </span>
          {/* {clientName && (
            <>
              <span className="text-xs text-muted-foreground/50">·</span>
              <span className="truncate text-xs font-semibold text-foreground">{clientName}</span>
            </>
          )} */}
          {view === 'log' && exercises.length > 0 && (
            <>
              <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                {exercises.length}
              </span>
              {/* ADR-037: surface completion progress alongside the total
              count so the user can see "4 (2 done)" at a glance without
              scanning every card. */}
              {(() => {
                const doneCount = exercises.filter((e) => e.isCompleted).length;
                if (doneCount === 0) return null;
                return (
                  <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-500">
                    {doneCount} done
                  </span>
                );
              })()}
            </>
          )}
          {view === 'log' && (
            <AutoSaveIndicator status={autoSaveStatus} onRetry={() => void saveWorkout()} />
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {/* Log/History tab strip — flips the body between the live logger
              and the read-only history list. Both tabs sit to the left of the
              "+" so the trainer reaches History without losing the add-
              exercise affordance for the active session. */}
          <div className="flex items-center rounded-xl bg-muted/40 p-0.5 mt-2.5 ring-1 ring-border/50">
            <button
              type="button"
              onClick={() => setView('log')}
              aria-pressed={view === 'log'}
              className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold transition-colors ${
                view === 'log'
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Dumbbell className="h-3 w-3" />
              Log
            </button>
            <button
              type="button"
              onClick={() => {
                setView('history');
                setShowSearch(false);
              }}
              aria-pressed={view === 'history'}
              className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold transition-colors ${
                view === 'history'
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <HistoryIcon className="h-3 w-3" />
              History
            </button>
          </div>
          {/* "+" only on the Log tab and only when there's already at least
              one exercise (or search is open) — the empty-state Add First
              button owns the cold start. */}
          {view === 'log' && (exercises.length > 0 || showSearch) && (
            <button
              onClick={() => (showSearch ? setShowSearch(false) : openSearch())}
              className={`flex h-8 w-8 shrink-0 items-center justify-center mt-2.5 rounded-xl transition-colors ${
                showSearch
                  ? 'bg-muted text-muted-foreground'
                  : 'bg-primary/10 text-primary hover:bg-primary/15'
              }`}
            >
              {showSearch ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
      </div>

      {/* ── History view ── */}
      {view === 'history' && clientProfileId && (
        <WorkoutHistoryList
          historyEndpoint={`/api/trainer/clients/${clientProfileId}/workout-history`}
          activeSessionId={sessionInstanceId}
        />
      )}
      {view === 'history' && !clientProfileId && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border/40 bg-muted/20 px-6 py-12 text-center">
          <HistoryIcon className="h-7 w-7 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            History is unavailable — client profile is missing.
          </p>
        </div>
      )}

      {/* ── Log view body — every block below is gated so the History tab
          renders nothing but the read-only history list. Wrapped in a single
          guarded fragment to keep the diff small and the indentation flat. */}
      {view === 'log' && (
        <>
          {/* ── Today's focus — colored pill row showing the muscle groups the
          trainer committed to via the picker(s). Drives the "Suggestions"
          filter and gives the trainer a quick visual reminder of the day's
          plan when juggling multiple sessions. ── */}
          {focusGroupIds.size > 0 && (
            <div className="-mt-1 flex items-center gap-1.5 overflow-x-auto pb-0.5">
              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Today
              </span>
              <span className="shrink-0 text-[10px] text-muted-foreground/40">·</span>
              {[...focusGroupIds].map((id) => {
                const group = CURATED_MUSCLE_GROUPS.find((g) => g.id === id);
                if (!group) return null;
                const theme = GROUP_THEME[id];
                return (
                  <span
                    key={id}
                    className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${theme.bg} ${theme.text}`}
                  >
                    {group.label}
                  </span>
                );
              })}
            </div>
          )}

          {/* ── Exercise search modal ──
              Two-zone layout: sticky header with input + filter chips,
              scrollable result body. Filters fire independently of the query
              so trainers can browse "all chest" without typing — important
              for new clients with no history. */}
          {showSearch &&
            (() => {
              const closeSearch = () => {
                setShowSearch(false);
                setSearchQuery('');
                setSearchResults([]);
                setSearchRelaxed(false);
                setSearchMuscleGroups(new Set());
                setSearchExerciseType(null);
                setSearchSelectedIds(new Set());
              };
              const hasFilter =
                searchMuscleGroups.size > 0 || searchExerciseType !== null || !!searchQuery.trim();
              const clearFilters = () => {
                setSearchMuscleGroups(new Set());
                setSearchExerciseType(null);
              };
              const toggleGroupChip = (id: CuratedMuscleGroupId) => {
                setSearchMuscleGroups((prev) => {
                  const next = new Set(prev);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return next;
                });
              };
              const toggleResult = (id: string) => {
                setSearchSelectedIds((prev) => {
                  const next = new Set(prev);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return next;
                });
              };
              const commitSelection = () => {
                const picked = searchResults
                  .filter((ex) => searchSelectedIds.has(ex.id))
                  .map<PickedExercise>((ex) => ({
                    exerciseId: ex.id,
                    name: ex.name,
                    targetMuscleGroup: ex.targetMuscleGroup,
                    category: ex.category,
                    exerciseType: ex.exerciseType,
                    secondaryMetric: ex.secondaryMetric,
                    lastSet: null,
                  }));
                if (picked.length === 0) return;
                addExercisesFromPicker(picked);
                closeSearch();
              };
              // Hide rows that are already in the current workout — the
              // trainer can't usefully re-add them (the dedupe in
              // `addExercisesFromPicker` would silently drop them anyway) and
              // showing them clutters the catalog. Filter client-side so a
              // single result page is the source of truth.
              const loggedExerciseIds = new Set(exercises.map((e) => e.exerciseId));
              const visibleResults = searchResults.filter((ex) => !loggedExerciseIds.has(ex.id));
              const allHiddenByLog = searchResults.length > 0 && visibleResults.length === 0;
              return (
                <>
                  <div
                    className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
                    onClick={closeSearch}
                  />
                  <div className="fixed left-4 right-4 top-20 z-50 flex max-h-[80vh] flex-col rounded-2xl border bg-card shadow-2xl overflow-hidden">
                    {/* ── Header: input + close ── */}
                    <div className="flex items-center gap-2 border-b border-border/50 px-3 py-2.5">
                      <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <input
                        ref={searchRef}
                        className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                        placeholder="Search exercises…"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') closeSearch();
                        }}
                      />
                      {searchQuery && (
                        <button
                          onClick={() => setSearchQuery('')}
                          aria-label="Clear search"
                          className="rounded-md p-1 text-muted-foreground hover:text-foreground"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button
                        onClick={closeSearch}
                        aria-label="Close search"
                        className="rounded-md bg-muted px-2 py-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                      >
                        Done
                      </button>
                    </div>

                    {/* ── Filter strip ──
                        Each filter (label + chips) is its own block with tight
                        internal spacing; the two blocks sit farther apart so
                        the eye groups them correctly. */}
                    <div className="border-b border-border/50 px-3 pt-3 pb-3.5 space-y-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Muscle group
                          </p>
                          {(searchMuscleGroups.size > 0 || searchExerciseType) && (
                            <button
                              onClick={clearFilters}
                              className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
                            >
                              Clear
                            </button>
                          )}
                        </div>
                        <div className="-mx-3 flex items-center gap-1.5 overflow-x-auto px-3 pb-1">
                          {/* "All" = no muscle-group filter. Active (and the
                              default) whenever nothing is selected so the
                              trainer can browse/search the whole catalog. */}
                          <button
                            onClick={() => setSearchMuscleGroups(new Set())}
                            aria-pressed={searchMuscleGroups.size === 0}
                            className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                              searchMuscleGroups.size === 0
                                ? 'bg-foreground text-background'
                                : 'bg-muted/40 text-muted-foreground hover:bg-muted/60'
                            }`}
                          >
                            All
                          </button>
                          {CURATED_MUSCLE_GROUPS.map((g) => {
                            const isOn = searchMuscleGroups.has(g.id);
                            const theme = GROUP_THEME[g.id];
                            return (
                              <button
                                key={g.id}
                                onClick={() => toggleGroupChip(g.id)}
                                aria-pressed={isOn}
                                className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                                  isOn
                                    ? `${theme.bg} ${theme.text} ring-1 ${theme.ring.split(' ')[0]}`
                                    : 'bg-muted/40 text-muted-foreground hover:bg-muted/60'
                                }`}
                              >
                                {g.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Type
                        </p>
                        <div className="-mx-3 flex items-center gap-1.5 overflow-x-auto px-3 pb-1">
                          <button
                            onClick={() => setSearchExerciseType(null)}
                            aria-pressed={searchExerciseType === null}
                            className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                              searchExerciseType === null
                                ? 'bg-foreground text-background'
                                : 'bg-muted/40 text-muted-foreground hover:bg-muted/60'
                            }`}
                          >
                            All
                          </button>
                          {(['WEIGHTED', 'BODYWEIGHT', 'DURATION', 'CARDIO'] as ExerciseType[]).map(
                            (t) => {
                              const cfg = TYPE_CONFIG[t];
                              const isOn = searchExerciseType === t;
                              return (
                                <button
                                  key={t}
                                  onClick={() => setSearchExerciseType(isOn ? null : t)}
                                  aria-pressed={isOn}
                                  className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                                    isOn
                                      ? `${cfg.bg} ${cfg.text} ring-1 ring-current/40`
                                      : 'bg-muted/40 text-muted-foreground hover:bg-muted/60'
                                  }`}
                                >
                                  {cfg.label}
                                </button>
                              );
                            },
                          )}
                        </div>
                      </div>
                    </div>

                    {/* ── Results body ── */}
                    <div className="flex-1 overflow-y-auto overscroll-contain">
                      {searchLoading ? (
                        <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Searching…
                        </div>
                      ) : visibleResults.length > 0 ? (
                        <>
                          {searchRelaxed && (
                            <div className="flex items-start gap-2 border-b border-border/50 bg-amber-500/10 px-4 py-2.5">
                              <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                              <p className="text-[11px] leading-snug text-muted-foreground">
                                No exact match for{' '}
                                <span className="font-semibold text-foreground">
                                  “{searchQuery.trim()}”
                                </span>{' '}
                                — showing the closest exercises.
                              </p>
                            </div>
                          )}
                          <div className="divide-y divide-border/50">
                            {visibleResults.map((ex) => {
                              const cfg = TYPE_CONFIG[ex.exerciseType];
                              const Icon = cfg.icon;
                              const isSelected = searchSelectedIds.has(ex.id);
                              return (
                                <button
                                  key={ex.id}
                                  onClick={() => toggleResult(ex.id)}
                                  aria-pressed={isSelected}
                                  className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
                                    isSelected ? 'bg-primary/5' : 'active:bg-muted/60'
                                  }`}
                                >
                                  <div
                                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${cfg.bg}`}
                                  >
                                    <Icon className={`h-4 w-4 ${cfg.text}`} />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium">{ex.name}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {ex.targetMuscleGroup}
                                      {ex.equipmentRequired ? ` · ${ex.equipmentRequired}` : ''}
                                      {` · ${cfg.label}`}
                                    </p>
                                  </div>
                                  <div
                                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors ${
                                      isSelected
                                        ? 'bg-primary text-primary-foreground'
                                        : 'bg-muted text-muted-foreground'
                                    }`}
                                  >
                                    <Check className="h-3.5 w-3.5" />
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </>
                      ) : allHiddenByLog ? (
                        <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
                          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/15">
                            <Check className="h-4 w-4 text-emerald-400" />
                          </div>
                          <p className="text-sm font-medium">Already in this workout</p>
                          <p className="text-xs text-muted-foreground">
                            Every match is already logged — try a different filter.
                          </p>
                        </div>
                      ) : hasFilter ? (
                        (() => {
                          // Two failure modes: (a) chip filters narrowed the
                          // catalog so a real query found nothing → offer a
                          // one-tap "search globally for this query" escape;
                          // (b) only the query is set → nothing we can clear
                          // for them, fall back to the generic message.
                          const chipsActive =
                            searchMuscleGroups.size > 0 || searchExerciseType !== null;
                          const q = searchQuery.trim();
                          const canEscape = chipsActive && q.length > 0;
                          return (
                            <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
                              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-muted">
                                <Search className="h-4 w-4 text-muted-foreground" />
                              </div>
                              <p className="text-sm font-medium">No exercises match</p>
                              <p className="text-xs text-muted-foreground">
                                {canEscape
                                  ? 'Your filters may be hiding it.'
                                  : 'Try a different filter or clear them all.'}
                              </p>
                              {canEscape && (
                                <button
                                  onClick={clearFilters}
                                  className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground transition-opacity active:opacity-80"
                                >
                                  <Search className="h-3.5 w-3.5 shrink-0" />
                                  <span className="truncate">Search all exercises for “{q}”</span>
                                </button>
                              )}
                            </div>
                          );
                        })()
                      ) : (
                        <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
                          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-muted">
                            <Sparkles className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <p className="text-sm font-medium">Filter or search the catalog</p>
                          <p className="text-xs text-muted-foreground">
                            Pick a muscle group above to browse, or start typing.
                          </p>
                        </div>
                      )}
                    </div>

                    {/* ── Sticky footer: commit the current multi-select. Only
                        renders when something is checked so the result list
                        keeps its full height in the common "still browsing"
                        state. */}
                    {searchSelectedIds.size > 0 && (
                      <div className="border-t border-border/50 bg-card px-3 py-2.5">
                        <button
                          onClick={commitSelection}
                          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground transition-opacity active:opacity-80"
                        >
                          Add {searchSelectedIds.size} to workout
                          <span className="rounded-full bg-primary-foreground/20 px-2 py-0.5 text-[10px] font-bold">
                            {searchSelectedIds.size}
                          </span>
                        </button>
                      </div>
                    )}
                  </div>
                </>
              );
            })()}

          {/* ── Empty state — show muscle-group picker so the trainer can plan
          the session by tapping focus cards. `groupsOnly`: Continue commits
          the focus (which unmounts the picker via the size check below) and
          lands on the empty log — exercises are added from scratch via
          Search, never from the suggested-exercise list. Falls back to the
          dashed "no exercises" card if we don't know who the client is
          (clientProfileId is required for the recency hints). */}
          {exercises.length === 0 && !showSearch && clientProfileId && focusGroupIds.size === 0 && (
            <MuscleGroupPicker
              clientProfileId={clientProfileId}
              sessionInstanceId={sessionInstanceId}
              allowCancel={false}
              groupsOnly
              onAdd={addExercisesFromPicker}
              onGroupsPicked={(ids) => setFocusGroupIds(new Set(ids))}
            />
          )}
          {exercises.length === 0 &&
            !showSearch &&
            (!clientProfileId || focusGroupIds.size > 0) && (
              <div className="flex flex-col items-center gap-5 rounded-2xl border border-dashed border-border/40 bg-muted/20 px-6 py-12 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
                  <Dumbbell className="h-6 w-6 text-muted-foreground" />
                </div>
                <div className="space-y-1">
                  <p className="text-base font-semibold">No exercises yet</p>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Tap &ldquo;Add Exercise&rdquo; below to start logging
                  </p>
                </div>
                <button
                  onClick={openSearch}
                  className="flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-opacity active:opacity-80"
                >
                  <Plus className="h-4 w-4" /> Add First Exercise
                </button>
              </div>
            )}

          {/* ── Mid-session "By Muscle" picker — bottom sheet so the workout list
          stays in place underneath. Continue UNIONs today's focus (adding a
          new group extends the session plan rather than replacing it) and
          closes the sheet — `groupsOnly`, so no suggested-exercise step; the
          opt-in "Suggestions" sheet below is the only suggestions surface.
          AnimatePresence keeps the picker mounted long enough for the
          slide-down exit animation to play before the DOM cleanup. ── */}
          <AnimatePresence>
            {exercises.length > 0 && pickerOpen && clientProfileId && (
              <MuscleGroupPicker
                key="picker-by-muscle"
                clientProfileId={clientProfileId}
                sessionInstanceId={sessionInstanceId}
                allowCancel
                groupsOnly
                onCancel={() => setPickerOpen(false)}
                onAdd={addExercisesFromPicker}
                onGroupsPicked={(ids) => {
                  setFocusGroupIds((prev) => {
                    const next = new Set(prev);
                    for (const id of ids) next.add(id);
                    return next;
                  });
                  setPickerOpen(false);
                }}
                presentation="sheet"
                excludeExerciseIds={exercises.map((e) => e.exerciseId)}
                initialGroupIds={focusGroupIds.size > 0 ? [...focusGroupIds] : undefined}
              />
            )}
          </AnimatePresence>

          {/* ── Suggestions picker — bottom sheet pre-seeded with today's focus
          so the recall list is filtered to "Chest & Back day" instead of
          dumping every past exercise. Falls back to all 8 groups when focus
          is empty. The Back button still lets them widen/narrow on the fly. */}
          <AnimatePresence>
            {suggestionsOpen && clientProfileId && (
              <MuscleGroupPicker
                key="picker-suggestions"
                clientProfileId={clientProfileId}
                sessionInstanceId={sessionInstanceId}
                allowCancel
                onCancel={() => setSuggestionsOpen(false)}
                onAdd={addExercisesFromPicker}
                initialGroupIds={
                  focusGroupIds.size > 0
                    ? [...focusGroupIds]
                    : CURATED_MUSCLE_GROUPS.map((g) => g.id)
                }
                autoAdvance
                presentation="sheet"
                excludeExerciseIds={exercises.map((e) => e.exerciseId)}
              />
            )}
          </AnimatePresence>

          {/* ── Exercise cards ── */}
          {exercises.map((entry, exIdx) => {
            const cfg = TYPE_CONFIG[entry.exerciseType] ?? TYPE_CONFIG.WEIGHTED;
            const Icon = cfg.icon;
            const cols = colsFor(entry.exerciseType, entry.secondaryMetric);

            return (
              <div
                key={entry.tempId}
                className={`overflow-hidden rounded-2xl bg-card shadow-sm transition-opacity ${
                  entry.isCompleted ? 'opacity-70' : ''
                }`}
                style={{
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderLeftWidth: 3,
                  // Completed cards desaturate to emerald regardless of the
                  // exercise type's normal accent — quick visual cue that
                  // the card is in a different state.
                  borderLeftColor: entry.isCompleted ? '#10b981' : cfg.accent,
                }}
              >
                {/* Card header — entire row toggles collapse so the trainer
                doesn't have to hit a tiny chevron. The action buttons
                (progress, delete) stop propagation so they keep their own
                tap targets. */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleCollapse(entry.tempId)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggleCollapse(entry.tempId);
                    }
                  }}
                  className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors active:bg-muted/30"
                >
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${cfg.bg}`}
                  >
                    <Icon className={`h-4 w-4 ${cfg.text}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`truncate text-sm font-semibold leading-tight ${
                        entry.isCompleted ? 'text-muted-foreground line-through' : ''
                      }`}
                    >
                      {entry.exerciseName}
                    </p>
                    <div className="mt-0.5 flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground">
                        {entry.targetMuscle}
                      </span>
                      {entry.isCompleted ? (
                        // ADR-037: explicit "Completed" pill replaces the
                        // set-count chip when complete so the state is
                        // immediately legible at the row level.
                        <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-500">
                          <Check className="h-2.5 w-2.5" />
                          Completed
                        </span>
                      ) : (
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${cfg.bg} ${cfg.text}`}
                        >
                          {entry.sets.length} {entry.sets.length === 1 ? 'set' : 'sets'}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    {clientProfileId && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const unit = progressUnitFor(entry.exerciseType, entry.secondaryMetric);
                          setProgressModal({
                            exerciseId: entry.exerciseId,
                            exerciseName: entry.exerciseName,
                            unit,
                          });
                        }}
                        className="flex h-8 w-8 items-center justify-center rounded-xl text-muted-foreground transition-colors active:bg-primary/10 active:text-primary"
                        title="View progress"
                      >
                        <TrendingUp className="h-4 w-4" />
                      </button>
                    )}
                    {/* Chevron is now decorative — the surrounding row handles the
                    tap. Kept as a span (not a button) so it doesn't steal a
                    tap target or nest interactives. */}
                    <span
                      aria-hidden
                      className="flex h-8 w-8 items-center justify-center rounded-xl text-muted-foreground"
                    >
                      <motion.span
                        animate={{ rotate: entry.collapsed ? 0 : 180 }}
                        transition={{ duration: 0.2, ease: 'easeInOut' }}
                        className="flex"
                      >
                        <ChevronDown className="h-4 w-4" />
                      </motion.span>
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeExercise(entry.tempId);
                      }}
                      className="flex h-8 w-8 items-center justify-center rounded-xl text-muted-foreground/60 transition-colors active:bg-destructive/10 active:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Set table (collapsible) */}
                <AnimatePresence initial={false}>
                  {!entry.collapsed && (
                    <motion.div
                      key="content"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: 'easeInOut' }}
                      style={{ overflow: 'hidden' }}
                    >
                      <div className="border-t border-border/40 px-4 pb-4 pt-3">
                        {/* Column header row */}
                        <div
                          className={`mb-2 grid items-center gap-2 ${getGridClass(cols.length)}`}
                        >
                          <span className="text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            #
                          </span>
                          {cols.map((col) => (
                            <span
                              key={col.key as string}
                              className="text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                            >
                              {col.label}
                            </span>
                          ))}
                          {/* save-tick + remove columns (no labels) */}
                          <span />
                          <span />
                        </div>

                        {/* Set rows */}
                        <div className="space-y-2">
                          {entry.sets.map((set, setIdx) => {
                            // Green once the whole set's persisted values match
                            // what's on screen — i.e. it's been saved and not
                            // re-edited since. Partial rows never match (they're
                            // excluded from the save payload).
                            const setSaved = savedSignatures.has(
                              setSignature(entry.exerciseId, normalizeSet(set)),
                            );
                            return (
                              <div
                                key={setIdx}
                                className={`grid items-center gap-2 ${getGridClass(cols.length)}`}
                              >
                                {/* Set number badge */}
                                <div className="flex items-center justify-center">
                                  <span
                                    className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold"
                                    style={{
                                      backgroundColor: cfg.accent + '22',
                                      color: cfg.accent,
                                    }}
                                  >
                                    {set.setNumber}
                                  </span>
                                </div>

                                {/* Dynamic fields */}
                                {cols.map((col) => {
                                  // Rest cell is a 3-state toggle: idle (tap to
                                  // start rest), active (live countdown for the
                                  // row that owns the running timer), done
                                  // (recorded MM:SS value).
                                  if (col.key === 'restSec') {
                                    const isActiveTarget =
                                      pendingRestTarget?.tempId === entry.tempId &&
                                      pendingRestTarget?.setNumber === set.setNumber;
                                    const hasValue = set.restSec !== undefined;
                                    const isActive =
                                      isActiveTarget &&
                                      restTimerRemaining !== undefined &&
                                      restTimerRemaining !== null;

                                    if (hasValue) {
                                      return (
                                        <div
                                          key={col.key as string}
                                          className="flex h-11 items-center justify-center rounded-xl border border-zinc-800 bg-muted/20 text-sm font-semibold tabular-nums text-foreground"
                                        >
                                          {formatRestSec(set.restSec)}
                                        </div>
                                      );
                                    }
                                    if (isActive) {
                                      return (
                                        <div
                                          key={col.key as string}
                                          aria-live="polite"
                                          className={`flex h-11 items-center justify-center gap-1 rounded-xl border text-sm font-bold tabular-nums ${
                                            restTimerPaused
                                              ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                                              : 'border-blue-500/50 bg-blue-500/15 text-blue-300'
                                          }`}
                                        >
                                          {restTimerPaused && (
                                            <span className="text-[10px] uppercase opacity-70">
                                              ||
                                            </span>
                                          )}
                                          {formatRestSec(restTimerRemaining ?? 0)}
                                        </div>
                                      );
                                    }
                                    // Idle: only enable the rest button once the
                                    // trainer has logged the work for this set
                                    // (kg + reps for WEIGHTED, reps for
                                    // BODYWEIGHT, duration for DURATION). Resting
                                    // before logging is almost always a mis-tap.
                                    const setLogged = cols
                                      .filter((c) => c.key !== 'restSec' && c.key !== 'notes')
                                      .every(
                                        (c) => (set[c.key] as number | undefined) !== undefined,
                                      );
                                    return (
                                      <button
                                        key={col.key as string}
                                        onClick={() =>
                                          requestRestForSet(entry.tempId, set.setNumber)
                                        }
                                        disabled={!setLogged}
                                        aria-label={
                                          setLogged
                                            ? `Start rest after set ${set.setNumber}`
                                            : `Log this set before starting rest`
                                        }
                                        className="flex h-11 items-center justify-center rounded-xl border border-blue-500/30 text-blue-400/70 transition-colors active:bg-blue-500/10 active:text-blue-400 disabled:cursor-not-allowed disabled:border-zinc-800 disabled:bg-transparent disabled:text-muted-foreground/30 disabled:active:bg-transparent"
                                      >
                                        <Clock className="h-4 w-4" />
                                      </button>
                                    );
                                  }
                                  {
                                    const mode = inputModeFor(col.key);
                                    const draftKey = `${exIdx}-${setIdx}-${col.key as string}`;
                                    // Value the server would reject (0 reps,
                                    // decimal reps, rest > 60 min) — the set
                                    // stays a local draft until it's fixed, so
                                    // flag the exact cell.
                                    const fieldInvalid = !isSetFieldValid(
                                      col.key,
                                      set[col.key] as number | string | undefined,
                                    );
                                    return (
                                      <Input
                                        key={col.key as string}
                                        // text + inputMode (vs type="number") avoids Safari's
                                        // number-input quirks (mid-keystroke validation, scroll-
                                        // wheel mutations, trailing-zero stripping) while still
                                        // surfacing the right mobile keypad.
                                        type="text"
                                        inputMode={mode}
                                        pattern={mode === 'decimal' ? '[0-9]*\\.?[0-9]*' : '[0-9]*'}
                                        enterKeyHint="done"
                                        autoComplete="off"
                                        placeholder={placeholderFor(
                                          col.key,
                                          priorSetFor(lastSetsByExId.get(entry.exerciseId), setIdx),
                                        )}
                                        // text-base = 16px: below this iOS Safari auto-zooms on
                                        // focus even with user-scalable=no in PWA standalone.
                                        // Saved rows turn green so the trainer knows the value
                                        // is persisted; editing flips the row back to neutral.
                                        className={`h-11 rounded-xl text-center text-base font-semibold tabular-nums border focus-visible:ring-0 ${
                                          fieldInvalid
                                            ? 'border-red-500/70 text-red-400 focus:border-red-500'
                                            : setSaved
                                              ? 'border-emerald-600/40 text-emerald-400 focus:border-blue-500'
                                              : 'border-zinc-700 focus:border-blue-500'
                                        }`}
                                        value={
                                          col.key === 'notes'
                                            ? set.notes
                                            : (cellDrafts[draftKey] ??
                                              (set[col.key] as number | undefined) ??
                                              '')
                                        }
                                        onChange={(e) => {
                                          // Keep the raw keystrokes so in-progress
                                          // decimals (e.g. "100." → "100.5") survive
                                          // the round-trip through a numeric value.
                                          if (col.key !== 'notes') {
                                            setCellDrafts((d) => ({
                                              ...d,
                                              [draftKey]: e.target.value,
                                            }));
                                          }
                                          updateSet(exIdx, setIdx, col.key, e.target.value);
                                        }}
                                        onFocus={(e) => {
                                          // Wait for the keyboard to start animating in, then
                                          // scroll the focused cell to the middle of the visible
                                          // area. Without this the focused row often sits behind
                                          // the keyboard on small phones.
                                          const el = e.currentTarget;
                                          setTimeout(() => {
                                            el.scrollIntoView({
                                              block: 'center',
                                              behavior: 'smooth',
                                            });
                                          }, 300);
                                        }}
                                        onKeyDown={(e) => {
                                          // Enter dismisses the keyboard. Native browsers don't
                                          // advance focus across loose inputs and a form wrapper
                                          // here would conflict with the existing autosave flow.
                                          if (e.key === 'Enter') e.currentTarget.blur();
                                        }}
                                        onBlur={() => {
                                          // Drop the raw draft so the cell shows the
                                          // canonical parsed number once editing ends.
                                          if (col.key !== 'notes') {
                                            setCellDrafts((d) => {
                                              if (!(draftKey in d)) return d;
                                              const next = { ...d };
                                              delete next[draftKey];
                                              return next;
                                            });
                                          }
                                        }}
                                      />
                                    );
                                  }
                                })}

                                {/* Save tick — persist this row instantly
                                instead of waiting on the 5s auto-save. Shows a
                                steady green check once the row's values are
                                saved; an actionable (tappable) check while the
                                set is complete but not yet persisted; disabled
                                until the work fields are filled in. The
                                auto-save still runs if it's never tapped. */}
                                {(() => {
                                  const setComplete = isSetComplete(set, entry.exerciseType);
                                  return (
                                    <button
                                      onClick={saveNow}
                                      disabled={
                                        !setComplete || setSaved || autoSaveStatus === 'saving'
                                      }
                                      aria-label={
                                        setSaved
                                          ? `Set ${set.setNumber} saved`
                                          : setComplete
                                            ? `Save set ${set.setNumber} now`
                                            : `Log this set before saving`
                                      }
                                      className={`flex h-11 w-11 items-center justify-center rounded-xl border transition-colors disabled:cursor-not-allowed ${
                                        setSaved
                                          ? 'border-emerald-600/40 bg-emerald-500/10 text-emerald-400'
                                          : setComplete
                                            ? 'border-emerald-500/50 text-emerald-400 active:bg-emerald-500/15'
                                            : 'border-zinc-800 text-muted-foreground/30'
                                      }`}
                                    >
                                      <Check className="h-4 w-4" />
                                    </button>
                                  );
                                })()}

                                {/* Remove set — red so it reads clearly as a
                                destructive action, distinct from the per-set
                                save tick to its left. */}
                                <button
                                  onClick={() => removeSet(exIdx, setIdx)}
                                  disabled={entry.sets.length <= 1}
                                  className="flex h-11 w-11 items-center justify-center rounded-xl text-red-500/70 transition-colors active:bg-red-500/10 active:text-red-500 disabled:pointer-events-none disabled:opacity-20"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </div>
                            );
                          })}
                        </div>

                        {/* Add Set — rest is initiated per-row via the cell's
                        idle button, so the bottom row no longer needs a
                        separate Rest affordance. */}
                        <div className="mt-3 space-y-2">
                          <button
                            onClick={() => addSet(exIdx)}
                            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border/50 py-3 text-xs font-semibold text-muted-foreground transition-colors active:bg-muted/40"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Add Set
                          </button>
                          {/* ADR-037: Mark-complete pill. Persists via the
                          5s auto-save debounce. On mark this card collapses
                          + sorts to the bottom; the next incomplete card
                          auto-expands. On unmark the card stays open and
                          sorts back up among the incompletes.
                          Gated on at least one set having the type's
                          required data:
                            WEIGHTED  → reps + weightKg
                            BODYWEIGHT → reps
                            DURATION  → durationSec
                            CARDIO    → durationSec
                          Empty placeholder rows can't sneak through. */}
                          {(() => {
                            const has = (v: number | null | undefined) =>
                              v !== undefined && v !== null;
                            const setIsComplete = (s: SetData) => {
                              switch (entry.exerciseType) {
                                case 'WEIGHTED':
                                  return has(s.reps) && has(s.weightKg);
                                case 'BODYWEIGHT':
                                  return has(s.reps);
                                case 'DURATION':
                                case 'CARDIO':
                                  return has(s.durationSec);
                              }
                            };
                            const hasLoggedSet = entry.sets.some(setIsComplete);
                            const missingLabel =
                              entry.exerciseType === 'WEIGHTED'
                                ? 'Enter reps + kg'
                                : entry.exerciseType === 'BODYWEIGHT'
                                  ? 'Enter reps first'
                                  : 'Enter duration first';
                            if (entry.isCompleted) {
                              return (
                                <button
                                  onClick={() => setExerciseCompleted(entry.tempId, false)}
                                  className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-border/50 py-3 text-xs font-semibold text-muted-foreground transition-colors active:bg-muted/40"
                                >
                                  Unmark complete
                                </button>
                              );
                            }
                            return (
                              <button
                                onClick={() => setExerciseCompleted(entry.tempId, true)}
                                disabled={!hasLoggedSet}
                                aria-label={
                                  hasLoggedSet
                                    ? 'Mark exercise complete'
                                    : `${missingLabel} before marking complete`
                                }
                                title={hasLoggedSet ? undefined : missingLabel}
                                className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-500/15 py-3 text-sm font-semibold text-emerald-500 transition-colors active:bg-emerald-500/25 disabled:cursor-not-allowed disabled:bg-muted/30 disabled:text-muted-foreground/50 disabled:active:bg-muted/30"
                              >
                                <Check className="h-4 w-4" />
                                {hasLoggedSet ? 'Mark complete' : missingLabel}
                              </button>
                            );
                          })()}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}

          {/* ── Bottom CTAs — three peers for adding more work to the session:
          search the catalog, pick by curated muscle group, or recall every
          past exercise this client has done. Only the search button is
          shown when we don't have a clientProfileId (legacy callers). ── */}
          {exercises.length > 0 && (
            <div className={clientProfileId ? 'grid grid-cols-3 gap-2' : ''}>
              <button
                onClick={() => (showSearch ? setShowSearch(false) : openSearch())}
                className={`flex w-full flex-col items-center justify-center gap-1 rounded-2xl border border-dashed py-3 text-xs font-semibold transition-colors ${
                  showSearch
                    ? 'border-border/40 text-muted-foreground'
                    : 'border-primary/30 text-primary hover:bg-primary/5'
                }`}
              >
                {showSearch ? <X className="h-4 w-4" /> : <Search className="h-4 w-4" />}
                {showSearch ? 'Cancel' : 'Search'}
              </button>
              {clientProfileId && (
                <>
                  <button
                    onClick={() => {
                      setPickerOpen((v) => !v);
                      setSuggestionsOpen(false);
                      if (!pickerOpen)
                        setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
                    }}
                    className={`flex w-full flex-col items-center justify-center gap-1 rounded-2xl border border-dashed py-3 text-xs font-semibold transition-colors ${
                      pickerOpen
                        ? 'border-border/40 text-muted-foreground'
                        : 'border-violet-500/40 text-violet-400 hover:bg-violet-500/5'
                    }`}
                  >
                    {pickerOpen ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                    {pickerOpen ? 'Cancel' : 'By Muscle'}
                  </button>
                  <button
                    onClick={() => {
                      setSuggestionsOpen((v) => !v);
                      setPickerOpen(false);
                      if (!suggestionsOpen)
                        setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
                    }}
                    className={`flex w-full flex-col items-center justify-center gap-1 rounded-2xl border border-dashed py-3 text-xs font-semibold transition-colors ${
                      suggestionsOpen
                        ? 'border-border/40 text-muted-foreground'
                        : 'border-amber-500/40 text-amber-400 hover:bg-amber-500/5'
                    }`}
                  >
                    {suggestionsOpen ? <X className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                    {suggestionsOpen ? 'Cancel' : 'Suggestions'}
                  </button>
                </>
              )}
            </div>
          )}

          {/* ── Exercise Progress Modal ── */}
          {progressModal && clientProfileId && (
            <ExerciseProgressModal
              clientProfileId={clientProfileId}
              exerciseId={progressModal.exerciseId}
              exerciseName={progressModal.exerciseName}
              unit={progressModal.unit}
              onClose={() => setProgressModal(null)}
            />
          )}
        </>
      )}
    </div>
  );
}

function getGridClass(colCount: number) {
  // set-badge + N data cols + save tick + remove btn. The Rest column is one
  // of the data cols; it carries its own state-aware control (idle button /
  // live countdown / done label) so we don't need an extra grid slot for it.
  // The save tick sits right after the last data col (the Rest cell).
  if (colCount === 1) return 'grid-cols-[2rem_1fr_2rem_2rem]';
  if (colCount === 2) return 'grid-cols-[2rem_1fr_1fr_2rem_2rem]';
  return 'grid-cols-[2rem_1fr_1fr_1fr_2rem_2rem]';
}

function AutoSaveIndicator({ status, onRetry }: { status: AutoSaveStatus; onRetry: () => void }) {
  if (status === 'idle') return null;
  if (status === 'saving') {
    return (
      <span className="ml-1 flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Saving
      </span>
    );
  }
  if (status === 'saved') {
    return (
      <span className="ml-1 flex items-center gap-1 text-[10px] font-medium text-emerald-500">
        <Check className="h-3 w-3" /> Saved
      </span>
    );
  }
  return (
    <button
      onClick={onRetry}
      className="ml-1 flex items-center gap-1 text-[10px] font-medium text-red-500 underline-offset-2 hover:underline"
    >
      <AlertCircle className="h-3 w-3" /> Retry
    </button>
  );
}

// Maps a current set row (by index) to the corresponding prior-session set.
// If the trainer adds more sets than the prior session had, fall back to the
// last prior set so extras still get a useful hint instead of empty.
function priorSetFor(
  priorSets: LastSetSnapshot[] | undefined,
  setIdx: number,
): LastSetSnapshot | undefined {
  if (!priorSets || priorSets.length === 0) return undefined;
  return priorSets[setIdx] ?? priorSets[priorSets.length - 1];
}

// Drives input placeholders for a fresh set row. The previous session's
// values appear as faint hints — the trainer can copy/adjust for progression
// without retyping. Falls back to the historical defaults ("1–10" for RPE,
// "—" for everything else).
function placeholderFor(key: keyof SetData, last: LastSetSnapshot | null | undefined): string {
  if (!last) return key === 'rpe' ? '1–10' : '—';
  if (key === 'reps' && last.reps != null) return String(last.reps);
  if (key === 'weightKg' && last.weightKg != null) {
    return Number.isInteger(last.weightKg) ? String(last.weightKg) : last.weightKg.toFixed(1);
  }
  if (key === 'durationSec' && last.durationSec != null) return String(last.durationSec);
  if (key === 'rpe' && last.rpe != null) return String(last.rpe);
  if (key === 'restSec' && last.restSec != null) return formatRestSec(last.restSec);
  if (key === 'stepsCount' && last.stepsCount != null) return String(last.stepsCount);
  return key === 'rpe' ? '1–10' : '—';
}

// MM:SS display format for rest values. Stored values stay in seconds; this
// is purely for the read-only rest cell + placeholder hints.
function formatRestSec(sec: number | null | undefined): string {
  if (sec === null || sec === undefined) return '';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ─── Exercise Progress Modal ──────────────────────────────────────────────────

interface ChartPoint {
  date: string;
  value: number | null;
}

function ExerciseProgressModal({
  clientProfileId,
  exerciseId,
  exerciseName,
  unit,
  onClose,
}: {
  clientProfileId: string;
  exerciseId: string;
  exerciseName: string;
  unit: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetch(`/api/trainer/clients/${clientProfileId}/exercise-progress?exerciseId=${exerciseId}`)
      .then((r) => r.json())
      .then(({ data: d }) => setData(d ?? []))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [clientProfileId, exerciseId]);

  // Compute stats
  const values = data.map((d) => d.value).filter((v): v is number => v != null);
  const latest = values[values.length - 1] ?? null;
  const first = values[0] ?? null;
  const best = values.length ? Math.max(...values) : null;
  const delta = latest != null && first != null ? latest - first : null;

  const chartData = data
    .filter((d) => d.value != null)
    .map((d) => ({
      date: new Date(d.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
      value: d.value,
    }));

  // Prevent background scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Sheet */}
      <div className="relative z-10 w-full max-w-lg rounded-t-3xl bg-card pb-safe">
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-border" />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-3 pb-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Exercise Progress
            </p>
            <h2 className="mt-0.5 text-lg font-bold">{exerciseName}</h2>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : data.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
              <TrendingUp className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="font-medium">No history yet</p>
            <p className="text-sm text-muted-foreground">
              Progress will appear after sessions are logged
            </p>
          </div>
        ) : (
          <div className="px-5 pb-6 space-y-5">
            {/* Stat row */}
            <div className="grid grid-cols-3 gap-3">
              <StatPill label="Latest" value={latest} unit={unit} />
              <StatPill label="Best" value={best} unit={unit} accent="text-amber-500" />
              <DeltaPill delta={delta} unit={unit} sessions={values.length} />
            </div>

            {/* Chart */}
            <div className="rounded-2xl bg-background p-4 ring-1 ring-border/40">
              <p className="mb-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {unit === 'kg'
                  ? 'Max weight per session'
                  : unit === 'sec'
                    ? 'Duration per session'
                    : 'Performance over time'}
              </p>
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="exGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(217 91% 60%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(217 91% 60%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgba(255,255,255,0.08)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: '#888', fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fill: '#888', fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) => `${v}${unit}`}
                    width={44}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div className="rounded-xl border border-border/60 bg-card px-3 py-2 text-xs shadow-lg">
                          <p className="text-muted-foreground">{label}</p>
                          <p className="mt-0.5 text-sm font-bold">
                            {(payload[0]?.value as number)?.toFixed(1)} {unit}
                          </p>
                        </div>
                      );
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="hsl(217 91% 60%)"
                    strokeWidth={2.5}
                    fill="url(#exGrad)"
                    dot={{ fill: 'hsl(217 91% 60%)', r: 4, strokeWidth: 0 }}
                    activeDot={{
                      r: 5,
                      fill: 'hsl(217 91% 60%)',
                      stroke: 'hsl(var(--background))',
                      strokeWidth: 2,
                    }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatPill({
  label,
  value,
  unit,
  accent = 'text-foreground',
}: {
  label: string;
  value: number | null;
  unit: string;
  accent?: string;
}) {
  return (
    <div className="rounded-2xl bg-background p-3 ring-1 ring-border/40">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className={`mt-1 text-lg font-bold leading-none ${accent}`}>
        {value != null ? value.toFixed(1) : '—'}
        <span className="ml-0.5 text-xs font-normal text-muted-foreground">
          {value != null ? unit : ''}
        </span>
      </p>
    </div>
  );
}

function DeltaPill({
  delta,
  unit,
  sessions,
}: {
  delta: number | null;
  unit: string;
  sessions: number;
}) {
  const positive = delta != null && delta > 0;
  const neutral = delta == null || Math.abs(delta) < 0.01;
  const Icon = neutral ? Minus : positive ? ArrowUpRight : ArrowDownRight;
  const color = neutral ? 'text-muted-foreground' : positive ? 'text-emerald-500' : 'text-red-500';
  return (
    <div className="rounded-2xl bg-background p-3 ring-1 ring-border/40">
      <p className="text-[10px] text-muted-foreground">Change</p>
      <div className={`mt-1 flex items-center gap-0.5 text-lg font-bold leading-none ${color}`}>
        <Icon className="h-4 w-4" />
        {delta != null && !neutral ? `${Math.abs(delta).toFixed(1)}${unit}` : '—'}
      </div>
      <p className="mt-1 text-[9px] text-muted-foreground">
        {sessions} session{sessions !== 1 ? 's' : ''}
      </p>
    </div>
  );
}
