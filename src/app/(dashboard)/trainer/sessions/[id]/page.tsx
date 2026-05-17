'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, CheckCircle2, Clock, Dumbbell, Activity, Timer, User2 } from 'lucide-react';
import { Breadcrumb } from '@/components/ui/breadcrumb';

type ExerciseType = 'WEIGHTED' | 'BODYWEIGHT' | 'DURATION' | 'CARDIO';

interface SetData {
  setNumber: number;
  reps: number | null;
  weightKg: number | null;
  durationSec: number | null;
  rpe: number | null;
  notes: string | null;
}

interface WorkoutLog {
  id: string;
  orderIndex: number;
  exercise: {
    id: string;
    name: string;
    targetMuscleGroup: string;
    category: string;
    exerciseType: ExerciseType;
  };
  sets: SetData[];
}

interface SessionData {
  id: string;
  scheduledDate: string;
  scheduledTime: string;
  durationMin: number;
  actualDurationMin: number | null;
  status: string;
  startedAt: string | null;
  endedAt: string | null;
  client: { user: { firstName: string; lastName: string } };
  trainer: { user: { firstName: string; lastName: string } };
  workoutLogs: WorkoutLog[];
}

const TYPE_CONFIG: Record<
  ExerciseType,
  { label: string; icon: React.ElementType; bg: string; text: string; accent: string }
> = {
  WEIGHTED: {
    label: 'Weighted',
    icon: Dumbbell,
    bg: 'bg-blue-500/10',
    text: 'text-blue-500',
    accent: '#3b82f6',
  },
  BODYWEIGHT: {
    label: 'Bodyweight',
    icon: User2,
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-500',
    accent: '#22c55e',
  },
  DURATION: {
    label: 'Duration',
    icon: Timer,
    bg: 'bg-amber-500/10',
    text: 'text-amber-500',
    accent: '#f59e0b',
  },
  CARDIO: {
    label: 'Cardio',
    icon: Activity,
    bg: 'bg-red-500/10',
    text: 'text-red-500',
    accent: '#ef4444',
  },
};

type ColDef = { key: keyof SetData; label: string };
const TYPE_COLS: Record<ExerciseType, ColDef[]> = {
  WEIGHTED: [
    { key: 'reps', label: 'Reps' },
    { key: 'weightKg', label: 'kg' },
    { key: 'rpe', label: 'RPE' },
  ],
  BODYWEIGHT: [
    { key: 'reps', label: 'Reps' },
    { key: 'rpe', label: 'RPE' },
  ],
  DURATION: [
    { key: 'durationSec', label: 'sec' },
    { key: 'rpe', label: 'RPE' },
  ],
  CARDIO: [
    { key: 'durationSec', label: 'sec' },
    { key: 'notes', label: 'km' },
  ],
};

function getGridClass(n: number) {
  if (n === 1) return 'grid-cols-[2rem_1fr]';
  if (n === 2) return 'grid-cols-[2rem_1fr_1fr]';
  return 'grid-cols-[2rem_1fr_1fr_1fr]';
}

function formatTime12(t: string) {
  const [h = '0', m = '00'] = t.split(':');
  const hour = parseInt(h, 10);
  return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`;
}

function toLocalDateStr(d: string) {
  return new Date(d).toLocaleDateString('en-CA');
}

function fmt(val: number | string | null | undefined) {
  if (val === null || val === undefined || val === '') return '—';
  return String(val);
}

function initials(first: string, last: string) {
  return `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase();
}

