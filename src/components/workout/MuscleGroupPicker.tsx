'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Check, ChevronRight, Dumbbell, Search, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  CURATED_MUSCLE_GROUPS,
  type CuratedMuscleGroup,
  type CuratedMuscleGroupId,
} from '@/lib/muscle-groups';

// Per-group accent — matches the visual language of the existing exercise
// type pills (bg-{color}-500/10 + text-{color}-500). Keeping these literal so
// Tailwind's JIT can see them.
export const GROUP_THEME: Record<CuratedMuscleGroupId, { bg: string; text: string; ring: string }> =
  {
    chest: {
      bg: 'bg-rose-500/10',
      text: 'text-rose-400',
      ring: 'ring-rose-500/40 bg-rose-500/15',
    },
    back: {
      bg: 'bg-sky-500/10',
      text: 'text-sky-400',
      ring: 'ring-sky-500/40 bg-sky-500/15',
    },
    shoulders: {
      bg: 'bg-amber-500/10',
      text: 'text-amber-400',
      ring: 'ring-amber-500/40 bg-amber-500/15',
    },
    biceps: {
      bg: 'bg-violet-500/10',
      text: 'text-violet-400',
      ring: 'ring-violet-500/40 bg-violet-500/15',
    },
    triceps: {
      bg: 'bg-indigo-500/10',
      text: 'text-indigo-400',
      ring: 'ring-indigo-500/40 bg-indigo-500/15',
    },
    legs: {
      bg: 'bg-emerald-500/10',
      text: 'text-emerald-400',
      ring: 'ring-emerald-500/40 bg-emerald-500/15',
    },
    core: {
      bg: 'bg-orange-500/10',
      text: 'text-orange-400',
      ring: 'ring-orange-500/40 bg-orange-500/15',
    },
    fullbody: {
      bg: 'bg-fuchsia-500/10',
      text: 'text-fuchsia-400',
      ring: 'ring-fuchsia-500/40 bg-fuchsia-500/15',
    },
  };

type ExerciseType = 'WEIGHTED' | 'BODYWEIGHT' | 'DURATION' | 'CARDIO';
type SecondaryMetric = 'KM' | 'STEPS' | 'METERS' | 'NONE';

interface LastSet {
  setNumber: number;
  reps: number | null;
  weightKg: number | null;
  durationSec: number | null;
  rpe: number | null;
  performedAt: string;
}

interface ExerciseSuggestion {
  exerciseId: string;
  name: string;
  targetMuscleGroup: string;
  category: string;
  exerciseType: ExerciseType;
  secondaryMetric: SecondaryMetric;
  lastSet: LastSet | null;
  sessionCount: number;
}

interface GroupBucket {
  groupId: CuratedMuscleGroupId;
  label: string;
  exercises: ExerciseSuggestion[];
  /** Pre-filter count from the server. When `exercises.length === 0` but
   *  `originalCount > 0`, every suggestion was filtered out by
   *  `excludeExerciseIds` (already in workout) — used to show "all added"
   *  instead of "no history". */
  originalCount: number;
}

export interface PickedExercise {
  exerciseId: string;
  name: string;
  targetMuscleGroup: string;
  category: string;
  exerciseType: ExerciseType;
  secondaryMetric: SecondaryMetric;
  lastSet: LastSet | null;
}

