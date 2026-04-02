'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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
  ChevronUp,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

interface ExerciseEntry {
  tempId: string;
  exerciseId: string;
  exerciseName: string;
  targetMuscle: string;
  category: string;
  exerciseType: ExerciseType;
  sets: SetData[];
  saved: boolean;
  collapsed: boolean;
}

interface WorkoutLoggerProps {
  sessionInstanceId: string;
  clientProfileId?: string; // when set, enables per-exercise progress modal
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
  existingLogs,
}: WorkoutLoggerProps) {
  const [exercises, setExercises] = useState<ExerciseEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ExerciseOption[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [saving, setSaving] = useState(false);
  const [progressModal, setProgressModal] = useState<{
    exerciseId: string;
    exerciseName: string;
    unit: string;
  } | null>(null);
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

      setExercises(
        deduped.map((log) => ({
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
          saved: true,
          collapsed: false,
        })),
      );
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
      ...prev,
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
        saved: false,
        collapsed: false,
      },
    ]);
    setShowSearch(false);
    setSearchQuery('');
    setSearchResults([]);
  }

  function removeExercise(tempId: string) {
    setExercises((prev) => prev.filter((e) => e.tempId !== tempId));
  }

  function toggleCollapse(tempId: string) {
    setExercises((prev) =>
      prev.map((e) => (e.tempId === tempId ? { ...e, collapsed: !e.collapsed } : e)),
    );
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
      entry.saved = false;
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
      entry.saved = false;
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
      entry.saved = false;
      updated[exerciseIndex] = entry;
      return updated;
    });
  }

  async function saveWorkout() {
    if (exercises.length === 0) return;
    setSaving(true);
    try {
      const payload = {
        sessionInstanceId,
        exercises: exercises.map((entry, idx) => ({
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
      };
      const res = await fetch('/api/trainer/workouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setExercises((prev) => prev.map((e) => ({ ...e, saved: true })));
        toast.success('Workout saved');
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to save workout');
      }
    } finally {
      setSaving(false);
    }
  }

  const hasUnsaved = exercises.some((e) => !e.saved);

  return (
    <div className="space-y-3">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Workout Log
          </span>
          {exercises.length > 0 && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
              {exercises.length}
            </span>
          )}
        </div>
        <button
          onClick={() => setShowSearch((v) => !v)}
          className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Exercise
        </button>
      </div>

      {/* ── Exercise search panel ── */}
      {showSearch && (
        <div className="rounded-2xl border bg-card shadow-sm">
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
            <div className="max-h-60 overflow-y-auto divide-y divide-border/50">
              {searchResults.map((ex) => {
                const cfg = TYPE_CONFIG[ex.exerciseType];
                const Icon = cfg.icon;
                return (
                  <button
                    key={ex.id}
                    onClick={() => addExercise(ex)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
                  >
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${cfg.bg}`}
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
            <p className="px-4 py-5 text-center text-sm text-muted-foreground">
              No exercises found
            </p>
          ) : (
            <p className="px-4 py-5 text-center text-sm text-muted-foreground">
              Start typing to search…
            </p>
          )}
        </div>
      )}

      {/* ── Empty state ── */}
      {exercises.length === 0 && !showSearch && (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border/50 py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <Dumbbell className="h-7 w-7 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium">No exercises yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Add exercises to start logging this session
            </p>
          </div>
          <button
            onClick={() => setShowSearch(true)}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Add First Exercise
          </button>
        </div>
      )}

      {/* ── Exercise cards ── */}
      {exercises.map((entry, exIdx) => {
        const cfg = TYPE_CONFIG[entry.exerciseType] ?? TYPE_CONFIG.WEIGHTED;
        const Icon = cfg.icon;
        const cols = TYPE_COLS[entry.exerciseType] ?? TYPE_COLS.WEIGHTED;

        return (
          <div
            key={entry.tempId}
            className="overflow-hidden rounded-2xl border bg-card shadow-sm"
            style={{ borderLeftWidth: 3, borderLeftColor: cfg.accent }}
          >
            {/* Card header */}
            <div className="flex items-center gap-3 px-4 py-3">
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${cfg.bg}`}
              >
                <Icon className={`h-4 w-4 ${cfg.text}`} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{entry.exerciseName}</p>
                <p className="text-xs text-muted-foreground">{entry.targetMuscle}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${cfg.bg} ${cfg.text}`}
                >
                  {entry.sets.length} set{entry.sets.length !== 1 ? 's' : ''}
                </span>
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
                    className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                    title="View progress"
                  >
                    <TrendingUp className="h-4 w-4" />
                  </button>
                )}
                <button
                  onClick={() => toggleCollapse(entry.tempId)}
                  className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {entry.collapsed ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronUp className="h-4 w-4" />
                  )}
                </button>
                <button
                  onClick={() => removeExercise(entry.tempId)}
                  className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Set table (collapsible) */}
            {!entry.collapsed && (
              <div className="border-t px-4 pb-3 pt-2">
                {/* Column header row */}
                <div className={`mb-2 grid items-center gap-2 ${getGridClass(cols.length)}`}>
                  <span className="text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Set
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
                <div className="space-y-1.5">
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
                          placeholder="—"
                          step={col.step}
                          min={col.min}
                          max={col.max}
                          className="h-10 rounded-xl text-center text-sm font-medium tabular-nums"
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
                        className="flex items-center justify-center rounded-xl p-2 text-muted-foreground/50 transition-colors hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-30"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Add Set */}
                <button
                  onClick={() => addSet(exIdx)}
                  className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border/60 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-border hover:text-foreground"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Set
                </button>
              </div>
            )}
          </div>
        );
      })}

      {/* ── Bottom save bar (when unsaved changes) ── */}
      {hasUnsaved && exercises.length > 0 && (
        <div className="sticky bottom-0 -mx-4 border-t bg-background/95 px-4 py-3 backdrop-blur">
          <Button className="w-full gap-2" onClick={saveWorkout} disabled={saving}>
            {saving ? (
              'Saving…'
            ) : (
              <>
                <Check className="h-4 w-4" /> Save Workout
              </>
            )}
          </Button>
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
