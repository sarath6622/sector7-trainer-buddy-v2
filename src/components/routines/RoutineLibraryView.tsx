'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Archive, ChevronRight, ClipboardList, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useConfirm } from '@/hooks/use-confirm';
import { Skeleton } from '@/components/ui/skeleton';
import type { ProgramSummaryDto } from './program-draft';

/**
 * Branch routine library (ADR-053). Shared by /trainer/routines and
 * /admin/routines — trainers and admins have the same authoring rights,
 * mirroring the exercise library (ADR-039).
 */
export function RoutineLibraryView({ basePath }: { basePath: string }) {
  const { confirm, ConfirmDialog } = useConfirm();
  const [programs, setPrograms] = useState<ProgramSummaryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/routine-programs?includeArchived=${showArchived}`);
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? 'Could not load routines');
        return;
      }
      setPrograms(json.data);
    } catch {
      toast.error('Could not load routines');
    } finally {
      setLoading(false);
    }
  }, [showArchived]);

  useEffect(() => {
    void load();
  }, [load]);

  async function archive(program: ProgramSummaryDto) {
    const ok = await confirm({
      title: `Archive ${program.name}?`,
      description:
        'It disappears from the library and can no longer be assigned. Clients who already have a copy keep it.',
      confirmText: 'Archive',
      variant: 'destructive',
    });
    if (!ok) return;
    const res = await fetch(`/api/routine-programs/${program.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      toast.error(json.error ?? 'Could not archive');
      return;
    }
    toast.success('Program archived');
    void load();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-10">
      {ConfirmDialog}
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Routines</h1>
          <p className="text-xs text-muted-foreground">
            Programs you can assign to clients. Each client gets their own copy.
          </p>
        </div>
        <Link
          href={`${basePath}/new`}
          className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3.5 text-sm font-semibold text-primary-foreground"
        >
          <Plus className="h-4 w-4" />
          New
        </Link>
      </div>

      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={showArchived}
          onChange={(e) => setShowArchived(e.target.checked)}
          className="h-4 w-4 accent-primary"
        />
        Show archived
      </label>

      {loading && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-2xl" />
          ))}
        </div>
      )}

      {!loading && programs.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border/50 px-6 py-14 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
            <ClipboardList className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-semibold">No programs yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Build a split like Push / Pull / Legs, then assign it from a client&rsquo;s page.
            </p>
          </div>
          <Link
            href={`${basePath}/new`}
            className="flex h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
          >
            <Plus className="h-4 w-4" />
            Create program
          </Link>
        </div>
      )}

      {!loading &&
        programs.map((p) => (
          <div
            key={p.id}
            className={`overflow-hidden rounded-2xl border border-white/[0.08] bg-card ${
              p.isArchived ? 'opacity-60' : ''
            }`}
          >
            <Link
              href={`${basePath}/${p.id}`}
              className="flex items-start gap-3 px-4 py-3.5 active:bg-muted/30"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold">{p.name}</p>
                  {p.isArchived && (
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                      Archived
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {p.routineCount} {p.routineCount === 1 ? 'routine' : 'routines'} ·{' '}
                  {p.exerciseCount} exercises
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {p.routines.map((r) => (
                    <span
                      key={r.id}
                      className="rounded-lg bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary"
                    >
                      {r.name}
                      <span className="ml-1 text-primary/60">· {r.exerciseCount}</span>
                    </span>
                  ))}
                </div>
              </div>
              <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
            {!p.isArchived && (
              <div className="flex justify-end border-t border-white/[0.06] px-2 py-1">
                <button
                  onClick={() => void archive(p)}
                  className="flex h-10 items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-muted-foreground active:bg-muted"
                >
                  <Archive className="h-3.5 w-3.5" />
                  Archive
                </button>
              </div>
            )}
          </div>
        ))}
    </div>
  );
}
