'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { ClipboardCheck } from 'lucide-react';
import { ProgramRoutineList } from './ProgramRoutineList';
import type { ClientProgramDto } from './program-draft';

/**
 * The client's own program, read-only (ADR-053) — Hevy Coach's "Coach" tab:
 * program notes plus each routine's exercises and sets × reps, with the
 * routine coming up next highlighted. Renders nothing without a program.
 */
export function MyProgramCard() {
  const { data: auth } = useSession();
  const clientProfileId = auth?.user?.clientProfileId ?? null;
  const [program, setProgram] = useState<ClientProgramDto | null>(null);

  useEffect(() => {
    if (!clientProfileId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/routine-programs/clients/${clientProfileId}`);
        if (res.ok && !cancelled) setProgram((await res.json()).data);
      } catch {
        // offline — the card simply doesn't render
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientProfileId]);

  if (!program) return null;

  return (
    <section className="space-y-3 rounded-2xl bg-card p-4 ring-1 ring-border/50">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15">
          <ClipboardCheck className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            My program
          </p>
          <p className="truncate text-base font-bold">{program.name}</p>
          {program.notes && (
            <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
              {program.notes}
            </p>
          )}
        </div>
      </div>
      <ProgramRoutineList
        routines={program.routines}
        nextRoutineId={program.nextRoutineId}
        defaultOpenId={program.nextRoutineId}
      />
    </section>
  );
}