export default function TrainerSessionViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [session, setSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`/api/trainer/sessions/${id}`)
      .then((r) => {
        if (r.status === 404) {
          setNotFound(true);
          return null;
        }
        return r.json();
      })
      .then((json) => {
        if (json?.data) setSession(json.data);
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="fixed inset-0 flex flex-col bg-background">
        <div className="flex h-14 items-center gap-3 border-b px-4">
          <div className="h-8 w-8 animate-pulse rounded-xl bg-muted" />
          <div className="h-4 w-40 animate-pulse rounded-lg bg-muted" />
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </div>
    );
  }

  if (notFound || !session) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-4">
        <p className="font-medium">Session not found</p>
        <button
          onClick={() => router.push('/trainer')}
          className="rounded-xl bg-muted px-4 py-2 text-sm font-medium hover:bg-muted/80"
        >
          Back to dashboard
        </button>
      </div>
    );
  }

  const clientName = `${session.client.user.firstName} ${session.client.user.lastName}`;
  const clientInit = initials(session.client.user.firstName, session.client.user.lastName);
  const displayDate = new Date(toLocalDateStr(session.scheduledDate)).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  // Merge duplicate WorkoutLog records
  const scoreSet = (s: SetData) =>
    (s.reps != null ? 1 : 0) +
    (s.weightKg != null ? 1 : 0) +
    (s.durationSec != null ? 1 : 0) +
    (s.rpe != null ? 1 : 0);

  const groups = new Map<string, { primary: WorkoutLog; setMap: Map<number, SetData> }>();
  for (const log of session.workoutLogs) {
    const g = groups.get(log.exercise.id);
    if (!g) {
      const setMap = new Map<number, SetData>();
      log.sets.forEach((s) => setMap.set(s.setNumber, s));
      groups.set(log.exercise.id, { primary: log, setMap });
    } else {
      for (const s of log.sets) {
        const ex = g.setMap.get(s.setNumber);
        if (!ex || scoreSet(s) > scoreSet(ex)) g.setMap.set(s.setNumber, s);
      }
    }
  }
  const logs = [...groups.values()]
    .sort((a, b) => a.primary.orderIndex - b.primary.orderIndex)
    .map(({ primary, setMap }) => ({
      ...primary,
      sets: [...setMap.values()].sort((a, b) => a.setNumber - b.setNumber),
    }));

  const totalSets = logs.reduce((acc, l) => acc + l.sets.length, 0);
  const durationMin = session.actualDurationMin ?? session.durationMin;

  return (
    <div className="fixed inset-0 flex flex-col bg-background">
      {/* ── Header ── */}
      <div className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="px-4 pt-2.5 pb-2">
          <Breadcrumb items={[{ label: 'Dashboard', href: '/trainer' }, { label: clientName }]} />
        </div>
        <div className="flex h-14 items-center gap-3 px-4">
          <div className="flex flex-1 items-center gap-2.5 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
              {clientInit}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-none">{clientName}</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {displayDate} · {formatTime12(session.scheduledTime)}
              </p>
            </div>
          </div>

          <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1.5 text-[10px] font-semibold text-emerald-500">
            <CheckCircle2 className="h-3 w-3" />
            Completed
          </span>
        </div>

        {/* Meta chips */}
        <div className="flex items-center gap-3 px-4 pb-2.5">
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Clock className="h-3 w-3" />
            {durationMin} min
          </span>
          <div className="h-3 w-px bg-border" />
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Dumbbell className="h-3 w-3" />
            {logs.length} exercise{logs.length !== 1 ? 's' : ''}
          </span>
          <div className="h-3 w-px bg-border" />
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Calendar className="h-3 w-3" />
            {totalSets} sets
          </span>
        </div>
      </div>

      {/* ── Workout log (scrollable) ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="space-y-3 px-4 py-4 pb-8">
          {logs.length === 0 && (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border/50 py-16 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <Dumbbell className="h-7 w-7 text-muted-foreground" />
              </div>
              <p className="font-medium">No exercises logged</p>
              <p className="text-sm text-muted-foreground">
                No workout data was recorded for this session
              </p>
            </div>
          )}

          {logs.map((log) => {
            const cfg = TYPE_CONFIG[log.exercise.exerciseType];
            const Icon = cfg.icon;
            const cols = TYPE_COLS[log.exercise.exerciseType];

            return (
              <div
                key={log.id}
                className="overflow-hidden rounded-2xl border bg-card"
                style={{ borderLeftWidth: 3, borderLeftColor: cfg.accent }}
              >
                <div className="flex items-center gap-3 px-4 py-3">
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${cfg.bg}`}
                  >
                    <Icon className={`h-4 w-4 ${cfg.text}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{log.exercise.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {log.exercise.targetMuscleGroup}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${cfg.bg} ${cfg.text}`}
                  >
                    {log.sets.length} set{log.sets.length !== 1 ? 's' : ''}
                  </span>
                </div>

                <div className="border-t px-4 pb-3 pt-2">
                  {/* Column headers */}
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
                  </div>

                  {/* Set rows */}
                  <div className="space-y-1.5">
                    {log.sets.map((set) => (
                      <div
                        key={set.setNumber}
                        className={`grid items-center gap-2 ${getGridClass(cols.length)}`}
                      >
                        <div className="flex items-center justify-center">
                          <span
                            className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold"
                            style={{ backgroundColor: cfg.accent + '22', color: cfg.accent }}
                          >
                            {set.setNumber}
                          </span>
                        </div>
                        {cols.map((col) => {
                          const val =
                            col.key === 'notes' ? set.notes : (set[col.key] as number | null);
                          const filled = val !== null && val !== undefined && val !== '';
                          return (
                            <div
                              key={col.key as string}
                              className={`flex h-10 items-center justify-center rounded-xl border text-sm font-semibold tabular-nums ${
                                filled
                                  ? 'border-border/50 bg-muted/30 text-foreground'
                                  : 'border-border/20 bg-transparent text-muted-foreground/30'
                              }`}
                            >
                              {fmt(val)}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
