'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { formatRest, summarizeExerciseTarget } from '@/lib/routine-format';
import type { RoutineDetailDto } from './program-draft';

/**
 * Read-only routines of a program — Hevy's "share folder" view: each routine
 * expands to its exercises with sets × reps. Used on the client's own program
 * page and the staff Program card. `nextRoutineId` gets a "Next up" badge.
 */
export function ProgramRoutineList({
  routines,
  nextRoutineId,
  defaultOpenId,
}: {
  routines: RoutineDetailDto[];
  nextRoutineId?: string | null;
  defaultOpenId?: string | null;
}) {
  const [openId, setOpenId] = useState<string | null>(defaultOpenId ?? null);

  return (
    <div className="space-y-2">
      {routines.map((r) => {
        const open = openId === r.id;
        const isNext = nextRoutineId === r.id;
        return (
          <div
            key={r.id}
            className={`overflow-hidden rounded-xl border ${
              isNext ? 'border-primary/40 bg-primary/[0.04]' : 'border-white/[0.06] bg-white/[0.02]'
            }`}
          >
            <button
              onClick={() => setOpenId(open ? null : r.id)}
              className="flex min-h-12 w-full items-center gap-2 px-3 py-2 text-left"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold">{r.name}</p>
                  {isNext && (
                    <span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                      Next up
                    </span>
                  )}
                </div>
                <p className="truncate text-[11px] text-muted-foreground">
                  {r.exercises.length} {r.exercises.length === 1 ? 'exercise' : 'exercises'}
                  {r.exercises.length > 0 &&
                    ` · ${r.exercises
                      .slice(0, 3)
                      .map((e) => e.exercise.name)
                      .join(', ')}${r.exercises.length > 3 ? '…' : ''}`}
                </p>
              </div>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
              />
            </button>
            {open && (
              <div className="space-y-1.5 border-t border-white/[0.06] px-3 py-2.5">
                {r.notes && <p className="text-xs italic text-muted-foreground">{r.notes}</p>}
                {r.exercises.map((e, i) => (
                  <div key={e.id} className="flex items-start gap-2.5">
                    <span className="mt-0.5 w-4 shrink-0 text-right text-[11px] font-semibold text-muted-foreground">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium leading-tight">{e.exercise.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {summarizeExerciseTarget(
                          e.sets,
                          e.exercise.exerciseType,
                          e.exercise.secondaryMetric,
                        )}
                        {e.restSec != null ? ` · ${formatRest(e.restSec)?.toLowerCase()}` : ''}
                      </p>
                      {e.notes && <p className="text-[11px] text-sky-400/90">{e.notes}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
