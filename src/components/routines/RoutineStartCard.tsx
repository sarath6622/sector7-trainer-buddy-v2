'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ClipboardCheck, Play, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatRest, summarizeExerciseTarget } from '@/lib/routine-format';
import { RoutineSheet } from './RoutineSheet';
import type {
  ClientProgramDto,
  ProgramDetailDto,
  ProgramSummaryDto,
  RoutineDetailDto,
} from './program-draft';

/**
 * Where the routine comes from:
 *  - `client`: the client's assigned program; "Next up" by rotation.
 *  - `library`: the client has no program yet, so the branch library is
 *    offered here instead of making the trainer detour to the client page.
 *    Starting a library routine assigns that program (a per-client copy)
 *    and applies the routine in one go.
 */
type RoutineSource =
  | { kind: 'client'; program: ClientProgramDto }
  | { kind: 'library'; programs: ProgramDetailDto[] };

const MAX_LIBRARY_PROGRAMS = 6;

async function loadSource(clientProfileId: string): Promise<RoutineSource | null> {
  const own = await fetch(`/api/routine-programs/clients/${clientProfileId}`);
  if (own.ok) {
    const program = (await own.json()).data as ClientProgramDto | null;
    if (program && program.routines.length > 0) return { kind: 'client', program };
  }
  const list = await fetch('/api/routine-programs');
  if (!list.ok) return null;
  const summaries = ((await list.json()).data as ProgramSummaryDto[]).slice(
    0,
    MAX_LIBRARY_PROGRAMS,
  );
  const details = await Promise.all(
    summaries.map(async (s) => {
      const res = await fetch(`/api/routine-programs/${s.id}`);
      return res.ok ? ((await res.json()).data as ProgramDetailDto) : null;
    }),
  );
  const programs = details.filter(
    (p): p is ProgramDetailDto => p !== null && p.routines.length > 0,
  );
  return programs.length > 0 ? { kind: 'library', programs } : null;
}

/**
 * "Start routine" inside the trainer's session logger (ADR-053). Shows the
 * chosen routine's exercises with their targets so the trainer can see what
 * the session holds before starting it; day chips switch routine. Applying
 * is server-side — it links the routine and adds its exercises as zero-set
 * logs — then `onApplied` makes the page refetch. Renders nothing when there
 * is neither a client program nor anything in the library.
 *
 * `compact`: a one-line strip (exercises already logged) that opens the same
 * picker in a sheet.
 */
export function RoutineStartCard({
  clientProfileId,
  clientName,
  sessionInstanceId,
  disabled,
  compact = false,
  onApplied,
}: {
  clientProfileId: string;
  clientName?: string;
  sessionInstanceId: string;
  /** True while the logger has unsaved edits — applying waits for the save. */
  disabled?: boolean;
  compact?: boolean;
  onApplied: () => void;
}) {
  const [source, setSource] = useState<RoutineSource | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const loaded = await loadSource(clientProfileId);
        if (!cancelled) setSource(loaded);
      } catch {
        // Offline: no routine card; the manual logging path is unaffected.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientProfileId]);

  if (!source) return null;

  const picker = (
    <RoutinePicker
      source={source}
      clientProfileId={clientProfileId}
      clientName={clientName}
      sessionInstanceId={sessionInstanceId}
      disabled={disabled}
      bleed={!compact}
      onApplied={() => {
        setSheetOpen(false);
        onApplied();
      }}
    />
  );

  if (compact) {
    const label =
      source.kind === 'client'
        ? (source.program.routines.find((r) => r.id === source.program.nextRoutineId)?.name ??
          source.program.routines[0]?.name)
        : null;
    return (
      <>
        <div className="flex items-center gap-2 rounded-xl border border-primary/25 bg-primary/[0.05] px-3 py-2">
          <ClipboardCheck className="h-4 w-4 shrink-0 text-primary" />
          <p className="min-w-0 flex-1 truncate text-xs">
            {label ? (
              <>
                <span className="text-muted-foreground">Next up:</span>{' '}
                <span className="font-semibold">{label}</span>
              </>
            ) : (
              <span className="text-muted-foreground">Follow a routine for this session</span>
            )}
          </p>
          <button
            onClick={() => setSheetOpen(true)}
            className="flex h-9 shrink-0 items-center rounded-lg px-3 text-xs font-semibold text-primary active:bg-primary/10"
          >
            Add routine
          </button>
        </div>
        <RoutineSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          title="Add a routine"
          subtitle="Its exercises are added after what's already logged"
          icon={<ClipboardCheck className="h-4 w-4 text-primary" />}
        >
          <div className="p-3">{picker}</div>
        </RoutineSheet>
      </>
    );
  }

  return picker;
}

