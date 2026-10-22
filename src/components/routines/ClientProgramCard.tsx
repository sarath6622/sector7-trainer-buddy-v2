'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ClipboardCheck, Pencil, Repeat, Unlink } from 'lucide-react';
import { toast } from 'sonner';
import { useConfirm } from '@/hooks/use-confirm';
import { Skeleton } from '@/components/ui/skeleton';
import { ProgramRoutineList } from './ProgramRoutineList';
import { RoutineSheet } from './RoutineSheet';
import type { ClientProgramDto, ProgramSummaryDto } from './program-draft';

/**
 * A client's training program on the staff client pages (ADR-053): shows the
 * active copy with its "Next up" routine, and lets staff assign a library
 * program, edit this client's copy, or unassign. The server decides who may
 * change it (admins; trainers with an active package for the client) — a 403
 * surfaces as a toast rather than hiding the controls.
 */
export function ClientProgramCard({
  clientProfileId,
  clientName,
  editBasePath,
}: {
  clientProfileId: string;
  clientName?: string;
  /** `/trainer/routines` or `/admin/routines` — the editor route for the copy. */
  editBasePath: string;
}) {
  const { confirm, ConfirmDialog } = useConfirm();
  const [program, setProgram] = useState<ClientProgramDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [assignOpen, setAssignOpen] = useState(false);
  const [library, setLibrary] = useState<ProgramSummaryDto[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/routine-programs/clients/${clientProfileId}`);
      if (res.ok) setProgram((await res.json()).data);
    } finally {
      setLoading(false);
    }
  }, [clientProfileId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!assignOpen || library) return;
    void (async () => {
      const res = await fetch('/api/routine-programs');
      if (res.ok) setLibrary((await res.json()).data);
      else setLibrary([]);
    })();
  }, [assignOpen, library]);

  async function assign(source: ProgramSummaryDto) {
    if (program) {
      const ok = await confirm({
        title: `Replace ${program.name}?`,
        description: `${clientName ?? 'The client'} switches to ${source.name}. Their logged sessions are kept.`,
        confirmText: 'Replace',
      });
      if (!ok) return;
    }
    setBusyId(source.id);
    try {
      const res = await fetch(`/api/routine-programs/${source.id}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientProfileId }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? 'Could not assign program');
        return;
      }
      toast.success(`${source.name} assigned`);
      setAssignOpen(false);
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function unassign() {
    if (!program) return;
    const ok = await confirm({
      title: `Remove ${program.name}?`,
      description: 'The client will have no program. Their logged sessions are kept.',
      confirmText: 'Remove',
      variant: 'destructive',
    });
    if (!ok) return;
    const res = await fetch(`/api/routine-programs/clients/${clientProfileId}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      toast.error(json.error ?? 'Could not remove program');
      return;
    }
    toast.success('Program removed');
    setProgram(null);
  }

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-3">
      {ConfirmDialog}
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
          Training program
        </p>
        {program && (
          <div className="flex items-center gap-0.5">
            <Link
              href={`${editBasePath}/${program.id}`}
              className="flex h-9 items-center gap-1 rounded-lg px-2 text-xs font-medium text-muted-foreground active:bg-muted"
            >
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Link>
            <button
              onClick={() => setAssignOpen(true)}
              className="flex h-9 items-center gap-1 rounded-lg px-2 text-xs font-medium text-muted-foreground active:bg-muted"
            >
              <Repeat className="h-3.5 w-3.5" /> Change
            </button>
            <button
              onClick={() => void unassign()}
              aria-label="Remove program"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground active:bg-muted"
            >
              <Unlink className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {loading && <Skeleton className="h-16 w-full rounded-xl" />}

      {!loading && !program && (
        <div className="flex items-center gap-3">
          <p className="flex-1 text-xs text-muted-foreground">
            No program assigned. Pick one from the routine library and the trainer can start each
            session from it.
          </p>
          <button
            onClick={() => setAssignOpen(true)}
            className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3.5 text-xs font-semibold text-primary-foreground"
          >
            <ClipboardCheck className="h-3.5 w-3.5" />
            Assign
          </button>
        </div>
      )}

      {!loading && program && (
        <div className="space-y-2.5">
          <div>
            <p className="text-sm font-semibold">{program.name}</p>
            {program.notes && (
              <p className="mt-0.5 whitespace-pre-wrap text-xs text-muted-foreground">
                {program.notes}
              </p>
            )}
          </div>
          <ProgramRoutineList routines={program.routines} nextRoutineId={program.nextRoutineId} />
        </div>
      )}

      <RoutineSheet
        open={assignOpen}
        onOpenChange={setAssignOpen}
        title="Assign a program"
        subtitle={
          clientName ? `${clientName} gets their own copy` : 'The client gets their own copy'
        }
        icon={<ClipboardCheck className="h-4 w-4 text-primary" />}
      >
        <div className="space-y-2 p-3">
          {library === null && <Skeleton className="h-16 w-full rounded-xl" />}
          {library?.length === 0 && (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">
              The routine library is empty. Create a program under Routines first.
            </p>
          )}
          {library?.map((p) => (
            <button
              key={p.id}
              disabled={busyId !== null}
              onClick={() => void assign(p)}
              className="flex w-full flex-col items-start gap-1.5 rounded-xl border border-white/[0.08] px-3.5 py-3 text-left transition-colors active:bg-muted/40 disabled:opacity-50"
            >
              <span className="text-sm font-semibold">
                {busyId === p.id ? 'Assigning…' : p.name}
              </span>
              <span className="flex flex-wrap gap-1">
                {p.routines.map((r) => (
                  <span
                    key={r.id}
                    className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
                  >
                    {r.name}
                  </span>
                ))}
              </span>
            </button>
          ))}
        </div>
      </RoutineSheet>
    </div>
  );
}
