'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { usePusherChannel } from '@/hooks/usePusherChannel';
import type { SessionStartedPayload } from '@/lib/pusher';
import {
  AlertCircle,
  ArrowRight,
  Award,
  Calendar,
  Clock,
  Dumbbell,
  Flame,
  RefreshCw,
  Sparkles,
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
import { BadgeCelebration } from '@/components/badges/BadgeCelebration';
import { WorkoutCalendarCard } from '@/components/calendar/WorkoutCalendarCard';
import Image from 'next/image';
import Link from 'next/link';

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

interface PackageExpiry {
  daysUntilExpiry: number | null;
  isExpired: boolean;
  endDate: string | null;
  startDate: string | null;
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
  packageExpiry: PackageExpiry | null;
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
  const [earnedBadges, setEarnedBadges] = useState<
    {
      id: string;
      awardedAt: string;
      badgeDefinition: { name: string; icon: string; imageUrl?: string | null };
    }[]
  >([]);
  const [celebrationBadges, setCelebrationBadges] = useState<
    { name: string; icon: string; description?: string; imageUrl?: string }[]
  >([]);

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

  // Real-time: when active session starts/ends, refresh dashboard so timer appears/disappears
  const activeSessionId = data?.activeSession?.id ?? null;
  usePusherChannel(activeSessionId ? `session-${activeSessionId}` : null, {
    SESSION_STARTED: (_data) => {
      const payload = _data as SessionStartedPayload;
      setData((prev) =>
        prev?.activeSession
          ? { ...prev, activeSession: { ...prev.activeSession, startedAt: payload.startedAt } }
          : prev,
      );
    },
    SESSION_ENDED: () => {
      // Refresh dashboard to clear the active session banner
      void fetchDashboard();
    },
  });

  useEffect(() => {
    fetchDashboard();
    // Fetch earned badges for dashboard showcase
    fetch('/api/client/badges')
      .then((r) => r.json())
      .then(({ data: bd }) => setEarnedBadges(bd?.earned ?? []))
      .catch(() => {});
    // Fetch unseen badges for celebration
    fetch('/api/client/badges/unseen')
      .then((r) => r.json())
      .then(({ data: unseen }) => {
        if (unseen?.length > 0) {
          setCelebrationBadges(
            unseen.map(
              (b: {
                badgeDefinition: {
                  name: string;
                  icon: string;
                  description: string;
                  imageUrl?: string;
                };
              }) => ({
                name: b.badgeDefinition.name,
                icon: b.badgeDefinition.icon,
                description: b.badgeDefinition.description,
                imageUrl: b.badgeDefinition.imageUrl,
              }),
            ),
          );
        }
      })
      .catch(() => {});
  }, [fetchDashboard]);

  const firstName = session?.user?.firstName ?? 'there';

  if (loading) {
    return <DashboardSkeleton />;
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
    packageExpiry,
    latestProgress,
    prevProgress,
    prs,
    nextSession,
    activeSession,
    trainer,
  } = data;

  const hasPackageExpiry = packageExpiry?.endDate != null;

  const usedPct =
    sessionCount.total > 0 ? Math.round((sessionCount.used / sessionCount.total) * 100) : 0;

  const hasWeight = latestProgress?.weightKg != null;
  const hasBodyFat = latestProgress?.bodyFatPercent != null;
  const hasMuscle = latestProgress?.muscleMass != null;
  const hasBodyMetrics = hasWeight || hasBodyFat || hasMuscle;
  const hasPRs = prs.length > 0;
  const showFitnessJourney = hasBodyMetrics || hasPRs;

  function handleCelebrationDone() {
    setCelebrationBadges([]);
    // Mark all as seen so they don't replay next visit
    fetch('/api/client/badges/mark-seen', { method: 'POST' }).catch(() => {});
    // Refresh earned badges list
    fetch('/api/client/badges')
      .then((r) => r.json())
      .then(({ data: bd }) => setEarnedBadges(bd?.earned ?? []))
      .catch(() => {});
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5 pb-8">
      {/* ── Badge celebration overlay ── */}
      {celebrationBadges.length > 0 && (
        <BadgeCelebration badges={celebrationBadges} onDone={handleCelebrationDone} />
      )}

      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Hey, {firstName}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Here&apos;s your fitness overview</p>
      </div>

      {/* ── Package status card (always shown when end date is set) ── */}
      {hasPackageExpiry && packageExpiry && <PackageStatusCard expiry={packageExpiry} />}

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
                  variant="onAccent"
                />
              </div>
            </div>
          </div>
        </button>
      )}

      {/* ── Workout calendar (PT session days + PR days) ── */}
      <WorkoutCalendarCard />

      {/* ── Engagement stats strip ── */}
      <EngagementStrip stats={engagementStats} />

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

      {/* ── Earned Badges ── */}
      {earnedBadges.length > 0 && (
        <div className="rounded-2xl bg-card p-4 ring-1 ring-border/50">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10">
                <Award className="h-3.5 w-3.5 text-amber-500" />
              </div>
              <span className="text-sm font-semibold">Badges Earned</span>
              <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-500">
                {earnedBadges.length}
              </span>
            </div>
            <Link
              href="/client/badges"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              View all <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {earnedBadges.slice(0, 6).map((b) => (
              <div
                key={b.id}
                className="flex flex-col items-center gap-1.5 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 min-w-[80px]"
              >
                {b.badgeDefinition.imageUrl ? (
                  <Image
                    src={b.badgeDefinition.imageUrl}
                    alt={b.badgeDefinition.name}
                    width={32}
                    height={32}
                    className="object-contain"
                  />
                ) : (
                  <span className="text-2xl">{b.badgeDefinition.icon}</span>
                )}
                <span className="text-[10px] font-medium text-center leading-tight line-clamp-2">
                  {b.badgeDefinition.name}
                </span>
              </div>
            ))}
          </div>
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
        <div className="mt-4 flex items-center gap-4">
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
          <div className="grid min-w-0 flex-1 grid-cols-2 gap-3">
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

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Bone({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-muted/60 ${className ?? ''}`} />;
}

function DashboardSkeleton() {
  return (
    <div className="mx-auto max-w-2xl space-y-5 pb-8">
      {/* Greeting */}
      <div className="space-y-2">
        <Bone className="h-7 w-40" />
        <Bone className="h-4 w-52" />
      </div>

      {/* Workout calendar card */}
      <div className="rounded-2xl bg-card p-4 ring-1 ring-border/50 space-y-3">
        <Bone className="mx-auto h-5 w-32" />
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 28 }).map((_, i) => (
            <Bone key={i} className="mx-auto h-9 w-9 rounded-full" />
          ))}
        </div>
      </div>

      {/* Engagement strip — 3 tiles */}
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-2xl bg-card p-3.5 ring-1 ring-border/50 space-y-2">
            <Bone className="h-8 w-8 rounded-xl" />
            <Bone className="h-2.5 w-12" />
            <Bone className="h-6 w-10" />
            <Bone className="h-2 w-14" />
          </div>
        ))}
      </div>

      {/* Fitness Journey header */}
      <div className="flex items-center justify-between">
        <Bone className="h-3.5 w-32" />
        <Bone className="h-3.5 w-20" />
      </div>

      {/* Body metric cards */}
      <div className="grid grid-cols-2 gap-3">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-2xl bg-card p-4 ring-1 ring-border/50 space-y-3">
            <div className="flex items-center gap-2">
              <Bone className="h-8 w-8 rounded-xl" />
              <Bone className="h-3 w-14" />
            </div>
            <Bone className="h-8 w-24" />
            <Bone className="h-3 w-16" />
          </div>
        ))}
      </div>

      {/* PR card */}
      <div className="rounded-2xl bg-card p-4 ring-1 ring-border/50 space-y-3">
        <div className="flex items-center gap-2">
          <Bone className="h-7 w-7 rounded-lg" />
          <Bone className="h-4 w-32" />
        </div>
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <Bone className="h-5 w-5 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Bone className="h-3.5 w-28" />
              <Bone className="h-2.5 w-16" />
            </div>
            <Bone className="h-7 w-16 rounded-lg" />
          </div>
        ))}
      </div>

      {/* Sessions ring card */}
      <div className="rounded-2xl bg-card p-5 ring-1 ring-border/50">
        <div className="flex items-center justify-between mb-4">
          <Bone className="h-3.5 w-20" />
          <Bone className="h-3.5 w-20" />
        </div>
        <div className="flex items-center gap-4">
          <Bone className="h-28 w-28 shrink-0 rounded-full" />
          <div className="grid min-w-0 flex-1 grid-cols-2 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="min-w-0 rounded-xl bg-muted/40 px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <Bone className="h-7 w-7 shrink-0 rounded-lg" />
                  <Bone className="h-5 w-6" />
                </div>
                <Bone className="mt-1.5 h-2.5 w-12" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Next session card */}
      <div className="rounded-2xl bg-card ring-1 ring-border/50 overflow-hidden">
        <div className="flex items-center gap-2 px-5 pt-5 pb-3">
          <Bone className="h-4 w-4 rounded" />
          <Bone className="h-3.5 w-28" />
        </div>
        <div className="flex items-center gap-4 px-5 pb-5">
          <Bone className="h-14 w-14 shrink-0 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Bone className="h-4 w-24" />
            <Bone className="h-3.5 w-16" />
          </div>
          <Bone className="h-4 w-4 rounded" />
        </div>
        <div className="mx-5 border-t border-border/50" />
        <div className="flex items-center gap-3 px-5 py-4">
          <Bone className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Bone className="h-3.5 w-28" />
            <Bone className="h-3 w-20" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Package expired card ─────────────────────────────────────────────────────

// ─── Package status card (all states) ────────────────────────────────────────

function PackageStatusCard({ expiry }: { expiry: PackageExpiry }) {
  const { daysUntilExpiry, isExpired, endDate, startDate } = expiry;

  // Progress along package lifetime — derived from daysUntilExpiry to avoid Date.now()
  let progressPct = 0;
  if (startDate && endDate && daysUntilExpiry !== null) {
    const totalDays = Math.round(
      (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86_400_000,
    );
    if (totalDays > 0) {
      const usedDays = totalDays - daysUntilExpiry;
      progressPct = Math.min(100, Math.max(0, Math.round((usedDays / totalDays) * 100)));
    }
  }

  const isUrgent = !isExpired && daysUntilExpiry !== null && daysUntilExpiry <= 7;
  const endFormatted = endDate
    ? new Date(endDate).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null;

  // ── Expired state: fun full card ───────────────────────────────────────────
  if (isExpired) {
    const messages = [
      {
        emoji: '🏋️',
        headline: "You've been benched!",
        sub: "But only temporarily — let's fix that.",
      },
      { emoji: '😴', headline: 'Permanent rest day?', sub: 'Your body disagrees. Time to renew!' },
      {
        emoji: '🦺',
        headline: 'Gains are waiting.',
        sub: 'Your package expired. The gym misses you.',
      },
    ];
    const msg = messages[new Date().getDate() % messages.length]!;
    return (
      <div
        className="relative overflow-hidden rounded-2xl p-5 text-white"
        style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 40%, #0f3460 100%)' }}
      >
        <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-purple-500/20 blur-2xl" />
        <div className="absolute -left-4 -bottom-6 h-24 w-24 rounded-full bg-orange-500/20 blur-2xl" />
        <div className="relative">
          <div className="flex items-start justify-between">
            <div className="text-4xl animate-bounce">{msg.emoji}</div>
            <div className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider">
              Package Expired
            </div>
          </div>
          <div className="mt-3">
            <p className="text-lg font-bold leading-snug">{msg.headline}</p>
            <p className="mt-1 text-sm text-white/70">{msg.sub}</p>
          </div>
          <div className="mt-4 space-y-1">
            <div className="flex items-center justify-between text-[11px] text-white/60">
              <span>Package active</span>
              <span className="font-semibold text-red-400">
                Expired{endFormatted ? ` · ${endFormatted}` : ''}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div className="h-full w-full rounded-full bg-gradient-to-r from-red-500 to-orange-400" />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-white/10 px-4 py-3 ring-1 ring-white/20 backdrop-blur-sm">
            <Sparkles className="h-4 w-4 shrink-0 text-amber-400" />
            <p className="text-sm text-white/90">
              Contact your gym admin to renew your PT package and get back on track.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Active with end date: countdown card ──────────────────────────────────
  const barColor = isUrgent
    ? 'bg-gradient-to-r from-red-500 to-orange-400'
    : progressPct >= 75
      ? 'bg-gradient-to-r from-amber-500 to-yellow-400'
      : 'bg-gradient-to-r from-primary to-primary/70';

  return (
    <div
      className={`rounded-2xl p-4 ring-1 ${
        isUrgent ? 'bg-red-500/10 ring-red-500/30' : 'bg-card ring-border/50'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">{isUrgent ? '⏰' : '📦'}</span>
          <span className="text-sm font-semibold">PT Package</span>
        </div>
        <span
          className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
            isUrgent ? 'bg-red-500/15 text-red-400' : 'bg-emerald-500/15 text-emerald-400'
          }`}
        >
          {isUrgent ? 'Expiring soon' : 'Active'}
        </span>
      </div>

      {/* Countdown */}
      <div className="mt-3 flex items-end justify-between">
        <div>
          <p
            className={`text-3xl font-bold leading-none ${isUrgent ? 'text-red-400' : 'text-foreground'}`}
          >
            {daysUntilExpiry === 0 ? 'Today' : daysUntilExpiry === 1 ? '1' : daysUntilExpiry}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {daysUntilExpiry === 0
              ? 'expires today'
              : daysUntilExpiry === 1
                ? 'day left'
                : 'days remaining'}
          </p>
        </div>
        {endFormatted && <p className="text-[11px] text-muted-foreground">Ends {endFormatted}</p>}
      </div>

      {/* Progress bar */}
      <div className="mt-3 space-y-1">
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted/60">
          <div
            className={`h-full rounded-full transition-all duration-700 ${barColor}`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <p className="text-[10px] text-muted-foreground text-right">
          {progressPct}% of package used
        </p>
      </div>

      {isUrgent && (
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-red-500/10 px-3 py-2.5">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-red-400" />
          <p className="text-xs text-red-300">Contact your admin to renew before it lapses.</p>
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
    <div className="min-w-0 rounded-xl bg-muted/40 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <div
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${bgColor} ${color}`}
        >
          {icon}
        </div>
        <p className="text-lg font-bold leading-none">{value}</p>
      </div>
      <p className="mt-1.5 truncate text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}
