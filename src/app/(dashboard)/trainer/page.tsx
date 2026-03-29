'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Play,
  Square,
  UserX,
  Clock,
  CheckCircle2,
  XCircle,
  CalendarDays,
  TrendingUp,
  ExternalLink,
  Eye,
} from 'lucide-react';
import { toast } from 'sonner';
import { useConfirm } from '@/hooks/use-confirm';
import { InlineTimer } from '@/components/timer/SessionTimer';

interface SessionData {
  id: string;
  scheduledDate: string;
  scheduledTime: string;
  durationMin: number;
  status: string;
  startedAt?: string;
  client: {
    id: string;
    user: { firstName: string; lastName: string };
  };
  trainer: {
    user: { firstName: string; lastName: string };
  };
}

function toLocalDateStr(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-CA');
}

function formatTime12(t: string) {
  const [h = '0', m = '00'] = t.split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

function formatDisplayDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

const STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  SCHEDULED: { bg: 'bg-blue-500/10', text: 'text-blue-500', label: 'Scheduled' },
  IN_PROGRESS: { bg: 'bg-emerald-500/10', text: 'text-emerald-500', label: 'In Progress' },
  COMPLETED: { bg: 'bg-zinc-500/10', text: 'text-zinc-400', label: 'Completed' },
  NO_SHOW: { bg: 'bg-red-500/10', text: 'text-red-500', label: 'No Show' },
  CANCELLED: { bg: 'bg-zinc-500/10', text: 'text-zinc-400', label: 'Cancelled' },
};

