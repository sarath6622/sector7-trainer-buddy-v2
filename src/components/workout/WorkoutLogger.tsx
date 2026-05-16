'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
  BedDouble,
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
  equipmentRequired: string | null;
}

interface SetData {
  setNumber: number;
  reps: number | undefined;
  weightKg: number | undefined;
  durationSec: number | undefined;
  rpe: number | undefined;
  restSec: number | undefined;
  notes: string;
}

interface LastSetSnapshot {
  setNumber: number;
  reps: number | null;
  weightKg: number | null;
  durationSec: number | null;
  rpe: number | null;
  restSec: number | null;
}

interface ExerciseEntry {
  tempId: string;
  exerciseId: string;
  exerciseName: string;
  targetMuscle: string;
  category: string;
  exerciseType: ExerciseType;
  sets: SetData[];
  collapsed: boolean;
}

type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface WorkoutLoggerProps {
  sessionInstanceId: string;
  clientProfileId?: string; // when set, enables per-exercise progress modal
  clientName?: string; // shown in the workout-log header so the trainer always knows whose log this is
  onUnsavedChange?: (hasUnsaved: boolean) => void;
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
    exercise: {
      id: string;
      name: string;
      targetMuscleGroup: string;
      category: string;
      exerciseType: ExerciseType;
    };
    sets: {
      setNumber: number;
      reps: number | null;
      weightKg: number | null;
      durationSec: number | null;
      rpe: number | null;
      restSec: number | null;
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

// Rest column is shown alongside the type-specific work columns. We surface
// rest taken before the set instead of RPE — the rpe field still exists on
// the model but is no longer entered here (other surfaces / future trainer
// modes can bring it back if needed). Capped at 60 min via the rest timer
// validator; the input accepts seconds for compactness.
const TYPE_COLS: Record<ExerciseType, ColDef[]> = {
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
  CARDIO: [
    { key: 'durationSec', label: 'sec' },
    { key: 'notes', label: 'km' },
  ],
};

// ─── WorkoutLogger ────────────────────────────────────────────────────────────

export function WorkoutLogger({
  sessionInstanceId,
  clientProfileId,
  clientName: _clientName,
  onUnsavedChange,
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
  // In-flight tracking so the debounced auto-save never fires concurrent
  // POSTs (which could race and clobber each other).
  const inFlightRef = useRef(false);
  const pendingRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusFadeRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (existingLogs && existingLogs.length > 0) {
      type Log = (typeof existingLogs)[number];
      type RawSet = Log['sets'][number];

      // Score a set by how many fields have data (higher = more complete)
      const score = (s: RawSet) =>
        (s.reps != null ? 1 : 0) +
        (s.weightKg != null ? 1 : 0) +
        (s.durationSec != null ? 1 : 0) +
        (s.rpe != null ? 1 : 0);

      // Group duplicate WorkoutLog records by exercise.id (logs are ordered oldest→newest via id ASC)
      const groups = new Map<string, { primary: Log; setMap: Map<number, RawSet> }>();
      for (const log of existingLogs) {
        const group = groups.get(log.exercise.id);
        if (!group) {
          const setMap = new Map<number, RawSet>();
          for (const s of log.sets) setMap.set(s.setNumber, s);
          groups.set(log.exercise.id, { primary: log, setMap });
        } else {
          // Merge sets: newer log's set wins if it has more data; new set numbers are appended
          for (const s of log.sets) {
            const existing = group.setMap.get(s.setNumber);
            if (!existing || score(s) > score(existing)) {
              group.setMap.set(s.setNumber, s);
            }
          }
        }
      }

      const deduped = [...groups.values()]
        .sort((a, b) => a.primary.orderIndex - b.primary.orderIndex)
        .map(({ primary, setMap }) => ({
          ...primary,
          sets: [...setMap.values()].sort((a, b) => a.setNumber - b.setNumber),
        }));

      const initial = deduped.map<ExerciseEntry>((log, idx) => ({
        tempId: log.id,
        exerciseId: log.exercise.id,
        exerciseName: log.exercise.name,
        targetMuscle: log.exercise.targetMuscleGroup,
        category: log.exercise.category,
        exerciseType: log.exercise.exerciseType,
        sets: log.sets.map((s) => ({
          setNumber: s.setNumber,
          reps: s.reps ?? undefined,
          weightKg: s.weightKg ?? undefined,
          durationSec: s.durationSec ?? undefined,
          rpe: s.rpe ?? undefined,
          restSec: s.restSec ?? undefined,
          notes: s.notes ?? '',
        })),
        collapsed: idx !== deduped.length - 1,
      }));
      setExercises(initial);
      // Seed the last-saved hash so auto-save doesn't re-POST the data we
      // just hydrated from the server. Shape must match the payload built
      // in `currentPayload` so the comparison is apples-to-apples.
      lastSavedHashRef.current = JSON.stringify(
        initial.map((entry, idx) => ({
          exerciseId: entry.exerciseId,
          orderIndex: idx,
          sets: entry.sets.map((s) => ({
            setNumber: s.setNumber,
            reps: s.reps,
            weightKg: s.weightKg,
            durationSec: s.durationSec,
            rpe: s.rpe,
            restSec: s.restSec,
            notes: s.notes || undefined,
          })),
        })),
      );

      // Bootstrap today's focus from whatever exercises were already logged
      // before this mount (session resumed or page refreshed). Each exercise's
      // catalog muscle maps to one curated bucket.
      const seeded = new Set<CuratedMuscleGroupId>();
      for (const log of deduped) {
        const id = curatedGroupOf(log.exercise.targetMuscleGroup);
        if (id) seeded.add(id);
      }
      if (seeded.size > 0) setFocusGroupIds(seeded);
    }
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

  useEffect(() => {
    if (showSearch) setTimeout(() => searchRef.current?.focus(), 50);
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

  // Opening the search modal pre-seeds the muscle-group chips from today's
  // focus — if the trainer already said "Chest day", they shouldn't have to
  // re-tap Chest inside search to filter the catalog. Multiple focus groups
  // all carry over.
  function openSearch() {
    setSearchMuscleGroups(new Set(focusGroupIds));
    setShowSearch(true);
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
  }

  function addExercisesFromPicker(picked: PickedExercise[]) {
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
        sets: [
          {
            setNumber: 1,
            reps: undefined,
            weightKg: undefined,
            durationSec: undefined,
            rpe: undefined,
            restSec: undefined,
            notes: '',
          },
        ],
        // Expand only the last addition so the trainer lands on a fresh card
        collapsed: idx !== fresh.length - 1,
        lastSet: p.lastSet
          ? {
              reps: p.lastSet.reps,
              weightKg: p.lastSet.weightKg,
              durationSec: p.lastSet.durationSec,
              rpe: p.lastSet.rpe,
            }
          : null,
      }));
      return [...collapsed, ...additions];
    });
    setPickerOpen(false);
    setSuggestionsOpen(false);
  }

  function removeExercise(tempId: string) {
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
      entry.sets = [
        ...sets,
        {
          setNumber: sets.length + 1,
          reps: undefined,
          weightKg: undefined,
          durationSec: undefined,
          rpe: undefined,
          restSec: undefined,
          notes: '',
        },
      ];
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
  const currentPayload = useMemo(
    () =>
      exercises.map((entry, idx) => ({
        exerciseId: entry.exerciseId,
        orderIndex: idx,
        sets: entry.sets.map((s) => ({
          setNumber: s.setNumber,
          reps: s.reps,
          weightKg: s.weightKg,
          durationSec: s.durationSec,
          rpe: s.rpe,
          restSec: s.restSec,
          notes: s.notes || undefined,
        })),
      })),
    [exercises],
  );
  const currentHash = useMemo(() => JSON.stringify(currentPayload), [currentPayload]);
  const hasUnsaved = currentHash !== lastSavedHashRef.current;

  // Persist to the server. Idempotent on the backend — every POST atomically
  // replaces the session's logs with the payload, so calling this on every
  // keystroke (debounced) is safe. Serialized via inFlight/pending refs so a
  // mid-save edit doesn't race the in-flight request.
  const saveWorkout = useCallback(async () => {
    if (currentPayload.length === 0) return; // schema requires ≥1 exercise
    if (inFlightRef.current) {
      pendingRef.current = true;
      return;
    }
    inFlightRef.current = true;
    setAutoSaveStatus('saving');
    const sentHash = JSON.stringify(currentPayload);
    try {
      // Shared trainer/client write path (ADR-036). The route uses
      // assertSessionAccess so either the session's trainer or its client
      // can save; sessionInstanceId moves from the body to the URL.
      const res = await fetch(`/api/sessions/${sessionInstanceId}/workouts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exercises: currentPayload }),
      });
      if (res.ok) {
        lastSavedHashRef.current = sentHash;
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
        toast.error(err.error || 'Auto-save failed');
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

  // Debounce: wait for typing to settle, then auto-save. Cancels and resets
  // on every change so a flurry of keystrokes results in a single POST.
  useEffect(() => {
    if (!hasUnsaved) return;
    if (currentPayload.length === 0) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void saveWorkout();
    }, 800);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [hasUnsaved, currentHash, currentPayload.length, saveWorkout]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (statusFadeRef.current) clearTimeout(statusFadeRef.current);
    };
  }, []);

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
            <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
              {exercises.length}
            </span>
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
                    <div className="flex-1 overflow-y-auto">
                      {searchLoading ? (
                        <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Searching…
                        </div>
                      ) : visibleResults.length > 0 ? (
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
                        <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
                          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-muted">
                            <Search className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <p className="text-sm font-medium">No exercises match</p>
                          <p className="text-xs text-muted-foreground">
                            Try a different filter or clear them all.
                          </p>
                        </div>
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
          the session by tapping focus cards. Falls back to the dashed
          "no exercises" card only if we don't know who the client is
          (clientProfileId is required by the picker to fetch suggestions). */}
          {exercises.length === 0 && !showSearch && clientProfileId && (
            <MuscleGroupPicker
              clientProfileId={clientProfileId}
              sessionInstanceId={sessionInstanceId}
              allowCancel={false}
              onAdd={addExercisesFromPicker}
              onGroupsPicked={(ids) => setFocusGroupIds(new Set(ids))}
              onRequestSearch={(ids) => {
                setSearchMuscleGroups(new Set(ids));
                setShowSearch(true);
              }}
            />
          )}
          {exercises.length === 0 && !showSearch && !clientProfileId && (
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
                onClick={() => setShowSearch(true)}
                className="flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-opacity active:opacity-80"
              >
                <Plus className="h-4 w-4" /> Add First Exercise
              </button>
            </div>
          )}

          {/* ── Mid-session "By Muscle" picker — bottom sheet so the workout list
          stays in place underneath. Continues UNION today's focus so adding
          a new group extends the session plan rather than replacing it.
          AnimatePresence keeps the picker mounted long enough for the
          slide-down exit animation to play before the DOM cleanup. ── */}
          <AnimatePresence>
            {exercises.length > 0 && pickerOpen && clientProfileId && (
              <MuscleGroupPicker
                key="picker-by-muscle"
                clientProfileId={clientProfileId}
                sessionInstanceId={sessionInstanceId}
                allowCancel
                onCancel={() => setPickerOpen(false)}
                onAdd={addExercisesFromPicker}
                onGroupsPicked={(ids) =>
                  setFocusGroupIds((prev) => {
                    const next = new Set(prev);
                    for (const id of ids) next.add(id);
                    return next;
                  })
                }
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
            const cols = TYPE_COLS[entry.exerciseType] ?? TYPE_COLS.WEIGHTED;

            return (
              <div
                key={entry.tempId}
                className="overflow-hidden rounded-2xl bg-card shadow-sm"
                style={{
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderLeftWidth: 3,
                  borderLeftColor: cfg.accent,
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
                    <p className="truncate text-sm font-semibold leading-tight">
                      {entry.exerciseName}
                    </p>
                    <div className="mt-0.5 flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground">
                        {entry.targetMuscle}
                      </span>
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${cfg.bg} ${cfg.text}`}
                      >
                        {entry.sets.length} {entry.sets.length === 1 ? 'set' : 'sets'}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    {clientProfileId && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const unit =
                            entry.exerciseType === 'WEIGHTED'
                              ? 'kg'
                              : entry.exerciseType === 'CARDIO'
                                ? 'km'
                                : entry.exerciseType === 'DURATION'
                                  ? 'sec'
                                  : 'reps';
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
                          <span />
                        </div>

                        {/* Set rows */}
                        <div className="space-y-2">
                          {entry.sets.map((set, setIdx) => (
                            <div
                              key={setIdx}
                              className={`grid items-center gap-2 ${getGridClass(cols.length)}`}
                            >
                              {/* Set number badge */}
                              <div className="flex items-center justify-center">
                                <span
                                  className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold"
                                  style={{ backgroundColor: cfg.accent + '22', color: cfg.accent }}
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
                                    .every((c) => (set[c.key] as number | undefined) !== undefined);
                                  return (
                                    <button
                                      key={col.key as string}
                                      onClick={() => requestRestForSet(entry.tempId, set.setNumber)}
                                      disabled={!setLogged}
                                      aria-label={
                                        setLogged
                                          ? `Start rest after set ${set.setNumber}`
                                          : `Log this set before starting rest`
                                      }
                                      className="flex h-11 items-center justify-center rounded-xl border border-blue-500/30 text-blue-400/70 transition-colors active:bg-blue-500/10 active:text-blue-400 disabled:cursor-not-allowed disabled:border-zinc-800 disabled:bg-transparent disabled:text-muted-foreground/30 disabled:active:bg-transparent"
                                    >
                                      <BedDouble className="h-4 w-4" />
                                    </button>
                                  );
                                }
                                return (
                                  <Input
                                    key={col.key as string}
                                    type="number"
                                    inputMode="decimal"
                                    placeholder={placeholderFor(
                                      col.key,
                                      priorSetFor(lastSetsByExId.get(entry.exerciseId), setIdx),
                                    )}
                                    step={col.step}
                                    min={col.min}
                                    max={col.max}
                                    className="h-11 rounded-xl text-center text-sm font-semibold tabular-nums border border-zinc-700 focus:border-blue-500 focus-visible:ring-0"
                                    value={
                                      col.key === 'notes'
                                        ? set.notes
                                        : ((set[col.key] as number | undefined) ?? '')
                                    }
                                    onChange={(e) =>
                                      updateSet(exIdx, setIdx, col.key, e.target.value)
                                    }
                                  />
                                );
                              })}

                              {/* Remove set */}
                              <button
                                onClick={() => removeSet(exIdx, setIdx)}
                                disabled={entry.sets.length <= 1}
                                className="flex h-11 w-11 items-center justify-center rounded-xl text-muted-foreground/40 transition-colors active:bg-destructive/10 active:text-destructive disabled:pointer-events-none disabled:opacity-20"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          ))}
                        </div>

                        {/* Add Set — rest is initiated per-row via the cell's
                        idle button, so the bottom row no longer needs a
                        separate Rest affordance. */}
                        <div className="mt-3">
                          <button
                            onClick={() => addSet(exIdx)}
                            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border/50 py-3 text-xs font-semibold text-muted-foreground transition-colors active:bg-muted/40"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Add Set
                          </button>
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
  // set-badge + N data cols + remove btn. The Rest column is one of the
  // data cols; it carries its own state-aware control (idle button / live
  // countdown / done label) so we don't need an extra grid slot for it.
  if (colCount === 1) return 'grid-cols-[2rem_1fr_2rem]';
  if (colCount === 2) return 'grid-cols-[2rem_1fr_1fr_2rem]';
  return 'grid-cols-[2rem_1fr_1fr_1fr_2rem]';
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