interface MuscleGroupPickerProps {
  clientProfileId: string;
  /** When true, renders an X close button (mid-session "add more" flow). */
  allowCancel: boolean;
  onCancel?: () => void;
  onAdd: (exercises: PickedExercise[]) => void;
  /** Pre-select these groups on mount. Combined with `autoAdvance`, drives the
   *  "Suggestions" entry point that skips the muscle-group selection step. */
  initialGroupIds?: CuratedMuscleGroupId[];
  /** When true with `initialGroupIds`, fetch immediately and land on step 2.
   *  The user can still hit Back to filter the group selection. */
  autoAdvance?: boolean;
  /** Fires when the user explicitly clicks Continue in step 1 — used by the
   *  parent to track today's focus. Does NOT fire for `autoAdvance` fetches
   *  so opening "Suggestions" doesn't quietly add every group to the plan. */
  onGroupsPicked?: (ids: CuratedMuscleGroupId[]) => void;
  /** 'inline' renders the picker as a card in the page flow (used for the
   *  empty-state "What are we training?" prompt). 'sheet' renders a bottom
   *  modal with backdrop + drag handle, matching the Exercise Progress
   *  drawer — preferred for mid-session "By Muscle" / "Suggestions" so the
   *  workout list stays put underneath. */
  presentation?: 'inline' | 'sheet';
  /** Exercise IDs already in the trainer's workout log — hidden from the
   *  suggestion list so the trainer doesn't see Bench Press recommended again
   *  after just adding it. Empty/omitted means show everything. */
  excludeExerciseIds?: string[];
  /** Current session being logged — when set, its own logs are excluded from
   *  the muscle-group recency hint so a half-logged "chest" session doesn't
   *  read as "today" while the trainer is still picking groups. */
  sessionInstanceId?: string;
  /** When set, the "no history yet for these groups" empty state renders a
   *  CTA that calls this — used by the cold-start flow so a brand-new client
   *  isn't trapped in a picker with no suggestions. The currently picked
   *  groups are forwarded so the search modal can pre-seed its filter chips
   *  and the trainer doesn't have to re-tap "Chest". */
  onRequestSearch?: (groupIds: CuratedMuscleGroupId[]) => void;
  /** Commit focus groups only — Continue fires `onGroupsPicked` and nothing
   *  else: no suggestions fetch, no suggested-exercise step. The parent
   *  decides what happens next (unmount the picker, close the sheet).
   *  Exercises are then added from scratch via the catalog search. */
  groupsOnly?: boolean;
}