export default function TrainerDashboard() {
  const { confirm, ConfirmDialog } = useConfirm();
  const router = useRouter();

  const [todaySessions, setTodaySessions] = useState<SessionData[]>([]);
  const [upcomingSessions, setUpcomingSessions] = useState<SessionData[]>([]);
  const [monthSessions, setMonthSessions] = useState<SessionData[]>([]);
  const [activeSession, setActiveSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    const now = new Date();
    const today = now.toLocaleDateString('en-CA');
    const tomorrowDate = new Date(now);
    tomorrowDate.setDate(now.getDate() + 1);
    const tomorrow = tomorrowDate.toLocaleDateString('en-CA');
    const futureDate = new Date(now);
    futureDate.setDate(now.getDate() + 14);
    const future = futureDate.toLocaleDateString('en-CA');
    const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    try {
      const [todayRes, upcomingRes, monthRes] = await Promise.all([
        fetch(`/api/trainer/schedule?date=${today}`),
        fetch(`/api/trainer/schedule?dateFrom=${tomorrow}&dateTo=${future}`),
        fetch(`/api/trainer/schedule?month=${monthStr}`),
      ]);
      if (todayRes.ok) {
        const { data } = await todayRes.json();
        setTodaySessions(data);
        const active = data.find((s: SessionData) => s.status === 'IN_PROGRESS');
        if (active) {
          const detailRes = await fetch(`/api/trainer/sessions/${active.id}`);
          setActiveSession(detailRes.ok ? (await detailRes.json()).data : active);
        }
      }
      if (upcomingRes.ok) {
        const { data } = await upcomingRes.json();
        setUpcomingSessions(data.filter((s: SessionData) => s.status === 'SCHEDULED'));
      }
      if (monthRes.ok) {
        const { data } = await monthRes.json();
        setMonthSessions(data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  async function handleStartSession(sessionId: string) {
    setActionLoading(sessionId);
    try {
      const res = await fetch(`/api/trainer/sessions/${sessionId}/start`, { method: 'POST' });
      if (res.ok) {
        router.push(`/trainer/session/${sessionId}`);
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to start session');
        setActionLoading(null);
      }
    } catch {
      setActionLoading(null);
    }
  }

  async function handleNoShow(sessionId: string) {
    const ok = await confirm({
      title: 'Mark No-Show',
      description: 'Mark this client as no-show? This counts as a used session.',
      confirmText: 'Mark No-Show',
      variant: 'destructive',
    });
    if (!ok) return;
    setActionLoading(sessionId);
    try {
      const res = await fetch(`/api/trainer/sessions/${sessionId}/no-show`, { method: 'POST' });
      if (res.ok) {
        fetchAll();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to mark no-show');
      }
    } finally {
      setActionLoading(null);
    }
  }

  // Derived stats
  const totalMonth = monthSessions.length;
  const completedMonth = monthSessions.filter((s) => s.status === 'COMPLETED').length;
  const noShowMonth = monthSessions.filter((s) => s.status === 'NO_SHOW').length;
  const scheduledMonth = monthSessions.filter((s) => s.status === 'SCHEDULED').length;
  const completionRate =
    completedMonth + noShowMonth > 0
      ? Math.round((completedMonth / (completedMonth + noShowMonth)) * 100)
      : 0;

  const upcomingByDate = upcomingSessions.reduce<Record<string, SessionData[]>>((acc, s) => {
    const d = toLocalDateStr(s.scheduledDate);
    if (!acc[d]) acc[d] = [];
    acc[d]!.push(s);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl space-y-5 pb-8">
        <div className="h-8 w-52 animate-pulse rounded-lg bg-muted" />
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
        <div className="h-48 animate-pulse rounded-2xl bg-muted" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5 pb-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Trainer Dashboard</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {new Date().toLocaleDateString('en-IN', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </p>
      </div>

      {/* Stats 2×2 */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          icon={<CalendarDays className="h-4 w-4 text-blue-500" />}
          iconBg="bg-blue-500/10"
          value={totalMonth}
          label="Sessions this month"
        />
        <StatCard
          icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />}
          iconBg="bg-emerald-500/10"
          value={completedMonth}
          label="Completed"
        />
        <StatCard
          icon={<XCircle className="h-4 w-4 text-red-500" />}
          iconBg="bg-red-500/10"
          value={noShowMonth}
          label="No-shows"
        />
        <StatCard
          icon={<TrendingUp className="h-4 w-4 text-amber-500" />}
          iconBg="bg-amber-500/10"
          value={`${completionRate}%`}
          label="Completion rate"
        />
      </div>

      {/* Active session banner */}
      {activeSession && activeSession.startedAt && (
        <button
          onClick={() => router.push(`/trainer/session/${activeSession.id}`)}
          className="w-full rounded-2xl bg-emerald-500/10 p-4 text-left ring-2 ring-emerald-500/40 transition-colors hover:bg-emerald-500/15"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
              <div>
                <p className="text-sm font-semibold text-emerald-500">Session in progress</p>
                <p className="text-xs text-muted-foreground">
                  {activeSession.client.user.firstName} {activeSession.client.user.lastName}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-lg font-bold tabular-nums text-emerald-500">
                <InlineTimer
                  startedAt={activeSession.startedAt}
                  expectedDurationMin={activeSession.durationMin}
                />
              </span>
              <ExternalLink className="h-4 w-4 text-emerald-500" />
            </div>
          </div>
        </button>
      )}

      {/* Today's Sessions */}
      <div className="rounded-2xl bg-card ring-1 ring-border/50">
        {/* Card header */}
        <div className="flex items-center gap-2 px-4 pt-4 pb-3">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold">Today&apos;s Sessions</h2>
          {todaySessions.length > 0 && (
            <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
              {todaySessions.length}
            </span>
          )}
        </div>

        {todaySessions.length === 0 ? (
          <p className="px-4 pb-5 text-center text-sm text-muted-foreground">
            No sessions scheduled for today.
          </p>
        ) : (
          <div className="divide-y divide-border/40">
            {todaySessions.map((session) => {
              const st = STATUS_STYLE[session.status] ?? STATUS_STYLE.SCHEDULED!;
              const isLoading = actionLoading === session.id;
              return (
                <div key={session.id} className="px-4 py-3">
                  {/* Top row: name + status */}
                  <div className="flex items-center gap-2">
                    <p className="flex-1 truncate font-medium text-sm">
                      {session.client.user.firstName} {session.client.user.lastName}
                    </p>
                    <span
                      className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold ${st.bg} ${st.text}`}
                    >
                      {st.label}
                    </span>
                  </div>
                  {/* Time */}
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatTime12(session.scheduledTime)} &middot; {session.durationMin} min
                  </p>
                  {/* Action buttons — full width row below */}
                  {session.status === 'SCHEDULED' && (
                    <div className="mt-2.5 flex gap-2">
                      <button
                        onClick={() => handleStartSession(session.id)}
                        disabled={isLoading}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                      >
                        <Play className="h-3 w-3" />
                        {isLoading ? 'Starting…' : 'Start Session'}
                      </button>
                      <button
                        onClick={() => handleNoShow(session.id)}
                        disabled={isLoading}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-red-500/10 py-2 text-xs font-semibold text-red-500 ring-1 ring-red-500/30 transition-colors hover:bg-red-500/20 disabled:opacity-50"
                      >
                        <UserX className="h-3 w-3" />
                        No Show
                      </button>
                    </div>
                  )}
                  {session.status === 'IN_PROGRESS' && (
                    <button
                      onClick={() => router.push(`/trainer/session/${session.id}`)}
                      className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-700"
                    >
                      <Square className="h-3 w-3" />
                      Resume Session
                    </button>
                  )}
                  {session.status === 'COMPLETED' && (
                    <button
                      onClick={() => router.push(`/trainer/sessions/${session.id}`)}
                      className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl bg-muted py-2 text-xs font-semibold text-foreground ring-1 ring-border/50 transition-colors hover:bg-muted/80"
                    >
                      <Eye className="h-3 w-3" />
                      View Workout
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Upcoming Sessions */}
      <div className="rounded-2xl bg-card ring-1 ring-border/50">
        {/* Card header */}
        <div className="flex items-center gap-2 px-4 pt-4 pb-3">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold">Upcoming</h2>
          <span className="text-xs text-muted-foreground">· next 14 days</span>
          {scheduledMonth > 0 && (
            <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
              {scheduledMonth} this month
            </span>
          )}
        </div>

        {Object.keys(upcomingByDate).length === 0 ? (
          <p className="px-4 pb-5 text-center text-sm text-muted-foreground">
            No upcoming sessions in the next 14 days.
          </p>
        ) : (
          <div className="divide-y divide-border/40">
            {Object.entries(upcomingByDate).map(([date, sessions]) => (
              <div key={date} className="px-4 py-3">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {formatDisplayDate(date)}
                </p>
                <div className="space-y-2">
                  {sessions.map((session) => (
                    <div
                      key={session.id}
                      className="flex items-center gap-3 rounded-xl bg-muted/20 px-3 py-2.5 ring-1 ring-border/30"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10">
                        <Clock className="h-3.5 w-3.5 text-blue-500" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {session.client.user.firstName} {session.client.user.lastName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatTime12(session.scheduledTime)} &middot; {session.durationMin} min
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full bg-blue-500/10 px-2.5 py-0.5 text-[10px] font-medium text-blue-500">
                        Scheduled
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {ConfirmDialog}
    </div>
  );
}

function StatCard({
  icon,
  iconBg,
  value,
  label,
}: {
  icon: React.ReactNode;
  iconBg: string;
  value: string | number;
  label: string;
}) {
  return (
    <div className="rounded-2xl bg-card p-4 ring-1 ring-border/50">
      <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${iconBg}`}>{icon}</div>
      <p className="mt-3 text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