function RoutinePicker({
  source,
  clientProfileId,
  clientName,
  sessionInstanceId,
  disabled,
  bleed,
  currentRoutineId = null,
  onApplied,
}: {
  source: RoutineSource;
  clientProfileId: string;
  clientName?: string;
  sessionInstanceId: string;
  disabled?: boolean;
  /** Inline in the logger: full-width panel like the exercise cards. In a sheet: plain. */
  bleed: boolean;
  /** Set when the session already follows a routine — the picker then switches. */
  currentRoutineId?: string | null;
  onApplied: () => void;
}) {
  const programs = source.kind === 'client' ? [source.program] : source.programs;
  const [programId, setProgramId] = useState(programs[0]?.id ?? '');
  const program = programs.find((p) => p.id === programId) ?? programs[0];
  const nextRoutineId = source.kind === 'client' ? source.program.nextRoutineId : null;

  const [routineId, setRoutineId] = useState<string | null>(
    currentRoutineId ?? nextRoutineId ?? program?.routines[0]?.id ?? null,
  );
  const routine = useMemo(
    () => program?.routines.find((r) => r.id === routineId) ?? program?.routines[0],
    [program, routineId],
  );
  const [applying, setApplying] = useState(false);

  if (!program || !routine) return null;

  async function start(target: RoutineDetailDto) {
    if (disabled) {
      toast('Saving your changes. Try again in a second.');
      return;
    }
    setApplying(true);
    try {
      let routineIdToApply = target.id;

      // Library routine: first give the client their own copy of the program,
      // then apply the matching routine from that copy (same position).
      if (source.kind === 'library' && program) {
        const assignRes = await fetch(`/api/routine-programs/${program.id}/assign`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientProfileId }),
        });
        const assignJson = await assignRes.json();
        if (!assignRes.ok) {
          toast.error(assignJson.error ?? 'Could not assign program');
          return;
        }
        const copy = assignJson.data as ProgramDetailDto;
        const match = copy.routines.find((r) => r.orderIndex === target.orderIndex);
        if (!match) {
          toast.error('Could not find that routine in the new program');
          return;
        }
        routineIdToApply = match.id;
      }

      const res = await fetch(`/api/sessions/${sessionInstanceId}/routine`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routineId: routineIdToApply }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? 'Could not start routine');
        return;
      }
      const added = json.data.addedExerciseIds.length as number;
      toast.success(
        currentRoutineId
          ? `Switched to ${target.name}`
          : added > 0
            ? `${target.name} started: ${added} ${added === 1 ? 'exercise' : 'exercises'} added`
            : `${target.name} linked. Its exercises were already in the log`,
      );
      onApplied();
    } catch {
      toast.error('Could not start routine. Check your connection.');
    } finally {
      setApplying(false);
    }
  }

  const isNext = routine.id === nextRoutineId;

  // Neutral panel, same language as the exercise cards (full-bleed, hairline
  // edges, no tint). The Start button is the only accent on it.
  return (
    <div
      className={
        bleed ? '-mx-4 space-y-4 border-y border-white/[0.06] bg-card px-4 py-5' : 'space-y-4'
      }
    >
      <div className="min-w-0">
        <p className="truncate text-[11px] font-medium uppercase tracking-widest text-muted-foreground/70">
          {program.name}
          {isNext ? ' · Next in rotation' : ''}
        </p>
        <h3 className="mt-1 truncate text-2xl font-bold tracking-tight">{routine.name}</h3>
        {source.kind === 'library' && (
          <p className="mt-1 text-xs text-muted-foreground">
            No program yet. Starting assigns it to {clientName ?? 'this client'}.
          </p>
        )}
      </div>

      {/* Program switcher — library mode with more than one program */}
      {programs.length > 1 && (
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1" style={{ scrollbarWidth: 'none' }}>
          {programs.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                setProgramId(p.id);
                setRoutineId(p.routines[0]?.id ?? null);
              }}
              className={`h-8 shrink-0 rounded-full border px-3 text-[11px] font-semibold transition-colors ${
                p.id === program.id
                  ? 'border-white/25 text-foreground'
                  : 'border-white/[0.08] text-muted-foreground'
              }`}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}

      {/* Day selector — neutral segmented control; a dot marks the next routine */}
      {program.routines.length > 1 && (
        <div
          className="flex gap-1 overflow-x-auto rounded-xl bg-white/[0.05] p-1"
          style={{ scrollbarWidth: 'none' }}
        >
          {program.routines.map((r) => {
            const selected = r.id === routine.id;
            return (
              <button
                key={r.id}
                onClick={() => setRoutineId(r.id)}
                aria-pressed={selected}
                className={`flex h-9 min-w-fit flex-1 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors ${
                  selected
                    ? 'bg-white text-black shadow-sm'
                    : 'text-muted-foreground active:bg-white/5'
                }`}
              >
                {r.name}
                {r.id === nextRoutineId && (
                  <span
                    aria-label="next"
                    className={`h-1.5 w-1.5 rounded-full ${selected ? 'bg-black/40' : 'bg-white/40'}`}
                  />
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* What the session will hold */}
      <div>
        {routine.notes && <p className="pb-2 text-xs text-muted-foreground">{routine.notes}</p>}
        <ol className="divide-y divide-white/[0.06]">
          {routine.exercises.map((e, i) => (
            <li key={e.id} className="flex items-baseline gap-3 py-2.5">
              <span className="w-4 shrink-0 text-right text-xs font-medium tabular-nums text-muted-foreground/60">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{e.exercise.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {summarizeExerciseTarget(
                    e.sets,
                    e.exercise.exerciseType,
                    e.exercise.secondaryMetric,
                  )}
                  {e.restSec != null ? ` · ${formatRest(e.restSec)?.toLowerCase()}` : ''}
                </p>
                {e.notes && <p className="mt-0.5 text-xs text-muted-foreground/80">{e.notes}</p>}
              </div>
            </li>
          ))}
        </ol>
      </div>

      <button
        disabled={applying || routine.id === currentRoutineId}
        onClick={() => void start(routine)}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground transition-opacity active:opacity-90 disabled:opacity-50"
      >
        <Play className="h-4 w-4 fill-current" />
        {applying
          ? 'Starting…'
          : routine.id === currentRoutineId
            ? 'Current routine'
            : currentRoutineId
              ? `Switch to ${routine.name}`
              : `Start ${routine.name}`}
      </button>
    </div>
  );
}

/**
 * Edge case: the trainer started the wrong day. Sits beside the routine title
 * in the logger and opens a sheet to switch to another routine or remove it.
 * Either way the server drops only the exercises the routine added that are
 * still untouched (no sets, note or completion) — logged work always stays.
 */
export function RoutineSwitcher({
  clientProfileId,
  clientName,
  sessionInstanceId,
  currentRoutineId,
  disabled,
  onChanged,
}: {
  clientProfileId: string;
  clientName?: string;
  sessionInstanceId: string;
  currentRoutineId: string;
  disabled?: boolean;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<RoutineSource | null>(null);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const loaded = await loadSource(clientProfileId);
        if (!cancelled) setSource(loaded);
      } catch {
        if (!cancelled) toast.error('Could not load routines. Check your connection.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, clientProfileId]);

  async function remove() {
    if (disabled) {
      toast('Saving your changes. Try again in a second.');
      return;
    }
    setRemoving(true);
    try {
      const res = await fetch(`/api/sessions/${sessionInstanceId}/routine`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? 'Could not remove routine');
        return;
      }
      const removed = (json.data.removedExerciseIds as string[]).length;
      toast.success(
        removed > 0
          ? `Routine removed. ${removed} unlogged ${removed === 1 ? 'exercise' : 'exercises'} taken out`
          : 'Routine removed. Logged exercises kept',
      );
      setOpen(false);
      onChanged();
    } catch {
      toast.error('Could not remove routine. Check your connection.');
    } finally {
      setRemoving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Change routine"
        className="flex h-8 shrink-0 items-center gap-0.5 rounded-lg px-1.5 text-xs font-medium text-muted-foreground active:bg-white/5"
      >
        Change
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      <RoutineSheet
        open={open}
        onOpenChange={setOpen}
        title="Change routine"
        subtitle="Unlogged exercises are swapped out. Logged sets stay."
        icon={<ClipboardCheck className="h-4 w-4 text-primary" />}
      >
        <div className="space-y-4 p-4">
          {source ? (
            <RoutinePicker
              source={source}
              clientProfileId={clientProfileId}
              clientName={clientName}
              sessionInstanceId={sessionInstanceId}
              disabled={disabled}
              bleed={false}
              currentRoutineId={currentRoutineId}
              onApplied={() => {
                setOpen(false);
                onChanged();
              }}
            />
          ) : (
            <p className="py-6 text-center text-xs text-muted-foreground">Loading routines…</p>
          )}
          <button
            type="button"
            disabled={removing}
            onClick={() => void remove()}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-medium text-red-400 active:bg-red-500/10 disabled:opacity-50"
          >
            <Undo2 className="h-4 w-4" />
            {removing ? 'Removing…' : 'Remove routine'}
          </button>
        </div>
      </RoutineSheet>
    </>
  );
}
