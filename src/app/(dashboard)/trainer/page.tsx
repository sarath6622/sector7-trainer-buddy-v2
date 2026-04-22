'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  Play,
  Square,
  UserX,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  CalendarDays,
  TrendingUp,
  ExternalLink,
  Eye,
  CalendarCheck,
  UmbrellaOff,
  ChevronRight,
  Users,
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

interface ClientWithPackage {
  clientProfile: {
    id: string;
    user: { firstName: string; lastName: string };
  };
  package: {
    startDate: string;
    endDate: string | null;
    sessionsPerMonth: number;
  } | null;
  isReassigned: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toLocalDateStr(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-CA');
}

function formatTime12(t: string) {
  const [h = '0', m = '00'] = t.split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  return `${hour % 12 || 12}:${m} ${ampm}`;
}

function formatDisplayDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function initials(first: string, last: string) {
  return `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase();
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

const STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  SCHEDULED: { bg: 'bg-blue-500/10', text: 'text-blue-500', label: 'Scheduled' },
  IN_PROGRESS: { bg: 'bg-emerald-500/10', text: 'text-emerald-500', label: 'In Progress' },
  COMPLETED: { bg: 'bg-zinc-500/10', text: 'text-zinc-400', label: 'Completed' },
  NO_SHOW: { bg: 'bg-red-500/10', text: 'text-red-500', label: 'No Show' },
  CANCELLED: { bg: 'bg-zinc-500/10', text: 'text-zinc-400', label: 'Cancelled' },
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TrainerDashboard() {
  const { confirm, ConfirmDialog } = useConfirm();
  const router = useRouter();
  const { data: authSession } = useSession();
  const firstName = authSession?.user?.firstName ?? 'Trainer';

  const [todaySessions, setTodaySessions] = useState<SessionData[]>([]);
  const [staleSessions, setStaleSessions] = useState<SessionData[]>([]);
  const [upcomingSessions, setUpcomingSessions] = useState<SessionData[]>([]);
  const [monthSessions, setMonthSessions] = useState<SessionData[]>([]);
  const [activeSession, setActiveSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [clients, setClients] = useState<ClientWithPackage[]>([]);

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
      const [todayRes, upcomingRes, monthRes, staleRes, clientsRes] = await Promise.all([
        fetch(`/api/trainer/schedule?date=${today}`),
        fetch(`/api/trainer/schedule?dateFrom=${tomorrow}&dateTo=${future}`),
        fetch(`/api/trainer/schedule?month=${monthStr}`),
        fetch(`/api/trainer/schedule?status=IN_PROGRESS`),
        fetch('/api/trainer/clients'),
      ]);
      let todayHasActive = false;
      if (todayRes.ok) {
        const { data } = await todayRes.json();
        setTodaySessions(data);
        const todayActive = (data as SessionData[]).find((s) => s.status === 'IN_PROGRESS');
        todayHasActive = !!todayActive;
        if (todayActive) {
          const detailRes = await fetch(`/api/trainer/sessions/${todayActive.id}`);
          setActiveSession(detailRes.ok ? (await detailRes.json()).data : todayActive);
        }
      }
      // Stale IN_PROGRESS sessions from past days — shown as a separate alert
      if (staleRes.ok) {
        const { data: staleData } = await staleRes.json();
        const stale = (staleData as SessionData[]).filter(
          (s) => toLocalDateStr(s.scheduledDate) !== today,
        );
        setStaleSessions(stale);
        // If no active session today, use the oldest stale one for the banner
        if (stale.length > 0 && !todayHasActive) {
          const detailRes = await fetch(`/api/trainer/sessions/${stale[0]!.id}`);
          setActiveSession(detailRes.ok ? (await detailRes.json()).data : stale[0]!);
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
      if (clientsRes.ok) {
        const { data } = await clientsRes.json();
        setClients((data as ClientWithPackage[]).filter((c) => !c.isReassigned));
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
  const completedMonth = monthSessions.filter((s) => s.status === 'COMPLETED').length;
  const noShowMonth = monthSessions.filter((s) => s.status === 'NO_SHOW').length;
  const scheduledMonth = monthSessions.filter((s) => s.status === 'SCHEDULED').length;
  const completionRate =
    completedMonth + noShowMonth > 0
      ? Math.round((completedMonth / (completedMonth + noShowMonth)) * 100)
      : null;

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
        <div className="h-16 animate-pulse rounded-2xl bg-muted" />
        <div className="h-48 animate-pulse rounded-2xl bg-muted" />
        <div className="h-32 animate-pulse rounded-2xl bg-muted" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5 pb-8">
      {/* ── Header ── */}
      <div>
        <p className="text-sm text-muted-foreground">{greeting()}</p>
        <h1 className="text-2xl font-bold tracking-tight">{firstName}</h1>
      </div>

      {/* ── Compact stats strip ── */}
      <div className="grid grid-cols-4 gap-2">
        <MiniStat
          icon={<CalendarDays className="h-3.5 w-3.5" />}
          value={monthSessions.length}
          label="Total"
          color="text-blue-500"
          bg="bg-blue-500/10"
        />
        <MiniStat
          icon={<CheckCircle2 className="h-3.5 w-3.5" />}
          value={completedMonth}
          label="Done"
          color="text-emerald-500"
          bg="bg-emerald-500/10"
        />
        <MiniStat
          icon={<XCircle className="h-3.5 w-3.5" />}
          value={noShowMonth}
          label="No-show"
          color="text-red-500"
          bg="bg-red-500/10"
        />
        <MiniStat
          icon={<TrendingUp className="h-3.5 w-3.5" />}
          value={completionRate != null ? `${completionRate}%` : '—'}
          label="Rate"
          color="text-amber-500"
          bg="bg-amber-500/10"
        />
      </div>

      {/* ── Active session banner ── */}
      {activeSession && activeSession.startedAt && (
        <button
          onClick={() => router.push(`/trainer/session/${activeSession.id}`)}
          className="w-full rounded-2xl bg-gradient-to-r from-emerald-500/15 to-emerald-500/5 p-4 text-left ring-1 ring-emerald-500/30 transition-colors hover:ring-emerald-500/50"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <div>
                <p className="text-sm font-semibold text-emerald-400">Session in progress</p>
                <p className="text-xs text-muted-foreground">
                  {activeSession.client.user.firstName} {activeSession.client.user.lastName}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-lg font-bold tabular-nums text-emerald-400">
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

      {/* ── Stale / Incomplete Sessions Alert ── */}
      {staleSessions.length > 0 && (
        <div className="rounded-2xl bg-amber-500/10 ring-1 ring-amber-500/30 overflow-hidden">
          <div className="flex items-center gap-2 px-4 pt-4 pb-3">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <h2 className="font-semibold text-amber-500">Incomplete Sessions</h2>
            <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-amber-500/20 text-[10px] font-semibold text-amber-500">
              {staleSessions.length}
            </span>
          </div>
          <p className="px-4 pb-2 text-xs text-amber-400/80">
            These sessions were never ended. Tap to resume and end them.
          </p>
          <div className="divide-y divide-amber-500/10">
            {staleSessions.map((session) => {
              const clientFirst = session.client.user.firstName;
              const clientLast = session.client.user.lastName;
              const sessionDate = new Date(session.scheduledDate).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
              });
              return (
                <div key={session.id} className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-xs font-bold text-amber-500">
                      {initials(clientFirst, clientLast)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {clientFirst} {clientLast}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {sessionDate} · {formatTime12(session.scheduledTime)} ·{' '}
                        {session.durationMin} min
                      </p>
                    </div>
                    <span className="shrink-0 rounded-md bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-500">
                      Still Active
                    </span>
                  </div>
                  <div className="mt-2.5 pl-12">
                    <button
                      onClick={() => router.push(`/trainer/session/${session.id}`)}
                      className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-amber-500 py-2 text-xs font-semibold text-black transition-colors hover:bg-amber-400"
                    >
                      <Square className="h-3 w-3" />
                      Resume &amp; End Session
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Today's Sessions ── */}
      <div className="rounded-2xl bg-card ring-1 ring-border/50 overflow-hidden">
        <div className="flex items-center gap-2 px-4 pt-4 pb-3">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold">Today</h2>
          <span className="text-xs text-muted-foreground">
            ·{' '}
            {new Date().toLocaleDateString('en-IN', {
              weekday: 'long',
              day: 'numeric',
              month: 'short',
            })}
          </span>
          {todaySessions.length > 0 && (
            <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
              {todaySessions.length}
            </span>
          )}
        </div>

        {todaySessions.length === 0 ? (
          <p className="px-4 pb-5 text-center text-sm text-muted-foreground">
            No sessions today — enjoy your rest day.
          </p>
        ) : (
          <div className="divide-y divide-border/40">
            {todaySessions.map((session) => {
              const st = STATUS_STYLE[session.status] ?? STATUS_STYLE.SCHEDULED!;
              const isLoading = actionLoading === session.id;
              const isCancelled = session.status === 'CANCELLED';
              const clientFirst = session.client.user.firstName;
              const clientLast = session.client.user.lastName;

              return (
                <div key={session.id} className={`px-4 py-3 ${isCancelled ? 'opacity-50' : ''}`}>
                  <div className="flex items-center gap-3">
                    {/* Client avatar */}
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-foreground">
                      {initials(clientFirst, clientLast)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {clientFirst} {clientLast}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatTime12(session.scheduledTime)} · {session.durationMin} min
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold ${st.bg} ${st.text}`}
                    >
                      {st.label}
                    </span>
                  </div>

