'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import {
  AlertCircle,
  ArrowRight,
  Calendar,
  Clock,
  Dumbbell,
  Flame,
  RefreshCw,
  Target,
  User,
  Zap,
} from 'lucide-react';
import { SessionTimer } from '@/components/timer/SessionTimer';

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
  nextSession?: {
    id: string;
    scheduledDate: string;
    scheduledTime: string;
    durationMin: number;
    trainer: {
      user: { firstName: string; lastName: string };
    };
  };
  activeSession?: {
    id: string;
    startedAt: string;
    durationMin: number;
    trainer: {
      user: { firstName: string; lastName: string };
    };
  };
  trainer?: {
    name: string;
    sessionsPerMonth: number;
  };
}

export default function ClientDashboard() {
  const { data: session } = useSession();
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

  function formatDate(dateStr: string) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  }

  function formatTime(timeStr: string) {
    const [h = '0', m = '00'] = timeStr.split(':');
    const hour = parseInt(h, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const h12 = hour % 12 || 12;
    return `${h12}:${m} ${ampm}`;
  }

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
            <RefreshCw className="h-3.5 w-3.5" />
            Try again
          </button>
        </div>
      </div>
    );
  }

  const usedPct =
    data.sessionCount.total > 0
      ? Math.round((data.sessionCount.used / data.sessionCount.total) * 100)
      : 0;

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-8">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Hey, {firstName}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Here&apos;s your fitness overview</p>
      </div>

      {/* Active session — hero banner */}
      {data.activeSession && (
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600 p-5 text-white shadow-lg">
          <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/10" />
          <div className="absolute -right-2 -bottom-8 h-32 w-32 rounded-full bg-white/5" />
          <div className="relative">
            <div className="flex items-center gap-2">
              <div className="flex h-2 w-2 animate-pulse rounded-full bg-white" />
              <span className="text-xs font-semibold uppercase tracking-wider text-white/90">
                Session in progress
              </span>
            </div>
            <p className="mt-3 text-sm text-white/80">
              Training with{' '}
              <span className="font-semibold text-white">
                {data.activeSession.trainer.user.firstName}{' '}
                {data.activeSession.trainer.user.lastName}
              </span>
            </p>
            <div className="mt-4 flex justify-center">
              <SessionTimer
                startedAt={data.activeSession.startedAt}
                expectedDurationMin={data.activeSession.durationMin}
                size="lg"
              />
            </div>
          </div>
        </div>
      )}

      {/* Session progress ring + stats */}
      <div className="rounded-2xl bg-card p-5 ring-1 ring-border/50">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Sessions
          </h2>
          <span className="text-xs text-muted-foreground">This month</span>
        </div>

        <div className="mt-4 flex items-center gap-6">
          {/* Progress ring */}
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
              <span className="text-2xl font-bold">{data.sessionCount.used}</span>
              <span className="text-[10px] text-muted-foreground">
                of {data.sessionCount.total}
              </span>
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid flex-1 grid-cols-2 gap-3">
            <StatPill
              icon={<Dumbbell className="h-3.5 w-3.5" />}
              label="Used"
              value={data.sessionCount.used}
              color="text-primary"
              bgColor="bg-primary/10"
            />
            <StatPill
              icon={<Calendar className="h-3.5 w-3.5" />}
              label="Remaining"
              value={data.sessionCount.remaining}
              color="text-emerald-500"
              bgColor="bg-emerald-500/10"
            />
            <StatPill
              icon={<Target className="h-3.5 w-3.5" />}
              label="Total"
              value={data.sessionCount.total}
              color="text-blue-500"
              bgColor="bg-blue-500/10"
            />
            <StatPill
              icon={<RefreshCw className="h-3.5 w-3.5" />}
              label="Carry Fwd"
              value={data.sessionCount.carryForward}
              color="text-amber-500"
              bgColor="bg-amber-500/10"
            />
          </div>
        </div>
      </div>

      {/* Next session card */}
      <div className="rounded-2xl bg-card p-5 ring-1 ring-border/50">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Next Session
          </h2>
        </div>

        {data.nextSession ? (
          <div className="mt-4 flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-primary/10">
              <span className="text-lg font-bold text-primary leading-none">
                {new Date(data.nextSession.scheduledDate).getDate()}
              </span>
              <span className="text-[10px] font-medium uppercase text-primary/70">
                {new Date(data.nextSession.scheduledDate).toLocaleDateString('en-IN', {
                  month: 'short',
                })}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{formatDate(data.nextSession.scheduledDate)}</p>
              <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatTime(data.nextSession.scheduledTime)}
                </span>
                <span>{data.nextSession.durationMin} min</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                with{' '}
                <span className="text-foreground">
                  {data.nextSession.trainer.user.firstName} {data.nextSession.trainer.user.lastName}
                </span>
              </p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </div>
        ) : (
          <div className="mt-4 flex flex-col items-center gap-2 py-4 text-center">
            <Calendar className="h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">No upcoming sessions scheduled</p>
          </div>
        )}
      </div>

      {/* Trainer card */}
      <div className="rounded-2xl bg-card p-5 ring-1 ring-border/50">
        <div className="flex items-center gap-2">
          <Flame className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Your Trainer
          </h2>
        </div>

        {data.trainer ? (
          <div className="mt-4 flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/5 ring-2 ring-primary/20">
              <User className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{data.trainer.name}</p>
              <p className="text-sm text-muted-foreground">
                {data.trainer.sessionsPerMonth} sessions/month
              </p>
            </div>
          </div>
        ) : (
          <div className="mt-4 flex flex-col items-center gap-2 py-4 text-center">
            <User className="h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">No trainer assigned yet</p>
          </div>
        )}
      </div>

      {/* No-show warning */}
      {data.sessionCount.noShow > 0 && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-500/20 bg-red-500/5 p-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-500/15">
            <AlertCircle className="h-4 w-4 text-red-500" />
          </div>
          <div>
            <p className="text-sm font-medium">
              {data.sessionCount.noShow} no-show session
              {data.sessionCount.noShow > 1 ? 's' : ''}
            </p>
            <p className="text-xs text-muted-foreground">Counted as used this month</p>
          </div>
        </div>
      )}
    </div>
  );
}

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