export function MuscleGroupPicker({
  clientProfileId,
  allowCancel,
  onCancel,
  onAdd,
  initialGroupIds,
  autoAdvance,
  onGroupsPicked,
  presentation = 'inline',
  excludeExerciseIds,
  sessionInstanceId,
  onRequestSearch,
  groupsOnly,
}: MuscleGroupPickerProps) {
  const [step, setStep] = useState<'groups' | 'exercises'>('groups');
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<CuratedMuscleGroupId>>(
    () => new Set(initialGroupIds ?? []),
  );
  const [buckets, setBuckets] = useState<GroupBucket[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedExerciseIds, setSelectedExerciseIds] = useState<Set<string>>(new Set());
  const autoAdvanceRan = useRef(false);
  // Per-group last-trained timestamps. Fetched once when the groups step is
  // visible so each card can show "3d ago". `null` value = never trained;
  // missing key (before fetch resolves) renders a faint shimmer.
  const [recencyByGroup, setRecencyByGroup] = useState<Map<CuratedMuscleGroupId, string | null>>(
    () => new Map(),
  );
  const [recencyLoading, setRecencyLoading] = useState(false);

  // Skip the fetch when autoAdvance is on — that flow lands the trainer
  // straight on step 2, so the recency hints would never be seen.
  useEffect(() => {
    if (autoAdvance) return;
    const ctrl = new AbortController();
    const url = sessionInstanceId
      ? `/api/trainer/clients/${clientProfileId}/muscle-group-recency?excludeSessionId=${encodeURIComponent(sessionInstanceId)}`
      : `/api/trainer/clients/${clientProfileId}/muscle-group-recency`;
    setRecencyLoading(true);
    fetch(url, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then(
        ({
          data,
        }: {
          data: Array<{ groupId: CuratedMuscleGroupId; lastTrainedAt: string | null }>;
        }) => {
          const next = new Map<CuratedMuscleGroupId, string | null>();
          for (const item of data ?? []) next.set(item.groupId, item.lastTrainedAt);
          setRecencyByGroup(next);
        },
      )
      .catch(() => {
        /* network/abort — leave the cards hint-less rather than blocking */
      })
      .finally(() => setRecencyLoading(false));
    return () => ctrl.abort();
  }, [clientProfileId, sessionInstanceId, autoAdvance]);

  function toggleGroup(id: CuratedMuscleGroupId) {
    setSelectedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function fetchSuggestions(idsOverride?: CuratedMuscleGroupId[]) {
    const ids = idsOverride ?? [...selectedGroupIds];
    if (ids.length === 0) return;
    setLoading(true);
    try {
      const groups = ids.join(',');
      const res = await fetch(
        `/api/trainer/clients/${clientProfileId}/recent-exercises-by-muscle?groups=${groups}&perGroup=5`,
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || 'Failed to load suggestions');
        return;
      }
      const { data } = (await res.json()) as { data: Omit<GroupBucket, 'originalCount'>[] };
      // Filter out exercises already in the workout, but remember the
      // pre-filter count so the bucket can show "all added" vs "no history".
      const excludeSet = new Set(excludeExerciseIds ?? []);
      const filtered: GroupBucket[] = data.map((b) => ({
        ...b,
        originalCount: b.exercises.length,
        exercises: b.exercises.filter((e) => !excludeSet.has(e.exerciseId)),
      }));
      setBuckets(filtered);
      setSelectedExerciseIds(new Set());
      setStep('exercises');
    } finally {
      setLoading(false);
    }
  }

  // Auto-advance to step 2 when the caller pre-supplies groups (Suggestions
  // entry point). Guarded with a ref so React Strict Mode's double-mount
  // doesn't double-fetch.
  useEffect(() => {
    if (!autoAdvance) return;
    if (autoAdvanceRan.current) return;
    if (!initialGroupIds || initialGroupIds.length === 0) return;
    autoAdvanceRan.current = true;
    void fetchSuggestions(initialGroupIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAdvance]);

  function toggleExercise(id: string) {
    setSelectedExerciseIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function commit() {
    const all = buckets.flatMap((b) => b.exercises);
    const picked = all.filter((e) => selectedExerciseIds.has(e.exerciseId));
    if (picked.length === 0) {
      toast.error('Pick at least one exercise');
      return;
    }
    onAdd(
      picked.map((e) => ({
        exerciseId: e.exerciseId,
        name: e.name,
        targetMuscleGroup: e.targetMuscleGroup,
        category: e.category,
        exerciseType: e.exerciseType,
        secondaryMetric: e.secondaryMetric,
        lastSet: e.lastSet,
      })),
    );
  }

  // While auto-advance is fetching, show a skeleton instead of step 1 — the
  // trainer asked for the suggestions list, not the muscle-group selector.
  const showAutoAdvanceSkeleton =
    autoAdvance && loading && step === 'groups' && (initialGroupIds?.length ?? 0) > 0;

  // In sheet mode the wrapper provides its own close X — suppress the
  // step's internal one so the trainer doesn't see two redundant buttons.
  const internalCancel = allowCancel && presentation !== 'sheet' ? onCancel : undefined;

  // Lock background scroll while the sheet is mounted so swiping the list
  // doesn't accidentally drag the workout log behind it.
  useEffect(() => {
    if (presentation !== 'sheet') return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [presentation]);

  const inner = showAutoAdvanceSkeleton ? (
    <SuggestionsSkeleton onCancel={internalCancel} />
  ) : step === 'groups' ? (
    <GroupsStep
      selected={selectedGroupIds}
      onToggle={toggleGroup}
      onCancel={internalCancel}
      onContinue={() => {
        const ids = [...selectedGroupIds];
        if (ids.length === 0) return;
        onGroupsPicked?.(ids);
        if (groupsOnly) return;
        void fetchSuggestions();
      }}
      loading={loading}
      recencyByGroup={recencyByGroup}
      recencyLoading={recencyLoading}
    />
  ) : (
    <ExercisesStep
      buckets={buckets}
      selected={selectedExerciseIds}
      onToggle={toggleExercise}
      onBack={() => setStep('groups')}
      onCommit={commit}
      onRequestSearch={onRequestSearch ? () => onRequestSearch([...selectedGroupIds]) : undefined}
    />
  );

  if (presentation === 'sheet') {
    // The OUTER motion.div doubles as the backdrop so AnimatePresence has a
    // single direct child to watch for exit. The inner motion.div slides
    // independently — both animations run in parallel and the parent's
    // 0.3s exit duration is long enough for the spring slide to settle.
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
        onClick={(e) => {
          if (e.target === e.currentTarget && allowCancel) onCancel?.();
        }}
      >
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 32, stiffness: 320, mass: 0.9 }}
          className="relative flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-3xl bg-card shadow-2xl pb-safe"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Drag handle */}
          <div className="flex shrink-0 justify-center pt-3 pb-1">
            <div className="h-1 w-10 rounded-full bg-border" />
          </div>
          {/* Sheet-level close — sits over the drag handle, top-right */}
          {allowCancel && (
            <button
              onClick={onCancel}
              aria-label="Close"
              className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto px-4 pb-5 pt-2">{inner}</div>
        </motion.div>
      </motion.div>
    );
  }

  return <div className="rounded-2xl border border-white/5 bg-card/60 p-4 shadow-sm">{inner}</div>;
}

function SuggestionsSkeleton({ onCancel }: { onCancel?: () => void }) {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1.5">
          <div className="h-2.5 w-32 animate-pulse rounded bg-muted" />
          <div className="h-4 w-44 animate-pulse rounded bg-muted" />
        </div>
        {onCancel && (
          <button
            onClick={onCancel}
            aria-label="Close picker"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-2">
            <div className="h-3 w-20 animate-pulse rounded bg-muted" />
            <div className="h-14 w-full animate-pulse rounded-2xl bg-muted/60" />
            <div className="h-14 w-full animate-pulse rounded-2xl bg-muted/60" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Step 1: pick muscle groups ──────────────────────────────────────────────

function GroupsStep({
  selected,
  onToggle,
  onCancel,
  onContinue,
  loading,
  recencyByGroup,
  recencyLoading,
}: {
  selected: Set<CuratedMuscleGroupId>;
  onToggle: (id: CuratedMuscleGroupId) => void;
  onCancel?: () => void;
  onContinue: () => void;
  loading: boolean;
  recencyByGroup: Map<CuratedMuscleGroupId, string | null>;
  recencyLoading: boolean;
}) {
  const count = selected.size;
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Today&rsquo;s focus
          </p>
          <p className="mt-0.5 text-base font-bold leading-tight">What are we training?</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Pick one or more muscle groups for this session.
          </p>
        </div>
        {onCancel && (
          <button
            onClick={onCancel}
            aria-label="Close picker"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {CURATED_MUSCLE_GROUPS.map((g) => {
          const isOn = selected.has(g.id);
          const theme = GROUP_THEME[g.id];
          const hasRecency = recencyByGroup.has(g.id);
          const lastTrainedAt = recencyByGroup.get(g.id) ?? null;
          // Recency line replaces the redundant "Selected" label (selection is
          // already conveyed by the ring + check). Shows "3d ago" / "today" /
          // "new" so the trainer can spot which muscle group is overdue.
          const recencyLabel = hasRecency
            ? lastTrainedAt
              ? formatAgo(lastTrainedAt)
              : 'new'
            : recencyLoading
              ? null
              : null;
          return (
            <button
              key={g.id}
              onClick={() => onToggle(g.id)}
              aria-pressed={isOn}
              className={`relative flex items-center gap-3 rounded-2xl px-3 py-3 text-left transition-all ${
                isOn
                  ? `ring-1 ${theme.ring}`
                  : 'bg-muted/30 ring-1 ring-border/40 hover:bg-muted/50'
              }`}
            >
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-black ${theme.bg} ${theme.text}`}
              >
                {initialOf(g)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold leading-tight">{g.label}</p>
                {recencyLabel ? (
                  <p
                    className={`mt-0.5 truncate text-[10px] font-medium ${
                      lastTrainedAt ? 'text-muted-foreground' : theme.text
                    }`}
                  >
                    {recencyLabel}
                  </p>
                ) : recencyLoading ? (
                  <span className="mt-1 block h-2 w-10 animate-pulse rounded bg-muted" />
                ) : null}
              </div>
              {isOn && (
                <div
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${theme.bg}`}
                >
                  <Check className={`h-3 w-3 ${theme.text}`} />
                </div>
              )}
            </button>
          );
        })}
      </div>

      <button
        onClick={onContinue}
        disabled={count === 0 || loading}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-semibold text-primary-foreground transition-opacity active:opacity-80 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {loading ? (
          <>
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
            Loading
          </>
        ) : (
          <>
            Continue
            {count > 0 && (
              <span className="rounded-full bg-primary-foreground/20 px-2 py-0.5 text-[10px] font-bold">
                {count}
              </span>
            )}
            <ChevronRight className="h-4 w-4" />
          </>
        )}
      </button>
    </div>
  );
}

function initialOf(g: CuratedMuscleGroup) {
  // First letter; for "Full Body" use "FB" so it doesn't collide with Forearms etc.
  if (g.id === 'fullbody') return 'FB';
  return g.label[0] ?? '';
}

// ─── Step 2: pick exercises ──────────────────────────────────────────────────

function ExercisesStep({
  buckets,
  selected,
  onToggle,
  onBack,
  onCommit,
  onRequestSearch,
}: {
  buckets: GroupBucket[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onBack: () => void;
  onCommit: () => void;
  onRequestSearch?: () => void;
}) {
  const totalAvailable = useMemo(
    () => buckets.reduce((sum, b) => sum + b.exercises.length, 0),
    [buckets],
  );
  // True when the client *does* have history for at least one of the picked
  // groups but every exercise was filtered out (already in the workout) —
  // drives a friendlier empty-state copy than "no history".
  const totalOriginal = useMemo(
    () => buckets.reduce((sum, b) => sum + b.originalCount, 0),
    [buckets],
  );
  const everythingAlreadyAdded = totalAvailable === 0 && totalOriginal > 0;
  const count = selected.size;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          aria-label="Back to muscle groups"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Suggested for this client
          </p>
          <p className="mt-0.5 text-sm font-bold leading-tight">Pick exercises to log</p>
        </div>
      </div>

      {totalAvailable === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border/40 bg-muted/20 px-6 py-10 text-center">
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-2xl ${everythingAlreadyAdded ? 'bg-emerald-500/15' : 'bg-muted'}`}
          >
            {everythingAlreadyAdded ? (
              <Check className="h-5 w-5 text-emerald-400" />
            ) : (
              <Dumbbell className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold">
              {everythingAlreadyAdded
                ? 'All suggestions already added'
                : 'No history yet for these groups'}
            </p>
            <p className="text-xs text-muted-foreground">
              {everythingAlreadyAdded
                ? 'Pick another muscle group or add a brand-new exercise from search.'
                : 'Go back and pick another group, or add an exercise manually from the search.'}
            </p>
          </div>
          {onRequestSearch && (
            <button
              onClick={onRequestSearch}
              className="mt-1 flex items-center gap-2 rounded-xl bg-primary/10 px-4 py-2 text-xs font-semibold text-primary transition-colors active:bg-primary/15"
            >
              <Search className="h-3.5 w-3.5" />
              Search exercise catalog
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          {buckets.map((b) => (
            <BucketSection key={b.groupId} bucket={b} selected={selected} onToggle={onToggle} />
          ))}
        </div>
      )}

      <button
        onClick={onCommit}
        disabled={count === 0}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-semibold text-primary-foreground transition-opacity active:opacity-80 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Add to workout
        {count > 0 && (
          <span className="rounded-full bg-primary-foreground/20 px-2 py-0.5 text-[10px] font-bold">
            {count}
          </span>
        )}
      </button>
    </div>
  );
}

function BucketSection({
  bucket,
  selected,
  onToggle,
}: {
  bucket: GroupBucket;
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  const theme = GROUP_THEME[bucket.groupId];
  // Distinguish "client has never done this group" from "all of their
  // history for this group is already in the workout" — the first means
  // the trainer should search manually, the second is a positive signal
  // ("you've covered everything we know for this muscle").
  const hadHistory = bucket.originalCount > 0;
  const allFiltered = hadHistory && bucket.exercises.length === 0;
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span
          className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${theme.bg} ${theme.text}`}
        >
          {bucket.label}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {bucket.exercises.length === 0
            ? allFiltered
              ? 'all added'
              : 'no history'
            : `${bucket.exercises.length} ${bucket.exercises.length === 1 ? 'option' : 'options'}`}
        </span>
      </div>
      {bucket.exercises.length === 0 ? (
        <div className="flex items-center gap-2 rounded-xl border border-dashed border-border/40 bg-muted/10 px-3 py-2.5">
          {allFiltered ? (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-400" />
              <p className="text-xs text-muted-foreground">
                All recent {bucket.label.toLowerCase()} exercises are already in this workout.
              </p>
            </>
          ) : (
            <>
              <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                New muscle group for this client — add manually.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {bucket.exercises.map((ex) => (
            <ExerciseRow
              key={ex.exerciseId}
              exercise={ex}
              isSelected={selected.has(ex.exerciseId)}
              onToggle={() => onToggle(ex.exerciseId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ExerciseRow({
  exercise,
  isSelected,
  onToggle,
}: {
  exercise: ExerciseSuggestion;
  isSelected: boolean;
  onToggle: () => void;
}) {
  const last = exercise.lastSet;
  const summary = formatLastSet(last, exercise.exerciseType);
  const ago = last ? formatAgo(last.performedAt) : null;

  return (
    <button
      onClick={onToggle}
      aria-pressed={isSelected}
      className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors ${
        isSelected
          ? 'bg-primary/10 ring-1 ring-primary/40'
          : 'bg-muted/30 ring-1 ring-border/40 active:bg-muted/60'
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold leading-tight">{exercise.name}</p>
        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {summary ? (
            <>
              <span className="font-mono font-semibold text-foreground/80 tabular-nums">
                {summary}
              </span>
              {ago && (
                <>
                  <span>·</span>
                  <span>{ago}</span>
                </>
              )}
            </>
          ) : (
            <span>No prior data</span>
          )}
        </div>
      </div>
      <div
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors ${
          isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
        }`}
      >
        <Check className="h-3.5 w-3.5" />
      </div>
    </button>
  );
}

// ─── Formatters ──────────────────────────────────────────────────────────────

function formatLastSet(s: LastSet | null, type: ExerciseType): string | null {
  if (!s) return null;
  if (type === 'WEIGHTED') {
    if (s.weightKg != null && s.reps != null) return `${trim(s.weightKg)}kg × ${s.reps}`;
    if (s.reps != null) return `${s.reps} reps`;
  } else if (type === 'BODYWEIGHT') {
    if (s.reps != null) return `${s.reps} reps`;
  } else if (type === 'DURATION') {
    if (s.durationSec != null) return `${s.durationSec}s`;
  } else if (type === 'CARDIO') {
    if (s.durationSec != null) return `${s.durationSec}s`;
  }
  return null;
}

function trim(n: number): string {
  return Number.isInteger(n) ? `${n}` : n.toFixed(1);
}

function formatAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const day = 24 * 60 * 60 * 1000;
  const days = Math.floor(ms / day);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}