                  {/* Action buttons */}
                  {session.status === 'SCHEDULED' && (
                    <div className="mt-2.5 flex gap-2 pl-12">
                      <button
                        onClick={() => handleStartSession(session.id)}
                        disabled={isLoading}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                      >
                        <Play className="h-3 w-3" />
                        {isLoading ? 'Starting…' : 'Start'}
                      </button>
                      <button
                        onClick={() => handleNoShow(session.id)}
                        disabled={isLoading}
                        className="flex items-center justify-center gap-1.5 rounded-xl bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-500 ring-1 ring-red-500/30 transition-colors hover:bg-red-500/20 disabled:opacity-50"
                      >
                        <UserX className="h-3 w-3" />
                        No Show
                      </button>
                    </div>
                  )}

                  {session.status === 'IN_PROGRESS' && (
                    <div className="mt-2.5 pl-12">
                      <button
                        onClick={() => router.push(`/trainer/session/${session.id}`)}
                        className="relative overflow-hidden flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2 text-xs font-semibold text-white transition-all hover:bg-emerald-700 active:scale-95 [touch-action:manipulation] [-webkit-tap-highlight-color:transparent]"
                      >
                        <span className="absolute inset-0 rounded-xl animate-ping bg-emerald-400 opacity-25" />
                        <Square className="relative h-3 w-3" />
                        <span className="relative">Resume Session</span>
                      </button>
                    </div>
                  )}

