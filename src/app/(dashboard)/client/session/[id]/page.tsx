'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Dumbbell,
  Activity,
  Timer,
  User2,
  Calendar,
  Clock,
  RefreshCw,
  Eye,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { InlineTimer } from '@/components/timer/SessionTimer';

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
  status: string;
  startedAt?: string;
  trainer: { user: { firstName: string; lastName: string } };
  workoutLogs: WorkoutLog[];
}

// ─── Type config (read-only, same palette as WorkoutLogger) ──────────────────
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

function getGridClass(colCount: number) {
  if (colCount === 1) return 'grid-cols-[2rem_1fr]';
  if (colCount === 2) return 'grid-cols-[2rem_1fr_1fr]';
  return 'grid-cols-[2rem_1fr_1fr_1fr]';
}

function formatTime12(t: string) {
  const [h = '0', m = '00'] = t.split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  return `${hour % 12 || 12}:${m} ${ampm}`;
}

function toLocalDateStr(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-CA');
}

function formatVal(val: number | string | null | undefined, fallback = '—') {
  if (val === null || val === undefined || val === '') return fallback;
  return String(val);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ClientSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [session, setSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [progressModal, setProgressModal] = useState<{
    exerciseId: string;
    exerciseName: string;
    unit: string;
  } | null>(null);

  const fetchSession = useCallback(async () => {
    const res = await fetch(`/api/client/sessions/${id}`);
    if (res.ok) {
      const { data } = await res.json();
      setSession(data as SessionData);
      setLastRefreshed(new Date());
    }
  }, [id]);

  // Initial load
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchSession().finally(() => setLoading(false));
  }, [fetchSession]);

  // Poll every 10 seconds while session is IN_PROGRESS
  useEffect(() => {
    if (!session || session.status !== 'IN_PROGRESS') return;
    const interval = setInterval(() => void fetchSession(), 10_000);
    return () => clearInterval(interval);
  }, [session, fetchSession]);

  if (loading) {
    return (
      <div className="fixed inset-0 flex flex-col bg-background">
        <div className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
          <div className="flex h-12 items-center gap-3 px-4">
            <div className="h-8 w-8 animate-pulse rounded-lg bg-muted" />
            <div className="h-4 w-32 animate-pulse rounded bg-muted" />
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-4">
        <p className="text-sm text-muted-foreground">Session not found</p>
        <Button variant="outline" size="sm" onClick={() => router.push('/client')}>
          Go back
        </Button>
      </div>
    );
  }

  const trainerName = `${session.trainer.user.firstName} ${session.trainer.user.lastName}`;
  const isActive = session.status === 'IN_PROGRESS' && !!session.startedAt;

  // Merge duplicate WorkoutLog records for the same exercise (from old buggy saves).
  // Logs are ordered oldest→newest (id ASC). For each set number, keep the most data-rich version.
  const scoreSet = (s: SetData) =>
    (s.reps != null ? 1 : 0) +
    (s.weightKg != null ? 1 : 0) +
    (s.durationSec != null ? 1 : 0) +
    (s.rpe != null ? 1 : 0);

  const groups = new Map<string, { primary: WorkoutLog; setMap: Map<number, SetData> }>();
  for (const log of session.workoutLogs) {
    const group = groups.get(log.exercise.id);
    if (!group) {
      const setMap = new Map<number, SetData>();
      for (const s of log.sets) setMap.set(s.setNumber, s);
      groups.set(log.exercise.id, { primary: log, setMap });
    } else {
      for (const s of log.sets) {
        const existing = group.setMap.get(s.setNumber);
        if (!existing || scoreSet(s) > scoreSet(existing)) {
          group.setMap.set(s.setNumber, s);
        }
      }
    }
  }

  const groupedLogs = [...groups.values()]
    .sort((a, b) => a.primary.orderIndex - b.primary.orderIndex)
    .map(({ primary, setMap }) => ({
      ...primary,
      sets: [...setMap.values()].sort((a, b) => a.setNumber - b.setNumber),
    }));

  const totalSets = groupedLogs.reduce((acc, log) => acc + log.sets.length, 0);

  return (
    <div className="fixed inset-0 flex flex-col bg-background">
      {/* ── Sticky header ── */}
      <div className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="flex h-12 items-center gap-3 px-4">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => router.push('/client')}
            className="shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <span className="flex-1 truncate text-sm font-semibold text-muted-foreground">
            Live Session
          </span>
          {isActive && (
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              <span className="font-mono text-base font-bold tabular-nums text-emerald-500">
                <InlineTimer
                  startedAt={session.startedAt!}
                  expectedDurationMin={session.durationMin}
                />
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Session info strip ── */}
      <div className="border-b bg-muted/30 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">With {trainerName}</p>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {new Date(toLocalDateStr(session.scheduledDate)).toLocaleDateString('en-IN', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                })}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatTime12(session.scheduledTime)}
              </span>
              <span className="flex items-center gap-1">
                <Timer className="h-3 w-3" />
                {session.durationMin} min
              </span>
            </div>
          </div>
          {isActive && (
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-500">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              LIVE
            </span>
          )}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto pb-6">
        {/* Workout overview strip */}
        {groupedLogs.length > 0 && (
          <div className="flex items-center gap-4 border-b bg-muted/20 px-4 py-2.5">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Dumbbell className="h-3.5 w-3.5" />
              <span>
                <span className="font-semibold text-foreground">{groupedLogs.length}</span> exercise
                {groupedLogs.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Eye className="h-3.5 w-3.5" />
              <span>
                <span className="font-semibold text-foreground">{totalSets}</span> sets logged
              </span>
            </div>
            {lastRefreshed && isActive && (
              <button
                onClick={() => void fetchSession()}
                className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <RefreshCw className="h-3 w-3" />
                Refresh
              </button>
            )}
          </div>
        )}

        <div className="space-y-3 px-4 pt-4">
          {/* Empty state */}
          {groupedLogs.length === 0 && (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border/60 py-12">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
                <Dumbbell className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium">
                  {isActive ? 'Workout not started yet' : 'No exercises logged'}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {isActive
                    ? 'Your trainer will log exercises as they happen'
                    : 'No workout data was recorded for this session'}
                </p>
              </div>
              {isActive && (
                <p className="text-xs text-muted-foreground">Auto-updates every 10 seconds</p>
              )}
            </div>
          )}

          {/* Exercise cards — read-only */}
          {groupedLogs.map((log) => {
            const cfg = TYPE_CONFIG[log.exercise.exerciseType];
            const Icon = cfg.icon;
            const cols = TYPE_COLS[log.exercise.exerciseType];

            return (
              <div
                key={log.id}
                className="overflow-hidden rounded-2xl border bg-card shadow-sm"
                style={{ borderLeftWidth: 3, borderLeftColor: cfg.accent }}
              >
                {/* Exercise header */}
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
                  <button
                    onClick={() =>
                      setProgressModal({
                        exerciseId: log.exercise.id,
                        exerciseName: log.exercise.name,
                        unit:
                          log.exercise.exerciseType === 'WEIGHTED'
                            ? 'kg'
                            : log.exercise.exerciseType === 'DURATION' ||
                                log.exercise.exerciseType === 'CARDIO'
                              ? 'sec'
                              : 'reps',
                      })
                    }
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-primary"
                    title="View my progress"
                  >
                    <TrendingUp className="h-4 w-4" />
                  </button>
                </div>

                {/* Sets table — read-only */}
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
                        {/* Set number */}
                        <div className="flex items-center justify-center">
                          <span
                            className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold"
                            style={{ backgroundColor: cfg.accent + '22', color: cfg.accent }}
                          >
                            {set.setNumber}
                          </span>
                        </div>

                        {/* Values */}
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
                                  : 'border-border/20 bg-transparent text-muted-foreground/40'
                              }`}
                            >
                              {formatVal(val)}
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

          {/* Live refresh hint */}
          {isActive && groupedLogs.length > 0 && (
            <p className="text-center text-xs text-muted-foreground">
              Auto-updates every 10 seconds
            </p>
          )}
        </div>
      </div>

      {/* Exercise progress modal */}
      {progressModal && (
        <ClientExerciseProgressModal
          exerciseId={progressModal.exerciseId}
          exerciseName={progressModal.exerciseName}
          unit={progressModal.unit}
          onClose={() => setProgressModal(null)}
        />
      )}
    </div>
  );
}

// ─── Client-scoped exercise progress modal ────────────────────────────────────

interface ChartPoint {
  date: string;
  value: number | null;
}

function ClientExerciseProgressModal({
  exerciseId,
  exerciseName,
  unit,
  onClose,
}: {
  exerciseId: string;
  exerciseName: string;
  unit: string;
  onClose: () => void;
}) {
  const [raw, setRaw] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetch(`/api/client/progress/charts?metric=exercise&exerciseId=${exerciseId}`)
      .then((r) => r.json())
      .then(({ data: d }) => setRaw(d ?? []))
      .catch(() => setRaw([]))
      .finally(() => setLoading(false));
  }, [exerciseId]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const values = raw.map((p) => p.value).filter((v): v is number => v != null);
  const latest = values.at(-1) ?? null;
  const first = values[0] ?? null;
  const best = values.length ? Math.max(...values) : null;
  const delta = latest != null && first != null ? latest - first : null;

  // Pre-format dates so XAxis receives clean strings
  const chartData = raw
    .filter((p) => p.value != null)
    .map((p) => ({
      date: new Date(p.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
      value: p.value,
    }));

  const axisLabel =
    unit === 'kg'
      ? 'Max weight per session'
      : unit === 'sec'
        ? 'Duration per session'
        : 'Reps per session';

  const positive = delta != null && delta > 0;
  const negative = delta != null && delta < 0;
  const DeltaIcon =
    delta == null || Math.abs(delta) < 0.01 ? Minus : positive ? ArrowUpRight : ArrowDownRight;
  const deltaColor =
    delta == null || Math.abs(delta ?? 0) < 0.01
      ? 'text-muted-foreground'
      : positive
        ? 'text-emerald-500'
        : 'text-red-500';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative z-10 w-full max-w-lg rounded-t-3xl bg-card pb-safe shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-border" />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-3 pb-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              My Progress
            </p>
            <h2 className="mt-0.5 text-lg font-bold">{exerciseName}</h2>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground hover:text-foreground"
          >
            <Minus className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex flex-col items-center gap-3 pb-10 pt-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
              <TrendingUp className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="font-medium">No history yet</p>
            <p className="text-sm text-muted-foreground">
              Progress will appear after sessions are logged
            </p>
          </div>
        ) : (
          <div className="space-y-4 px-5 pb-8">
            {/* Stat pills */}
            <div className="grid grid-cols-3 gap-3">
              {/* Latest */}
              <div className="rounded-2xl bg-background p-3 ring-1 ring-border/40">
                <p className="text-[10px] text-muted-foreground">Latest</p>
                <p className="mt-1 text-lg font-bold leading-none">
                  {latest != null ? latest.toFixed(1) : '—'}
                  <span className="ml-0.5 text-xs font-normal text-muted-foreground">
                    {latest != null ? unit : ''}
                  </span>
                </p>
              </div>
              {/* Best */}
              <div className="rounded-2xl bg-background p-3 ring-1 ring-border/40">
                <p className="text-[10px] text-muted-foreground">Best</p>
                <p className="mt-1 text-lg font-bold leading-none text-amber-500">
                  {best != null ? best.toFixed(1) : '—'}
                  <span className="ml-0.5 text-xs font-normal text-muted-foreground">
                    {best != null ? unit : ''}
                  </span>
                </p>
              </div>
              {/* Change */}
              <div className="rounded-2xl bg-background p-3 ring-1 ring-border/40">
                <p className="text-[10px] text-muted-foreground">Change</p>
                <div
                  className={`mt-1 flex items-center gap-0.5 text-lg font-bold leading-none ${deltaColor}`}
                >
                  <DeltaIcon className="h-4 w-4" />
                  {delta != null && Math.abs(delta) >= 0.01
                    ? `${Math.abs(delta).toFixed(1)}${unit}`
                    : '—'}
                </div>
                <p className="mt-1 text-[9px] text-muted-foreground">
                  {values.length} session{values.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>

            {/* Chart */}
            <div className="rounded-2xl bg-background p-4 ring-1 ring-border/40">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {axisLabel}
              </p>
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="cpGrad" x1="0" y1="0" x2="0" y2="1">
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
                    fill="url(#cpGrad)"
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

            {/* Trend summary */}
            {values.length >= 2 && (
              <div
                className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm ${
                  positive
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : negative
                      ? 'bg-red-500/10 text-red-400'
                      : 'bg-muted/50 text-muted-foreground'
                }`}
              >
                <DeltaIcon className="h-4 w-4 shrink-0" />
                <span>
                  {positive
                    ? `Up ${delta!.toFixed(1)}${unit} since your first session`
                    : negative
                      ? `Down ${Math.abs(delta!).toFixed(1)}${unit} since your first session`
                      : 'No change since your first session'}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
