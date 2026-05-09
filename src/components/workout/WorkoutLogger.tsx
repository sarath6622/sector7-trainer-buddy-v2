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
} from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { BadgeCelebration } from '@/components/badges/BadgeCelebration';
import { MuscleGroupPicker, GROUP_THEME, type PickedExercise } from './MuscleGroupPicker';
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
  notes: string;
}

interface LastSetSnapshot {
  reps: number | null;
  weightKg: number | null;
  durationSec: number | null;
  rpe: number | null;
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
  /** Last set logged for this exercise on a prior session — drives input
   *  placeholders so the trainer sees prior weight/reps as a progression hint. */
  lastSet?: LastSetSnapshot | null;
}

type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface WorkoutLoggerProps {
  sessionInstanceId: string;
  clientProfileId?: string; // when set, enables per-exercise progress modal
  clientName?: string; // shown in the workout-log header so the trainer always knows whose log this is
  onUnsavedChange?: (hasUnsaved: boolean) => void;
  onRequestRest?: () => void; // when set, shows a Rest button alongside Add Set
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

const TYPE_COLS: Record<ExerciseType, ColDef[]> = {
  WEIGHTED: [
    { key: 'reps', label: 'Reps' },
    { key: 'weightKg', label: 'kg', step: '0.5' },
    { key: 'rpe', label: 'RPE', min: 1, max: 10 },
  ],
  BODYWEIGHT: [
    { key: 'reps', label: 'Reps' },
    { key: 'rpe', label: 'RPE', min: 1, max: 10 },
  ],
  DURATION: [
    { key: 'durationSec', label: 'sec' },
    { key: 'rpe', label: 'RPE', min: 1, max: 10 },
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
  clientName,
  onUnsavedChange,
  onRequestRest,
  existingLogs,
}: WorkoutLoggerProps) {
  const [exercises, setExercises] = useState<ExerciseEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ExerciseOption[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<AutoSaveStatus>('idle');
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

  const searchExercises = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    try {
      const res = await fetch(`/api/exercises?search=${encodeURIComponent(query)}&pageSize=10`);
      if (res.ok) {
        const r = await res.json();
        setSearchResults(r.data);
      }
    } catch {
      /* silent */
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => searchExercises(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery, searchExercises]);

  useEffect(() => {
    if (showSearch) setTimeout(() => searchRef.current?.focus(), 50);
  }, [showSearch]);

  function addExercise(exercise: ExerciseOption) {
    setExercises((prev) => [
      ...prev.map((e) => ({ ...e, collapsed: true })),
      {
        tempId: `temp-${Date.now()}`,
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        targetMuscle: exercise.targetMuscleGroup,
        category: exercise.category,
        exerciseType: exercise.exerciseType,
        sets: [
          {
            setNumber: 1,
            reps: undefined,
            weightKg: undefined,
            durationSec: undefined,
            rpe: undefined,
            notes: '',
          },
        ],
        collapsed: false,
      },
    ]);
    setShowSearch(false);
    setSearchQuery('');
    setSearchResults([]);
  }

  function addExercisesFromPicker(picked: PickedExercise[]) {
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
    setExercises((prev) => {
      const updated = [...prev];
      const entry = { ...updated[exerciseIndex]! };
      entry.sets = [
        ...entry.sets,
        {
          setNumber: entry.sets.length + 1,
          reps: undefined,
          weightKg: undefined,
          durationSec: undefined,
          rpe: undefined,
          notes: '',
        },
      ];
      updated[exerciseIndex] = entry;
      return updated;
    });
  }

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
      const res = await fetch('/api/trainer/workouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionInstanceId, exercises: currentPayload }),
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
      <div className="flex items-center justify-between">
        <div className="flex min-w-0 pt-2.5 items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Workout Log
          </span>
          {clientName && (
            <>
              <span className="text-xs text-muted-foreground/50">·</span>
              <span className="truncate text-xs font-semibold text-foreground">{clientName}</span>
            </>
          )}
          {exercises.length > 0 && (
            <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
              {exercises.length}
            </span>
          )}
          <AutoSaveIndicator status={autoSaveStatus} onRetry={() => void saveWorkout()} />
        </div>
        {/* Hide the small "+" while the empty state is showing — the big
            "Add First Exercise" button below already owns that affordance. */}
        {(exercises.length > 0 || showSearch) && (
          <button
            onClick={() => setShowSearch((v) => !v)}
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-colors ${
              showSearch
                ? 'bg-muted text-muted-foreground'
                : 'bg-primary/10 text-primary hover:bg-primary/15'
            }`}
          >
            {showSearch ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>

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

      {/* ── Exercise search modal ── */}
      {showSearch && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={() => {
              setShowSearch(false);
              setSearchQuery('');
              setSearchResults([]);
            }}
          />
          <div className="fixed left-4 right-4 top-24 z-50 rounded-2xl border bg-card shadow-2xl overflow-hidden">
            <div className="flex items-center gap-2 border-b px-3 py-2.5">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                ref={searchRef}
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                placeholder="Search exercises…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setShowSearch(false);
                    setSearchQuery('');
                  }
                }}
              />
              <button
                onClick={() => {
                  setShowSearch(false);
                  setSearchQuery('');
                  setSearchResults([]);
                }}
                className="rounded-md p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {searchResults.length > 0 ? (
              <div className="max-h-72 overflow-y-auto divide-y divide-border/50">
                {searchResults.map((ex) => {
                  const cfg = TYPE_CONFIG[ex.exerciseType];
                  const Icon = cfg.icon;
                  return (
                    <button
                      key={ex.id}
                      onClick={() => addExercise(ex)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-muted/60"
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
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${cfg.bg} ${cfg.text}`}
                      >
                        {cfg.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : searchQuery.trim() ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                No exercises found
              </p>
            ) : (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                Start typing to search…
              </p>
            )}
          </div>
        </>
      )}

      {/* ── Empty state — show muscle-group picker so the trainer can plan
          the session by tapping focus cards. Falls back to the dashed
          "no exercises" card only if we don't know who the client is
          (clientProfileId is required by the picker to fetch suggestions). */}
      {exercises.length === 0 && !showSearch && clientProfileId && (
        <MuscleGroupPicker
          clientProfileId={clientProfileId}
          allowCancel={false}
          onAdd={addExercisesFromPicker}
          onGroupsPicked={(ids) => setFocusGroupIds(new Set(ids))}
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
            allowCancel
            onCancel={() => setSuggestionsOpen(false)}
            onAdd={addExercisesFromPicker}
            initialGroupIds={
              focusGroupIds.size > 0 ? [...focusGroupIds] : CURATED_MUSCLE_GROUPS.map((g) => g.id)
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
            {/* Card header */}
            <div className="flex items-center gap-3 px-4 py-3">
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${cfg.bg}`}
              >
                <Icon className={`h-4 w-4 ${cfg.text}`} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold leading-tight">{entry.exerciseName}</p>
                <div className="mt-0.5 flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground">{entry.targetMuscle}</span>
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
                    onClick={() => {
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
                <button
                  onClick={() => toggleCollapse(entry.tempId)}
                  className="flex h-8 w-8 items-center justify-center rounded-xl text-muted-foreground transition-colors active:bg-muted"
                >
                  <motion.div
                    animate={{ rotate: entry.collapsed ? 0 : 180 }}
                    transition={{ duration: 0.2, ease: 'easeInOut' }}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </motion.div>
                </button>
                <button
                  onClick={() => removeExercise(entry.tempId)}
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
                    <div className={`mb-2 grid items-center gap-2 ${getGridClass(cols.length)}`}>
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
                          {cols.map((col) => (
                            <Input
                              key={col.key as string}
                              type="number"
                              inputMode="decimal"
                              placeholder={placeholderFor(col.key, entry.lastSet)}
                              step={col.step}
                              min={col.min}
                              max={col.max}
                              className="h-11 rounded-xl text-center text-sm font-semibold tabular-nums border border-zinc-700 focus:border-blue-500 focus-visible:ring-0"
                              value={
                                col.key === 'notes'
                                  ? set.notes
                                  : ((set[col.key] as number | undefined) ?? '')
                              }
                              onChange={(e) => updateSet(exIdx, setIdx, col.key, e.target.value)}
                            />
                          ))}

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

                    {/* Add Set + Rest (Rest only when handler provided) */}
                    <div
                      className={`mt-3 grid gap-2 ${onRequestRest ? 'grid-cols-[1fr_auto]' : ''}`}
                    >
                      <button
                        onClick={() => addSet(exIdx)}
                        className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border/50 py-3 text-xs font-semibold text-muted-foreground transition-colors active:bg-muted/40"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add Set
                      </button>
                      {onRequestRest && (
                        <button
                          onClick={onRequestRest}
                          aria-label="Rest timer"
                          className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-blue-500/40 px-4 py-3 text-xs font-semibold text-blue-400 transition-colors active:bg-blue-500/10"
                        >
                          <BedDouble className="h-3.5 w-3.5" />
                          Rest
                        </button>
                      )}
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
            onClick={() => {
              setShowSearch((v) => !v);
              if (!showSearch)
                setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
            }}
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
    </div>
  );
}

function getGridClass(colCount: number) {
  // set-badge + N data cols + remove btn
  const cols = colCount;
  if (cols === 1) return 'grid-cols-[2rem_1fr_2rem]';
  if (cols === 2) return 'grid-cols-[2rem_1fr_1fr_2rem]';
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

// Drives input placeholders for a fresh set row. When the picker carried over
// a `lastSet` snapshot, the previous values appear as faint hints — the
// trainer can copy/adjust for progression without retyping. Falls back to the
// historical defaults ("1–10" for RPE, "—" for everything else).
function placeholderFor(key: keyof SetData, last: LastSetSnapshot | null | undefined): string {
  if (!last) return key === 'rpe' ? '1–10' : '—';
  if (key === 'reps' && last.reps != null) return String(last.reps);
  if (key === 'weightKg' && last.weightKg != null) {
    return Number.isInteger(last.weightKg) ? String(last.weightKg) : last.weightKg.toFixed(1);
  }
  if (key === 'durationSec' && last.durationSec != null) return String(last.durationSec);
  if (key === 'rpe' && last.rpe != null) return String(last.rpe);
  return key === 'rpe' ? '1–10' : '—';
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
