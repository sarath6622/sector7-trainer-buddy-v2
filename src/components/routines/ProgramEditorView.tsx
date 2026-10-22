'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ChevronDown,
  ClipboardList,
  Plus,
  Save,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useConfirm } from '@/hooks/use-confirm';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { routineProgramInputSchema } from '@/lib/validators';
import {
  SET_TYPE_LABEL,
  SET_TYPE_SHORT,
  summarizeExerciseTarget,
  type RoutineSetTarget,
  type RoutineSetType,
} from '@/lib/routine-format';
import { ExercisePickerSheet } from './ExercisePickerSheet';
import {
  DraftError,
  defaultDraftSets,
  draftFromProgram,
  draftToInput,
  emptyDraftRoutine,
  emptyProgramDraft,
  moveItem,
  newKey,
  nextDraftSet,
  parseRepsField,
  type DraftExercise,
  type DraftRoutine,
  type DraftSet,
  type ExerciseLite,
  type ProgramDetailDto,
  type ProgramDraft,
} from './program-draft';

const SET_TYPE_CYCLE: RoutineSetType[] = ['NORMAL', 'WARMUP', 'FAILURE', 'DROP'];

const SET_TYPE_STYLE: Record<RoutineSetType, string> = {
  NORMAL: 'bg-muted text-foreground',
  WARMUP: 'bg-amber-500/15 text-amber-500',
  FAILURE: 'bg-red-500/15 text-red-500',
  DROP: 'bg-violet-500/15 text-violet-400',
};

const inputClass = 'h-10 px-2 text-center text-base tabular-nums md:text-sm';

/** Draft set → target shape, for the live one-line summary on each exercise. */
function draftSetToTarget(s: DraftSet, idx: number): RoutineSetTarget {
  const reps = parseRepsField(s.reps);
  const num = (v: string) => (v.trim() === '' || Number.isNaN(Number(v)) ? null : Number(v));
  return {
    setNumber: idx + 1,
    setType: s.setType,
    targetRepsMin: reps?.min ?? null,
    targetRepsMax: reps?.max ?? null,
    targetWeightKg: num(s.weightKg),
    targetDurationSec: num(s.durationSec),
    targetStepsCount: num(s.stepsCount),
    targetDistance: num(s.distance),
  };
}

interface SetColumn {
  field: keyof Pick<DraftSet, 'reps' | 'weightKg' | 'durationSec' | 'stepsCount' | 'distance'>;
  label: string;
  placeholder: string;
  inputMode: 'numeric' | 'decimal' | 'text';
}

function setColumnsFor(exercise: ExerciseLite): SetColumn[] {
  switch (exercise.exerciseType) {
    case 'WEIGHTED':
      return [
        { field: 'reps', label: 'Reps', placeholder: '12-15', inputMode: 'text' },
        { field: 'weightKg', label: 'kg', placeholder: 'kg', inputMode: 'decimal' },
      ];
    case 'BODYWEIGHT':
      return [{ field: 'reps', label: 'Reps', placeholder: '15', inputMode: 'text' }];
    case 'DURATION':
      return [{ field: 'durationSec', label: 'sec', placeholder: '60', inputMode: 'numeric' }];
    case 'CARDIO': {
      const cols: SetColumn[] = [
        { field: 'durationSec', label: 'sec', placeholder: '600', inputMode: 'numeric' },
      ];
      if (exercise.secondaryMetric === 'STEPS') {
        cols.push({
          field: 'stepsCount',
          label: 'steps',
          placeholder: 'steps',
          inputMode: 'numeric',
        });
      } else if (exercise.secondaryMetric !== 'NONE') {
        cols.push({
          field: 'distance',
          label: exercise.secondaryMetric === 'METERS' ? 'm' : 'km',
          placeholder: exercise.secondaryMetric === 'METERS' ? 'm' : 'km',
          inputMode: 'decimal',
        });
      }
      return cols;
    }
  }
}

