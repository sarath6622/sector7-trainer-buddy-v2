'use client';

import { useEffect, useState } from 'react';
import { History as HistoryIcon, Clock, CheckCircle2, XCircle, Loader2 } from 'lucide-react';

interface HistorySet {
  setNumber: number;
  reps: number | null;
  weightKg: number | null;
  durationSec: number | null;
  rpe: number | null;
}

interface HistoryExercise {
  id: string;
  name: string;
  targetMuscleGroup: string;
  exerciseType: string;
  sets: HistorySet[];
}

interface HistorySession {
  sessionId: string;
  date: string;
  time: string;
  status: string;
  durationMin: number | null;
  exercises: HistoryExercise[];
}

function formatSet(set: HistorySet, exerciseType: string): string {
  if (exerciseType === 'WEIGHTED') {
    if (set.weightKg != null && set.reps != null) return `${set.weightKg}kg × ${set.reps}`;
    if (set.weightKg != null) return `${set.weightKg}kg`;
    if (set.reps != null) return `${set.reps} reps`;
  }
  if (exerciseType === 'BODYWEIGHT') {
    if (set.reps != null) return `${set.reps} reps`;
  }
  if (exerciseType === 'DURATION' || exerciseType === 'CARDIO') {
    if (set.durationSec != null) {
      const m = Math.floor(set.durationSec / 60);
      const s = set.durationSec % 60;
      return m > 0 ? `${m}m ${s}s` : `${s}s`;
    }
  }
  return '—';
}

function StatusPill({ status }: { status: string }) {
  const completed = status === 'COMPLETED';
  const cancelled = status === 'CANCELLED' || status === 'NO_SHOW';
  const Icon = completed ? CheckCircle2 : cancelled ? XCircle : Clock;
  const color = completed
    ? 'text-emerald-500 bg-emerald-500/10'
    : cancelled
      ? 'text-red-400 bg-red-500/10'
      : 'text-muted-foreground bg-muted';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${color}`}
    >
      <Icon className="h-3 w-3" />
      {status.toLowerCase().replace('_', ' ')}
    </span>
  );
}

interface WorkoutHistoryListProps {
  /** Endpoint that returns the history payload. The session screen and the
   *  client-progress page both have a trainer-scoped endpoint with the same
   *  shape, so the component just takes a URL rather than baking in an
   *  identifier strategy. */
  historyEndpoint: string;
  /** Session being actively logged — shown with an "active" pill at the top
   *  of its card so the trainer can tell their in-progress work apart from
   *  prior sessions. */
  activeSessionId?: string;
}

export function WorkoutHistoryList({ historyEndpoint, activeSessionId }: WorkoutHistoryListProps) {
  const [sessions, setSessions] = useState<HistorySession[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ctrl = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetch(historyEndpoint, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then(({ data }) => setSessions(data ?? []))
      .catch(() => {
        if (!ctrl.signal.aborted) setSessions([]);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [historyEndpoint]);

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading history…
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
    );
  }

  if (!sessions || sessions.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center rounded-2xl ring-1 ring-border/40">
        <HistoryIcon className="h-8 w-8 text-muted-foreground" />
        <p className="text-muted-foreground text-sm">No workout history yet.</p>
        <p className="text-xs text-muted-foreground">
          Past sessions with logged exercises will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sessions.map((s) => {
        const date = new Date(s.date);
        const day = date.getDate();
        const month = date.toLocaleDateString('en-IN', { month: 'short' });
        const weekday = date.toLocaleDateString('en-IN', { weekday: 'short' });
        const isActive = s.sessionId === activeSessionId;
        return (
          <div
            key={s.sessionId}
            className={`rounded-2xl bg-card p-4 ring-1 ${isActive ? 'ring-primary/50' : 'ring-border/50'}`}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-primary/10">
                <span className="text-base font-bold leading-none text-primary">{day}</span>
                <span className="text-[9px] font-medium uppercase text-primary/70">{month}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold">
                    {weekday}, {month} {day}
                  </p>
                  {isActive ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
                      this session
                    </span>
                  ) : (
                    <StatusPill status={s.status} />
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {s.time}
                  {s.durationMin != null && ` · ${s.durationMin} min`} · {s.exercises.length}{' '}
                  exercise{s.exercises.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>

            <div className="mt-3 space-y-2 border-t border-border/50 pt-3">
              {s.exercises.map((ex) => (
                <div key={ex.id} className="text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-foreground truncate">{ex.name}</p>
                    <p className="text-[10px] text-muted-foreground shrink-0">
                      {ex.targetMuscleGroup}
                    </p>
                  </div>
                  {ex.sets.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {ex.sets.map((set) => (
                        <span
                          key={set.setNumber}
                          className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                        >
                          {formatSet(set, ex.exerciseType)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