                  {session.status === 'COMPLETED' && (
                    <div className="mt-2 pl-12">
                      <button
                        onClick={() => router.push(`/trainer/sessions/${session.id}`)}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Eye className="h-3 w-3" />
                        View workout
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Upcoming Sessions ── */}
      <div className="rounded-2xl bg-card ring-1 ring-border/50 overflow-hidden">
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
                <div className="space-y-1.5">
                  {sessions.map((session) => (
                    <div
                      key={session.id}
                      className="flex items-center gap-3 rounded-xl bg-muted/20 px-3 py-2.5"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-bold text-foreground">
                        {initials(session.client.user.firstName, session.client.user.lastName)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {session.client.user.firstName} {session.client.user.lastName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatTime12(session.scheduledTime)} · {session.durationMin} min
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Client Package Status ── */}
      {clients.length > 0 && (
        <div className="rounded-2xl bg-card ring-1 ring-border/50 overflow-hidden">
          <div className="flex items-center gap-2 px-4 pt-4 pb-3">
            <Users className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-semibold">Client Packages</h2>
            <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
              {clients.length} active
            </span>
          </div>
          <div className="divide-y divide-border/40">
            {clients.map((c) => {
              const { firstName, lastName } = c.clientProfile.user;
              const pkg = c.package;
              if (!pkg?.endDate) return null;

              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const start = new Date(pkg.startDate);
              const end = new Date(pkg.endDate);
              const totalDays = Math.max(
                1,
                Math.round((end.getTime() - start.getTime()) / 86_400_000),
              );
              const daysLeft = Math.max(
                0,
                Math.ceil((end.getTime() - today.getTime()) / 86_400_000),
              );
              const pctUsed = Math.min(100, Math.round(((totalDays - daysLeft) / totalDays) * 100));

              const urgency =
                daysLeft <= 7
                  ? { bar: 'bg-red-500', text: 'text-red-400', badge: 'bg-red-500/15 text-red-400' }
                  : daysLeft <= 14
                    ? {
                        bar: 'bg-amber-500',
                        text: 'text-amber-400',
                        badge: 'bg-amber-500/15 text-amber-400',
                      }
                    : {
                        bar: 'bg-emerald-500',
                        text: 'text-emerald-400',
                        badge: 'bg-emerald-500/15 text-emerald-400',
                      };

              const endLabel = end.toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              });

              return (
                <div key={c.clientProfile.id} className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-bold text-foreground">
                      {initials(firstName, lastName)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium">
                          {firstName} {lastName}
                        </p>
                        <span
                          className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold tabular-nums ${urgency.badge}`}
                        >
                          {daysLeft}d left
                        </span>
                      </div>
                      <div className="mt-1.5 h-1 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${urgency.bar}`}
                          style={{ width: `${pctUsed}%` }}
                        />
                      </div>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {pctUsed}% used · Ends {endLabel}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Quick links ── */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => router.push('/trainer/sessions')}
          className="flex items-center gap-3 rounded-2xl bg-card p-4 ring-1 ring-border/50 text-left transition-colors hover:bg-muted/30"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/10">
            <CalendarCheck className="h-4 w-4 text-blue-500" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold">Schedule</p>
            <p className="text-xs text-muted-foreground">View all sessions</p>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto shrink-0" />
        </button>
        <button
          onClick={() => router.push('/trainer/leaves')}
          className="flex items-center gap-3 rounded-2xl bg-card p-4 ring-1 ring-border/50 text-left transition-colors hover:bg-muted/30"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10">
            <UmbrellaOff className="h-4 w-4 text-amber-500" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold">Leaves</p>
            <p className="text-xs text-muted-foreground">Manage time off</p>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto shrink-0" />
        </button>
      </div>

      {ConfirmDialog}
    </div>
  );
}

// ─── MiniStat ─────────────────────────────────────────────────────────────────

function MiniStat({
  icon,
  value,
  label,
  color,
  bg,
}: {
  icon: React.ReactNode;
  value: string | number;
  label: string;
  color: string;
  bg: string;
}) {
  return (
    <div className="rounded-2xl bg-card p-3 ring-1 ring-border/50">
      <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${bg} ${color}`}>
        {icon}
      </div>
      <p className="mt-2.5 text-xl font-bold leading-none">{value}</p>
      <p className="mt-0.5 text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}