export function ProgramEditorView({
  programId,
  basePath,
}: {
  programId?: string;
  /** `/trainer/routines` or `/admin/routines` — where "new" redirects after create. */
  basePath: string;
}) {
  const router = useRouter();
  const { confirm, ConfirmDialog } = useConfirm();
  const [draft, setDraft] = useState<ProgramDraft>(emptyProgramDraft);
  const [program, setProgram] = useState<ProgramDetailDto | null>(null);
  const [loading, setLoading] = useState(!!programId);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [pickerRoutineKey, setPickerRoutineKey] = useState<string | null>(null);
  const [openExercises, setOpenExercises] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!programId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/routine-programs/${programId}`);
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setLoadError(json.error ?? 'Could not load program');
          return;
        }
        setProgram(json.data);
        setDraft(draftFromProgram(json.data));
      } catch {
        if (!cancelled) setLoadError('Could not load program');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [programId]);

  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const update = useCallback((fn: (d: ProgramDraft) => ProgramDraft) => {
    setDraft((d) => fn(d));
    setDirty(true);
  }, []);

  const updateRoutine = useCallback(
    (key: string, fn: (r: DraftRoutine) => DraftRoutine) =>
      update((d) => ({ ...d, routines: d.routines.map((r) => (r.key === key ? fn(r) : r)) })),
    [update],
  );

  const updateExercise = useCallback(
    (routineKey: string, exKey: string, fn: (e: DraftExercise) => DraftExercise) =>
      updateRoutine(routineKey, (r) => ({
        ...r,
        exercises: r.exercises.map((e) => (e.key === exKey ? fn(e) : e)),
      })),
    [updateRoutine],
  );

  const pickerRoutine = draft.routines.find((r) => r.key === pickerRoutineKey);
  const pickerExistingIds = useMemo(
    () => new Set(pickerRoutine?.exercises.map((e) => e.exercise.id) ?? []),
    [pickerRoutine],
  );

  function addExercises(routineKey: string, picked: ExerciseLite[]) {
    const additions: DraftExercise[] = picked.map((exercise) => ({
      key: newKey('ex'),
      exercise,
      restSec: '',
      notes: '',
      sets: defaultDraftSets(exercise.exerciseType),
    }));
    updateRoutine(routineKey, (r) => ({ ...r, exercises: [...r.exercises, ...additions] }));
    setOpenExercises((prev) => {
      const next = new Set(prev);
      const last = additions[additions.length - 1];
      if (last) next.add(last.key);
      return next;
    });
  }

  async function removeRoutine(routine: DraftRoutine) {
    if (draft.routines.length <= 1) {
      toast('A program needs at least one routine');
      return;
    }
    if (routine.exercises.length > 0) {
      const ok = await confirm({
        title: `Delete ${routine.name || 'this routine'}?`,
        description: `Its ${routine.exercises.length} exercises are removed from the program when you save. Past sessions keep their logs.`,
        confirmText: 'Delete',
        variant: 'destructive',
      });
      if (!ok) return;
    }
    update((d) => ({ ...d, routines: d.routines.filter((r) => r.key !== routine.key) }));
  }

  async function save() {
    let input;
    try {
      input = draftToInput(draft);
    } catch (err) {
      toast.error(err instanceof DraftError ? err.message : 'Check the highlighted fields');
      return;
    }
    const parsed = routineProgramInputSchema.safeParse(input);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const where = issue?.path ?? [];
      const routineIdx = where[0] === 'routines' && typeof where[1] === 'number' ? where[1] : null;
      const routineName = routineIdx !== null ? draft.routines[routineIdx]?.name : null;
      toast.error(
        routineName ? `${routineName}: ${issue?.message}` : (issue?.message ?? 'Invalid'),
      );
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(
        programId ? `/api/routine-programs/${programId}` : '/api/routine-programs',
        {
          method: programId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(parsed.data),
        },
      );
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? 'Could not save program');
        return;
      }
      setDirty(false);
      toast.success('Program saved');
      if (!programId) {
        router.replace(`${basePath}/${json.data.id}`);
        return;
      }
      setProgram(json.data);
      setDraft(draftFromProgram(json.data));
    } catch {
      toast.error('Could not save. Check your connection.');
    } finally {
      setSaving(false);
    }
  }

  async function goBack() {
    if (dirty) {
      const ok = await confirm({
        title: 'Discard changes?',
        description: 'You have unsaved changes to this program.',
        confirmText: 'Discard',
        variant: 'destructive',
      });
      if (!ok) return;
    }
    if (window.history.length > 1) router.back();
    else router.push(basePath);
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl space-y-3">
        <Skeleton className="h-12 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-2xl rounded-2xl border border-dashed border-border/50 p-8 text-center">
        <p className="text-sm font-semibold">{loadError}</p>
        <button onClick={() => router.push(basePath)} className="mt-3 text-sm text-primary">
          Back to routines
        </button>
      </div>
    );
  }

  const isClientCopy = !!program?.clientProfileId;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {ConfirmDialog}

      {/* Header */}
      <div className="flex items-center gap-2">
        <button
          onClick={goBack}
          aria-label="Back"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground active:bg-muted"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold tracking-tight">
            {programId ? 'Edit program' : 'New program'}
          </h1>
          <p className="text-xs text-muted-foreground">
            {draft.routines.length} {draft.routines.length === 1 ? 'routine' : 'routines'} · rotates
            in order
          </p>
        </div>
      </div>

      {isClientCopy && (
        <div className="flex items-start gap-2.5 rounded-2xl border border-sky-500/25 bg-sky-500/5 px-3.5 py-3">
          <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />
          <p className="text-xs leading-relaxed text-sky-200/90">
            You&rsquo;re editing <span className="font-semibold">this client&rsquo;s copy</span>.
            The library template and other clients are not affected.
          </p>
        </div>
      )}

      {/* Program fields */}
      <div className="space-y-2 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3.5">
        <label className="block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
          Program name
        </label>
        <Input
          value={draft.name}
          onChange={(e) => update((d) => ({ ...d, name: e.target.value }))}
          placeholder="e.g. Push / Pull / Legs"
          className="h-11 text-base md:text-sm"
          maxLength={80}
        />
        <Textarea
          value={draft.notes}
          onChange={(e) => update((d) => ({ ...d, notes: e.target.value }))}
          placeholder="Program notes for the client (optional): goals, how often, how to progress"
          className="min-h-16 text-base md:text-sm"
          maxLength={2000}
        />
      </div>

      {/* Routines */}
      {draft.routines.map((routine, rIdx) => (
        <section
          key={routine.key}
          className="overflow-hidden rounded-2xl border border-white/[0.08] bg-card"
        >
          <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-xs font-bold text-primary">
              {rIdx + 1}
            </span>
            <Input
              value={routine.name}
              onChange={(e) => updateRoutine(routine.key, (r) => ({ ...r, name: e.target.value }))}
              placeholder="Routine name"
              className="h-10 flex-1 border-transparent bg-transparent px-1.5 text-base font-semibold md:text-sm"
              maxLength={80}
            />
            <button
              aria-label="Move routine up"
              disabled={rIdx === 0}
              onClick={() => update((d) => ({ ...d, routines: moveItem(d.routines, rIdx, -1) }))}
              className="flex h-10 w-9 items-center justify-center rounded-lg text-muted-foreground active:bg-muted disabled:opacity-25"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
            <button
              aria-label="Move routine down"
              disabled={rIdx === draft.routines.length - 1}
              onClick={() => update((d) => ({ ...d, routines: moveItem(d.routines, rIdx, 1) }))}
              className="flex h-10 w-9 items-center justify-center rounded-lg text-muted-foreground active:bg-muted disabled:opacity-25"
            >
              <ArrowDown className="h-4 w-4" />
            </button>
            <button
              aria-label="Delete routine"
              onClick={() => void removeRoutine(routine)}
              className="flex h-10 w-9 items-center justify-center rounded-lg text-red-500/70 active:bg-red-500/10"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-2 p-3">
            <Input
              value={routine.notes}
              onChange={(e) => updateRoutine(routine.key, (r) => ({ ...r, notes: e.target.value }))}
              placeholder="Routine note (optional)"
              className="h-10 text-base md:text-sm"
              maxLength={1000}
            />

            {routine.exercises.length === 0 && (
              <p className="rounded-xl border border-dashed border-border/40 px-3 py-5 text-center text-xs text-muted-foreground">
                No exercises yet
              </p>
            )}

            {routine.exercises.map((ex, exIdx) => (
              <ExerciseEditor
                key={ex.key}
                exercise={ex}
                index={exIdx}
                count={routine.exercises.length}
                open={openExercises.has(ex.key)}
                onToggle={() =>
                  setOpenExercises((prev) => {
                    const next = new Set(prev);
                    if (next.has(ex.key)) next.delete(ex.key);
                    else next.add(ex.key);
                    return next;
                  })
                }
                onChange={(fn) => updateExercise(routine.key, ex.key, fn)}
                onMove={(delta) =>
                  updateRoutine(routine.key, (r) => ({
                    ...r,
                    exercises: moveItem(r.exercises, exIdx, delta),
                  }))
                }
                onRemove={() =>
                  updateRoutine(routine.key, (r) => ({
                    ...r,
                    exercises: r.exercises.filter((e) => e.key !== ex.key),
                  }))
                }
              />
            ))}

            <button
              onClick={() => setPickerRoutineKey(routine.key)}
              className="flex h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border/50 text-xs font-semibold text-muted-foreground active:bg-muted/40"
            >
              <Plus className="h-3.5 w-3.5" />
              Add exercises
            </button>
          </div>
        </section>
      ))}

      <button
        onClick={() =>
          update((d) => ({ ...d, routines: [...d.routines, emptyDraftRoutine(d.routines.length)] }))
        }
        disabled={draft.routines.length >= 14}
        className="flex h-12 w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-primary/40 text-sm font-semibold text-primary active:bg-primary/10 disabled:opacity-40"
      >
        <ClipboardList className="h-4 w-4" />
        Add routine
      </button>

      {/* Sticky inside the page's scroll container (not `fixed`), so on phones it
          sits above the role tab bar instead of covering it. */}
      <div className="sticky bottom-0 z-30 -mx-4 border-t border-white/10 bg-background/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {dirty ? 'Unsaved changes' : programId ? 'All changes saved' : 'Not saved yet'}
          </p>
          <button
            onClick={() => void save()}
            disabled={saving || (!dirty && !!programId)}
            className="flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-40"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Saving…' : 'Save program'}
          </button>
        </div>
      </div>

      <ExercisePickerSheet
        open={pickerRoutineKey !== null}
        onOpenChange={(o) => {
          if (!o) setPickerRoutineKey(null);
        }}
        existingIds={pickerExistingIds}
        onAdd={(picked) => {
          if (pickerRoutineKey) addExercises(pickerRoutineKey, picked);
        }}
      />
    </div>
  );
}

function ExerciseEditor({
  exercise,
  index,
  count,
  open,
  onToggle,
  onChange,
  onMove,
  onRemove,
}: {
  exercise: DraftExercise;
  index: number;
  count: number;
  open: boolean;
  onToggle: () => void;
  onChange: (fn: (e: DraftExercise) => DraftExercise) => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
}) {
  const cols = setColumnsFor(exercise.exercise);
  const summary = summarizeExerciseTarget(
    exercise.sets.map(draftSetToTarget),
    exercise.exercise.exerciseType,
    exercise.exercise.secondaryMetric,
  );
  const gridCols =
    cols.length === 2 ? 'grid-cols-[2.5rem_1fr_1fr_2.5rem]' : 'grid-cols-[2.5rem_1fr_2.5rem]';

  function setField(setKey: string, field: SetColumn['field'], value: string) {
    onChange((e) => ({
      ...e,
      sets: e.sets.map((s) => (s.key === setKey ? { ...s, [field]: value } : s)),
    }));
  }

  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02]">
      <div className="flex items-center gap-1 pl-3 pr-1">
        <button
          onClick={onToggle}
          className="flex min-h-12 min-w-0 flex-1 items-center gap-2 py-2 text-left"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{exercise.exercise.name}</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {exercise.exercise.targetMuscleGroup} · {summary}
              {exercise.restSec.trim() !== '' ? ` · rest ${exercise.restSec}s` : ''}
            </p>
          </div>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </button>
        <button
          aria-label="Move exercise up"
          disabled={index === 0}
          onClick={() => onMove(-1)}
          className="flex h-10 w-8 items-center justify-center rounded-lg text-muted-foreground active:bg-muted disabled:opacity-25"
        >
          <ArrowUp className="h-3.5 w-3.5" />
        </button>
        <button
          aria-label="Move exercise down"
          disabled={index === count - 1}
          onClick={() => onMove(1)}
          className="flex h-10 w-8 items-center justify-center rounded-lg text-muted-foreground active:bg-muted disabled:opacity-25"
        >
          <ArrowDown className="h-3.5 w-3.5" />
        </button>
        <button
          aria-label="Remove exercise"
          onClick={onRemove}
          className="flex h-10 w-8 items-center justify-center rounded-lg text-red-500/70 active:bg-red-500/10"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {open && (
        <div className="space-y-2 border-t border-white/[0.06] px-3 pb-3 pt-2.5">
          <div className={`grid items-center gap-2 ${gridCols}`}>
            <span className="text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Set
            </span>
            {cols.map((c) => (
              <span
                key={c.field}
                className="text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
              >
                {c.label}
              </span>
            ))}
            <span />
          </div>

          {exercise.sets.map((s, sIdx) => (
            <div key={s.key} className={`grid items-center gap-2 ${gridCols}`}>
              <button
                onClick={() =>
                  onChange((e) => ({
                    ...e,
                    sets: e.sets.map((x) =>
                      x.key === s.key
                        ? {
                            ...x,
                            setType:
                              SET_TYPE_CYCLE[
                                (SET_TYPE_CYCLE.indexOf(x.setType) + 1) % SET_TYPE_CYCLE.length
                              ] ?? 'NORMAL',
                          }
                        : x,
                    ),
                  }))
                }
                aria-label={`Set ${sIdx + 1}: ${SET_TYPE_LABEL[s.setType]}. Tap to change type`}
                title={SET_TYPE_LABEL[s.setType]}
                className={`flex h-10 w-10 items-center justify-center rounded-full text-xs font-bold ${SET_TYPE_STYLE[s.setType]}`}
              >
                {SET_TYPE_SHORT[s.setType] ?? sIdx + 1}
              </button>
              {cols.map((c) => (
                <Input
                  key={c.field}
                  value={s[c.field]}
                  inputMode={c.inputMode}
                  placeholder={c.placeholder}
                  onChange={(e) => setField(s.key, c.field, e.target.value)}
                  className={inputClass}
                  aria-label={`Set ${sIdx + 1} ${c.label}`}
                />
              ))}
              <button
                aria-label={`Remove set ${sIdx + 1}`}
                disabled={exercise.sets.length <= 1}
                onClick={() =>
                  onChange((e) => ({ ...e, sets: e.sets.filter((x) => x.key !== s.key) }))
                }
                className="flex h-10 w-10 items-center justify-center rounded-xl text-red-500/70 active:bg-red-500/10 disabled:opacity-20"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}

          <button
            disabled={exercise.sets.length >= 10}
            onClick={() =>
              onChange((e) => ({
                ...e,
                sets: [...e.sets, nextDraftSet(e.sets[e.sets.length - 1])],
              }))
            }
            className="flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border/50 text-xs font-semibold text-muted-foreground active:bg-muted/40 disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" />
            Add set
          </button>

          <p className="text-[10px] text-muted-foreground">
            Tap a set number to mark it warm-up (W), to failure (F) or drop set (D). Reps take a
            range like 8-12. Leave kg empty to let the client&rsquo;s last session guide it.
          </p>

          <div className="grid grid-cols-[6.5rem_1fr] gap-2">
            <Input
              value={exercise.restSec}
              inputMode="numeric"
              placeholder="Rest sec"
              onChange={(e) => onChange((x) => ({ ...x, restSec: e.target.value }))}
              className="h-10 text-base md:text-sm"
              aria-label="Rest between sets, seconds"
            />
            <Input
              value={exercise.notes}
              placeholder="Coaching cue (optional)"
              onChange={(e) => onChange((x) => ({ ...x, notes: e.target.value }))}
              className="h-10 text-base md:text-sm"
              maxLength={500}
            />
          </div>
        </div>
      )}
    </div>
  );
}
