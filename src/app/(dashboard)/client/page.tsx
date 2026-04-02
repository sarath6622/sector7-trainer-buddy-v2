'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowRight,
  Award,
  Calendar,
  CheckCircle,
  Clock,
  Dumbbell,
  Flame,
  RefreshCw,
  Target,
  Zap,
  TrendingDown,
  TrendingUp,
  Trophy,
  Scale,
  Activity,
  ChevronRight,
  TimerReset,
} from 'lucide-react';
import { SessionTimer } from '@/components/timer/SessionTimer';

interface ProgressSnapshot {
  weightKg: number | null;
  bodyFatPercent: number | null;
  muscleMass: number | null;
}

interface PR {
  exerciseName: string;
  muscle: string;
  maxWeightKg: number;
}

interface EngagementStats {
  streak: number;
  allTimeCompleted: number;
  daysSinceLastSession: number | null;
  monthAttendanceRate: number | null;
}

interface DashboardData {
  sessionCount: {
    total: number;
    completed: number;
    noShow: number;
    cancelled: number;
    scheduled: number;
    inProgress: number;
    carryForward: number;
    used: number;
    remaining: number;
  };
  engagementStats: EngagementStats;
  nextSession?: {
    id: string;
    scheduledDate: string;
    scheduledTime: string;
    durationMin: number;
    trainer: { user: { firstName: string; lastName: string } };
  };
  activeSession?: {
    id: string;
    startedAt: string;
    durationMin: number;
    trainer: { user: { firstName: string; lastName: string } };
  };
  trainer?: { name: string; sessionsPerMonth: number };
  latestProgress: ProgressSnapshot | null;
  prevProgress: ProgressSnapshot | null;
  prs: PR[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(timeStr: string) {
  const [h = '0', m = '00'] = timeStr.split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  return `${hour % 12 || 12}:${m} ${ampm}`;
}

/** Returns local date at midnight from an ISO date string (avoids UTC offset issues) */
function localDate(dateStr: string) {
  const [y, mo, d] = dateStr.split('T')[0]!.split('-').map(Number);
  return new Date(y!, mo! - 1, d!);
}

function relativeDay(dateStr: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = localDate(dateStr);
  const diff = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff <= 6) return `In ${diff} days`;
  return target.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

function initials(name: string) {
  return name
    .split(' ')
    .map((p) => p[0] ?? '')
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function Delta({
  current,
  prev,
  unit,
  lowerIsBetter = false,
}: {
  current: number | null;
  prev: number | null;
  unit: string;
  lowerIsBetter?: boolean;
}) {
  if (current == null || prev == null)
    return <span className="text-xs text-muted-foreground">First entry</span>;
  const diff = current - prev;
  if (Math.abs(diff) < 0.01)
    return <span className="text-xs text-muted-foreground">No change</span>;
  const positive = lowerIsBetter ? diff < 0 : diff > 0;
  const Icon = diff > 0 ? TrendingUp : TrendingDown;
  return (
    <span
      className={`flex items-center gap-0.5 text-xs font-semibold ${positive ? 'text-emerald-500' : 'text-red-400'}`}
    >
      <Icon className="h-3 w-3" />
      {diff > 0 ? '+' : ''}
      {diff.toFixed(1)}
      {unit}
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ClientDashboard() {
  const { data: session } = useSession();
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch('/api/client/dashboard');
      if (res.ok) {
        const json = await res.json();
        setData(json.data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const firstName = session?.user?.firstName ?? 'there';

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-center">
          <AlertCircle className="h-8 w-8 text-muted-foreground" />
          <p className="text-muted-foreground">Could not load dashboard.</p>
          <button
            onClick={() => {
              setLoading(true);
              fetchDashboard();
            }}
            className="flex items-center gap-2 text-sm text-primary hover:underline"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Try again
          </button>
        </div>
      </div>
    );
  }

  const {
    sessionCount,
    engagementStats,
    latestProgress,
    prevProgress,
    prs,
    nextSession,
    activeSession,
    trainer,
  } = data;

  const usedPct =
    sessionCount.total > 0 ? Math.round((sessionCount.used / sessionCount.total) * 100) : 0;

  const hasWeight = latestProgress?.weightKg != null;
  const hasBodyFat = latestProgress?.bodyFatPercent != null;
  const hasMuscle = latestProgress?.muscleMass != null;
  const hasBodyMetrics = hasWeight || hasBodyFat || hasMuscle;
  const hasPRs = prs.length > 0;
  const showFitnessJourney = hasBodyMetrics || hasPRs;

  return (
    <div className="mx-auto max-w-2xl space-y-5 pb-8">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Hey, {firstName}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Here&apos;s your fitness overview</p>
      </div>

      {/* ── Engagement stats strip ── */}
      <EngagementStrip stats={engagementStats} />

      {/* Active session — hero banner */}
      {activeSession && (
        <button
          onClick={() => router.push(`/client/session/${activeSession.id}`)}
          className="w-full text-left"
        >
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600 p-5 text-white shadow-lg transition-opacity active:opacity-90">
            <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/10" />
            <div className="absolute -right-2 -bottom-8 h-32 w-32 rounded-full bg-white/5" />
            <div className="relative">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-2 w-2 animate-pulse rounded-full bg-white" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-white/90">
                    Session in progress
                  </span>
                </div>
                <span className="rounded-full bg-white/20 px-2.5 py-1 text-xs font-medium">
                  View workout →
                </span>
              </div>
              <p className="mt-3 text-sm text-white/80">
                Training with{' '}
                <span className="font-semibold text-white">
                  {activeSession.trainer.user.firstName} {activeSession.trainer.user.lastName}
                </span>
              </p>
              <div className="mt-4 flex justify-center">
                <SessionTimer
                  startedAt={activeSession.startedAt}
                  expectedDurationMin={activeSession.durationMin}
                  size="lg"
                />
              </div>
            </div>
          </div>
        </button>
      )}

      {/* ── Fitness Journey ── */}
      {showFitnessJourney && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Fitness Journey
            </h2>
            <button
              onClick={() => router.push('/client/progress')}
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              Full history <ChevronRight className="h-3 w-3" />
            </button>
          </div>

          {hasBodyMetrics && (
            <div className="grid grid-cols-2 gap-3">
              {hasWeight && (
                <div className="rounded-2xl bg-card p-4 ring-1 ring-border/50">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-500/10">
                      <Scale className="h-4 w-4 text-blue-500" />
                    </div>
                    <span className="text-xs font-medium text-muted-foreground">Weight</span>
                  </div>
                  <p className="mt-3 text-2xl font-bold">
                    {latestProgress!.weightKg!.toFixed(1)}
                    <span className="ml-1 text-sm font-normal text-muted-foreground">kg</span>
                  </p>
                  <div className="mt-1">
                    <Delta
                      current={latestProgress!.weightKg}
                      prev={prevProgress?.weightKg ?? null}
                      unit="kg"
                      lowerIsBetter
                    />
                  </div>
                </div>
              )}

              {hasBodyFat && (
                <div className="rounded-2xl bg-card p-4 ring-1 ring-border/50">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/10">
                      <Activity className="h-4 w-4 text-amber-500" />
                    </div>
                    <span className="text-xs font-medium text-muted-foreground">Body Fat</span>
                  </div>
                  <p className="mt-3 text-2xl font-bold">
                    {latestProgress!.bodyFatPercent!.toFixed(1)}
                    <span className="ml-1 text-sm font-normal text-muted-foreground">%</span>
                  </p>
                  <div className="mt-1">
                    <Delta
                      current={latestProgress!.bodyFatPercent}
                      prev={prevProgress?.bodyFatPercent ?? null}
                      unit="%"
                      lowerIsBetter
                    />
                  </div>
                </div>
              )}

              {hasMuscle && (
                <div
                  className={`rounded-2xl bg-card p-4 ring-1 ring-border/50 ${!hasWeight && !hasBodyFat ? 'col-span-2' : ''}`}
                >
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/10">
                      <Dumbbell className="h-4 w-4 text-emerald-500" />
                    </div>
                    <span className="text-xs font-medium text-muted-foreground">Muscle Mass</span>
                  </div>
                  <p className="mt-3 text-2xl font-bold">
                    {latestProgress!.muscleMass!.toFixed(1)}
                    <span className="ml-1 text-sm font-normal text-muted-foreground">kg</span>
                  </p>
                  <div className="mt-1">
                    <Delta
                      current={latestProgress!.muscleMass}
                      prev={prevProgress?.muscleMass ?? null}
                      unit="kg"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {hasPRs && (
            <div className="rounded-2xl bg-card p-4 ring-1 ring-border/50">
              <div className="mb-3 flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10">
                  <Trophy className="h-3.5 w-3.5 text-amber-500" />
                </div>
                <span className="text-sm font-semibold">Personal Records</span>
              </div>
              <div className="space-y-2">
                {prs.map((pr, i) => (
                  <div key={pr.exerciseName} className="flex items-center gap-3">
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                        i === 0
                          ? 'bg-amber-400/20 text-amber-400'
                          : i === 1
                            ? 'bg-zinc-400/20 text-zinc-400'
                            : i === 2
                              ? 'bg-orange-700/20 text-orange-700'
                              : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{pr.exerciseName}</p>
                      <p className="text-[10px] text-muted-foreground">{pr.muscle}</p>
                    </div>
                    <div className="flex items-center gap-1 rounded-lg bg-muted/60 px-2.5 py-1">
                      <span className="text-sm font-bold">{pr.maxWeightKg}</span>
                      <span className="text-[10px] text-muted-foreground">kg</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Sessions ring + stats ── */}
      <div className="rounded-2xl bg-card p-5 ring-1 ring-border/50">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Sessions
          </h2>
          <span className="text-xs text-muted-foreground">This month</span>
        </div>
        <div className="mt-4 flex items-center gap-6">
          {/* Progress ring — arc + centre both reflect session usage */}
          <div className="relative flex h-28 w-28 shrink-0 items-center justify-center">
            <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke="currentColor"
                strokeWidth="8"
                className="text-muted/50"
              />
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke="currentColor"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${usedPct * 2.64} ${264 - usedPct * 2.64}`}
                className="text-primary transition-all duration-700"
              />
            </svg>
            <div className="absolute flex flex-col items-center">
              <span className="text-2xl font-bold">{sessionCount.used}</span>
              <span className="text-[10px] text-muted-foreground">of {sessionCount.total}</span>
            </div>
          </div>
          {/* Stats grid */}
          <div className="grid flex-1 grid-cols-2 gap-3">
            <StatPill
              icon={<Dumbbell className="h-3.5 w-3.5" />}
              label="Used"
              value={sessionCount.used}
              color="text-primary"
              bgColor="bg-primary/10"
            />
            <StatPill
              icon={<Calendar className="h-3.5 w-3.5" />}
              label="Remaining"
              value={sessionCount.remaining}
              color="text-emerald-500"
              bgColor="bg-emerald-500/10"
            />
            <StatPill
              icon={<Target className="h-3.5 w-3.5" />}
              label="Total"
              value={sessionCount.total}
              color="text-blue-500"
              bgColor="bg-blue-500/10"
            />
            <StatPill
              icon={<RefreshCw className="h-3.5 w-3.5" />}
              label="Carry Fwd"
              value={sessionCount.carryForward}
              color="text-amber-500"
              bgColor="bg-amber-500/10"
            />
          </div>
        </div>
      </div>

      {/* ── Next session + Trainer (merged card) ── */}
      <div className="rounded-2xl bg-card ring-1 ring-border/50 overflow-hidden">
        {/* Next session header */}
        <div className="flex items-center gap-2 px-5 pt-5 pb-3">
          <Zap className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Next Session
          </h2>
        </div>

        {nextSession ? (
          <button
            type="button"
            onClick={() => router.push(`/client/session/${nextSession.id}`)}
            className="w-full flex items-center gap-4 px-5 pb-5 text-left transition-colors hover:bg-muted/20 active:bg-muted/30"
          >
            {/* Date badge */}
            <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-primary/10">
              <span className="text-lg font-bold text-primary leading-none">
                {localDate(nextSession.scheduledDate).getDate()}
              </span>
              <span className="text-[10px] font-medium uppercase text-primary/70">
                {localDate(nextSession.scheduledDate).toLocaleDateString('en-IN', {
                  month: 'short',
                })}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="font-semibold">{relativeDay(nextSession.scheduledDate)}</p>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                  {nextSession.durationMin} min
                </span>
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                <Clock className="h-3 w-3" />
                {formatTime(nextSession.scheduledTime)}
              </div>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        ) : (
          <div className="flex flex-col items-center gap-2 px-5 pb-5 text-center">
            <Calendar className="h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">No upcoming sessions scheduled</p>
          </div>
        )}

        {/* Divider + Trainer row */}
        {trainer && (
          <>
            <div className="mx-5 border-t border-border/50" />
            <div className="flex items-center gap-3 px-5 py-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold text-foreground">
                {initials(trainer.name)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{trainer.name}</p>
                <p className="text-xs text-muted-foreground">
                  {trainer.sessionsPerMonth} sessions/month
                </p>
              </div>
            </div>
          </>
        )}
      </div>

      {/* No-show warning */}
      {sessionCount.noShow > 0 && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-500/20 bg-red-500/5 p-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-500/15">
            <AlertCircle className="h-4 w-4 text-red-500" />
          </div>
          <div>
            <p className="text-sm font-medium">
              {sessionCount.noShow} no-show session{sessionCount.noShow > 1 ? 's' : ''}
            </p>
            <p className="text-xs text-muted-foreground">Counted as used this month</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Engagement strip ─────────────────────────────────────────────────────────

function EngagementStrip({ stats }: { stats: EngagementStats }) {
  const tiles: {
    icon: React.ReactNode;
    label: string;
    value: string;
    sub?: string;
    color: string;
    bg: string;
  }[] = [];

  // Streak — only show if > 1 (a single session isn't a streak)
  if (stats.streak >= 2) {
    tiles.push({
      icon: <Flame className="h-4 w-4" />,
      label: 'Streak',
      value: `${stats.streak}`,
      sub: 'sessions',
      color: 'text-orange-500',
      bg: 'bg-orange-500/10',
    });
  }

  // All-time sessions
  if (stats.allTimeCompleted > 0) {
    tiles.push({
      icon: <Award className="h-4 w-4" />,
      label: 'All-time',
      value: `${stats.allTimeCompleted}`,
      sub: stats.allTimeCompleted === 1 ? 'session' : 'sessions',
      color: 'text-violet-500',
      bg: 'bg-violet-500/10',
    });
  }

  // Attendance rate
  if (stats.monthAttendanceRate != null) {
    const good = stats.monthAttendanceRate >= 80;
    tiles.push({
      icon: <CheckCircle className="h-4 w-4" />,
      label: 'Attendance',
      value: `${stats.monthAttendanceRate}%`,
      sub: 'this month',
      color: good ? 'text-emerald-500' : 'text-amber-500',
      bg: good ? 'bg-emerald-500/10' : 'bg-amber-500/10',
    });
  }

  // Days since last session
  if (stats.daysSinceLastSession != null) {
    const fresh = stats.daysSinceLastSession <= 3;
    tiles.push({
      icon: <TimerReset className="h-4 w-4" />,
      label: 'Last session',
      value: stats.daysSinceLastSession === 0 ? 'Today' : `${stats.daysSinceLastSession}d ago`,
      sub: undefined,
      color: fresh ? 'text-emerald-500' : 'text-amber-500',
      bg: fresh ? 'bg-emerald-500/10' : 'bg-amber-500/10',
    });
  }

  if (tiles.length === 0) return null;

  return (
    <div
      className="grid gap-3"
      style={{ gridTemplateColumns: `repeat(${tiles.length}, minmax(0, 1fr))` }}
    >
      {tiles.map((t) => (
        <div
          key={t.label}
          className="flex flex-col gap-1.5 rounded-2xl bg-card p-3.5 ring-1 ring-border/50"
        >
          <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${t.bg} ${t.color}`}>
            {t.icon}
          </div>
          <p className="mt-0.5 text-[10px] text-muted-foreground">{t.label}</p>
          <p className="text-xl font-bold leading-none truncate">{t.value}</p>
          {t.sub && <p className="text-[10px] text-muted-foreground truncate">{t.sub}</p>}
        </div>
      ))}
    </div>
  );
}

// ─── StatPill ─────────────────────────────────────────────────────────────────

function StatPill({
  icon,
  label,
  value,
  color,
  bgColor,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
  bgColor: string;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl bg-muted/40 px-3 py-2.5">
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${bgColor} ${color}`}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-lg font-bold leading-none">{value}</p>
        <p className="mt-0.5 text-[10px] text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}
