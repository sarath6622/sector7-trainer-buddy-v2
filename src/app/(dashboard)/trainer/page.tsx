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
  Eye,
  Timer,
  CalendarCheck,
  UmbrellaOff,
  ChevronRight,
  Users,
  Dumbbell,
} from 'lucide-react';
import { toast } from 'sonner';
import { useConfirm } from '@/hooks/use-confirm';
import { InlineTimer } from '@/components/timer/SessionTimer';
import { ClientWorkoutCalendar } from '@/components/calendar/ClientWorkoutCalendar';

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

interface CrossfitTodayItem {
  class: {
    id: string;
    name: string;
    startTime: string;
    durationMin: number;
    _count: { enrollments: number };
  };
  session: {
    id: string;
    status: string;
    startedAt?: string | null;
    endedAt?: string | null;
    _count?: { attendances: number };
  } | null;
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

interface TodayStatusStyle {
  label: string;
  /** status pill */
  bg: string;
  text: string;
  dot: string;
  /** left time-block */
  timeBg: string;
  timeText: string;
  /** tile shell + left accent bar */
  tileBg: string;
  tileBorder: string;
  bar: string;
}

const STATUS_STYLE: Record<string, TodayStatusStyle> = {
  SCHEDULED: {
    label: 'Scheduled',
    bg: 'bg-blue-500/10',
    text: 'text-blue-400',
    dot: 'bg-blue-400',
    timeBg: 'bg-blue-500/10',
    timeText: 'text-blue-400',
    tileBg: 'bg-card',
    tileBorder: 'border-border/50',
    bar: 'bg-blue-500/70',
  },
  IN_PROGRESS: {
    label: 'In Progress',
    bg: 'bg-emerald-500/15',
    text: 'text-emerald-400',
    dot: 'bg-emerald-400 animate-pulse',
    timeBg: 'bg-emerald-500/15',
    timeText: 'text-emerald-400',
    tileBg: 'bg-emerald-500/[0.06]',
    tileBorder: 'border-emerald-500/30',
    bar: 'bg-emerald-500',
  },
  COMPLETED: {
    label: 'Completed',
    bg: 'bg-zinc-500/10',
    text: 'text-zinc-400',
    dot: 'bg-zinc-400',
    timeBg: 'bg-muted',
    timeText: 'text-muted-foreground',
    tileBg: 'bg-card',
    tileBorder: 'border-border/50',
    bar: 'bg-zinc-500/40',
  },
  NO_SHOW: {
    label: 'No Show',
    bg: 'bg-red-500/10',
    text: 'text-red-400',
    dot: 'bg-red-400',
    timeBg: 'bg-red-500/10',
    timeText: 'text-red-400',
    tileBg: 'bg-card',
    tileBorder: 'border-border/50',
    bar: 'bg-red-500/60',
  },
  CANCELLED: {
    label: 'Cancelled',
    bg: 'bg-zinc-500/10',
    text: 'text-zinc-400',
    dot: 'bg-zinc-500',
    timeBg: 'bg-muted',
    timeText: 'text-muted-foreground',
    tileBg: 'bg-card',
    tileBorder: 'border-border/50',
    bar: 'bg-zinc-500/30',
  },
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
  const [crossfitToday, setCrossfitToday] = useState<CrossfitTodayItem[]>([]);
  const [startingCfClassId, setStartingCfClassId] = useState<string | null>(null);
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
      const [todayRes, upcomingRes, monthRes, staleRes, clientsRes, cfTodayRes] = await Promise.all(
        [
          fetch(`/api/trainer/schedule?date=${today}`),
          fetch(`/api/trainer/schedule?dateFrom=${tomorrow}&dateTo=${future}`),
          fetch(`/api/trainer/schedule?month=${monthStr}`),
          fetch(`/api/trainer/schedule?status=IN_PROGRESS`),
          fetch('/api/trainer/clients'),
          fetch('/api/crossfit/sessions/today'),
        ],
      );
      if (todayRes.ok) {
        const { data } = await todayRes.json();
        setTodaySessions(data);
      }
      // Stale IN_PROGRESS sessions from past days — shown as a separate alert
      if (staleRes.ok) {
        const { data: staleData } = await staleRes.json();
        const stale = (staleData as SessionData[]).filter(
          (s) => toLocalDateStr(s.scheduledDate) !== today,
        );
        setStaleSessions(stale);
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
      if (cfTodayRes.ok) {
        const { data } = await cfTodayRes.json();
        setCrossfitToday(data ?? []);
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

  async function handleStartCrossfitSession(item: CrossfitTodayItem) {
    const classId = item.class.id;
    setStartingCfClassId(classId);
    try {
      let sessionId = item.session?.id;
      // Create session if it doesn't exist yet
      if (!sessionId) {
        const today = new Date().toLocaleDateString('en-CA');
        const createRes = await fetch('/api/crossfit/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ classId, date: today }),
        });
        if (!createRes.ok) {
          const err = await createRes.json();
          toast.error(err.error || 'Failed to create CrossFit session');
          return;
        }
        const { data: created } = await createRes.json();
        sessionId = created.id;
      }
      // Start the session
      const startRes = await fetch(`/api/crossfit/sessions/${sessionId}/start`, { method: 'POST' });
      if (!startRes.ok) {
        const err = await startRes.json();
        toast.error(err.error || 'Failed to start CrossFit session');
        return;
      }
      router.push('/trainer/crossfit');
    } catch {
      toast.error('Something went wrong');
    } finally {
      setStartingCfClassId(null);
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

      {/* ── Active sessions (live + never-ended, unified into one card) ── */}
      <ActiveSessionsCard
        live={todaySessions.filter((s) => s.status === 'IN_PROGRESS' && !!s.startedAt)}
        stale={staleSessions}
        onOpen={(id) => router.push(`/trainer/session/${id}`)}
      />

      {/* ── Today's Sessions ── */}
      <div className="overflow-hidden rounded-3xl bg-card ring-1 ring-border/50">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 pt-4 pb-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
            <Clock className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold leading-tight">Today</h2>
            <p className="text-xs text-muted-foreground">
              {new Date().toLocaleDateString('en-IN', {
                weekday: 'long',
                day: 'numeric',
                month: 'short',
              })}
            </p>
          </div>
          {todaySessions.length > 0 && (
            <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
              {todaySessions.length} session{todaySessions.length > 1 ? 's' : ''}
            </span>
          )}
        </div>

        {todaySessions.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 pb-7 pt-2 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/50">
              <CalendarCheck className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-semibold">No sessions today</p>
            <p className="text-xs text-muted-foreground">Enjoy your rest day.</p>
          </div>
        ) : (
          <div className="space-y-2.5 px-3 pb-3">
            {todaySessions.map((session) => {
              const st = STATUS_STYLE[session.status] ?? STATUS_STYLE.SCHEDULED!;
              const isLoading = actionLoading === session.id;
              const isCancelled = session.status === 'CANCELLED';
              const clientFirst = session.client.user.firstName;
              const clientLast = session.client.user.lastName;
              const [clock, ampm] = formatTime12(session.scheduledTime).split(' ');

              return (
                <div
                  key={session.id}
                  className={`relative overflow-hidden rounded-2xl border ${st.tileBorder} ${st.tileBg} p-3 ${
                    isCancelled ? 'opacity-60' : ''
                  }`}
                >
                  {/* Status accent bar */}
                  <span className={`absolute inset-y-0 left-0 w-1 ${st.bar}`} aria-hidden />

                  <div className="flex items-center gap-3">
                    {/* Time block */}
                    <div
                      className={`flex h-12 w-14 shrink-0 flex-col items-center justify-center rounded-xl ${st.timeBg}`}
                    >
                      <span className={`text-sm font-bold leading-none ${st.timeText}`}>
                        {clock}
                      </span>
                      <span
                        className={`mt-0.5 text-[9px] font-bold uppercase tracking-wide opacity-70 ${st.timeText}`}
                      >
                        {ampm}
                      </span>
                    </div>

                    {/* Client + meta */}
                    <div className="min-w-0 flex-1">
                      <p
                        className={`truncate text-sm font-semibold ${isCancelled ? 'line-through' : ''}`}
                      >
                        {clientFirst} {clientLast}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {session.durationMin} min
                        </span>
                        {session.status === 'SCHEDULED' && (
                          <StartsInLabel
                            scheduledDate={session.scheduledDate}
                            scheduledTime={session.scheduledTime}
                          />
                        )}
                      </div>
                    </div>

                    {/* Status pill */}
                    <span
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold ${st.bg} ${st.text}`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
                      {st.label}
                    </span>
                  </div>

                  {/* Action buttons */}
                  {session.status === 'SCHEDULED' && (
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => handleStartSession(session.id)}
                        disabled={isLoading}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-b from-emerald-500 to-emerald-600 py-2.5 text-xs font-semibold text-white shadow-sm shadow-emerald-950/30 transition-all hover:from-emerald-400 hover:to-emerald-500 active:scale-[0.98] disabled:opacity-50"
                      >
                        <Play className="h-3.5 w-3.5 fill-current" />
                        {isLoading ? 'Starting…' : 'Start'}
                      </button>
                      <button
                        onClick={() => handleNoShow(session.id)}
                        disabled={isLoading}
                        className="flex items-center justify-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-2.5 text-xs font-semibold text-red-400 transition-colors hover:bg-red-500/15 active:scale-[0.98] disabled:opacity-50"
                      >
                        <UserX className="h-3.5 w-3.5" />
                        No Show
                      </button>
                    </div>
                  )}

                  {session.status === 'IN_PROGRESS' && (
                    <button
                      onClick={() => router.push(`/trainer/session/${session.id}`)}
                      className="relative mt-3 flex w-full items-center justify-center gap-1.5 overflow-hidden rounded-xl bg-gradient-to-b from-emerald-500 to-emerald-600 py-2.5 text-xs font-semibold text-white shadow-sm shadow-emerald-950/30 transition-all hover:from-emerald-400 hover:to-emerald-500 active:scale-[0.98] [touch-action:manipulation] [-webkit-tap-highlight-color:transparent]"
                    >
                      <span className="absolute inset-0 animate-ping rounded-xl bg-emerald-400 opacity-20" />
                      <Square className="relative h-3.5 w-3.5" />
                      <span className="relative">Resume Session</span>
                    </button>
                  )}

                  {session.status === 'COMPLETED' && (
                    <button
                      onClick={() => router.push(`/trainer/sessions/${session.id}`)}
                      className="mt-2.5 flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      View workout
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Today's CrossFit Classes ── */}
      {crossfitToday.length > 0 && (
        <div className="rounded-2xl bg-card ring-1 ring-orange-500/30 overflow-hidden">
          <div className="flex items-center gap-2 px-4 pt-4 pb-3">
            <Dumbbell className="h-4 w-4 text-orange-500" />
            <h2 className="font-semibold text-orange-500">CrossFit Today</h2>
            <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-orange-500/15 text-[10px] font-semibold text-orange-500">
              {crossfitToday.length}
            </span>
          </div>
          <div className="divide-y divide-border/40">
            {crossfitToday.map((item) => {
              const isInProgress = item.session?.status === 'IN_PROGRESS';
              const isCompleted = item.session?.status === 'COMPLETED';
              const isStarting = startingCfClassId === item.class.id;

              // Compute actual duration for completed sessions
              let actualMins: number | null = null;
              if (isCompleted && item.session?.startedAt && item.session?.endedAt) {
                actualMins = Math.round(
                  (new Date(item.session.endedAt).getTime() -
                    new Date(item.session.startedAt).getTime()) /
                    60_000,
                );
              }
              const attendanceCount = item.session?._count?.attendances ?? 0;

              return (
                <div key={item.class.id} className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${isCompleted ? 'bg-zinc-500/15' : 'bg-orange-500/15'}`}
                    >
                      <Dumbbell
                        className={`h-4 w-4 ${isCompleted ? 'text-zinc-400' : 'text-orange-500'}`}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{item.class.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatTime12(item.class.startTime)} · {item.class.durationMin} min ·{' '}
                        {item.class._count.enrollments} enrolled
                      </p>
                    </div>
                    {isInProgress && (
                      <span className="flex items-center gap-1 shrink-0 rounded-md bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-500">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Live
                      </span>
                    )}
                    {isCompleted && (
                      <span className="flex items-center gap-1 shrink-0 rounded-md bg-zinc-500/15 px-2 py-0.5 text-[10px] font-semibold text-zinc-400">
                        <CheckCircle2 className="h-3 w-3" />
                        Done
                      </span>
                    )}
                  </div>

                  {isCompleted ? (
                    <div className="mt-2.5 pl-12 flex items-center gap-3">
                      <div className="flex items-center gap-1.5 rounded-xl bg-zinc-500/10 px-3 py-2 flex-1 justify-center">
                        <Clock className="h-3.5 w-3.5 text-zinc-400" />
                        <span className="text-xs font-semibold text-zinc-300">
                          {actualMins != null
                            ? `${actualMins} min`
                            : `${item.class.durationMin} min`}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 rounded-xl bg-zinc-500/10 px-3 py-2 flex-1 justify-center">
                        <Users className="h-3.5 w-3.5 text-zinc-400" />
                        <span className="text-xs font-semibold text-zinc-300">
                          {attendanceCount} / {item.class._count.enrollments} attended
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2.5 pl-12">
                      {isInProgress ? (
                        <button
                          onClick={() => router.push('/trainer/crossfit')}
                          className="relative overflow-hidden flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2 text-xs font-semibold text-white transition-all hover:bg-emerald-700"
                        >
                          <span className="absolute inset-0 rounded-xl animate-ping bg-emerald-400 opacity-25" />
                          <Square className="relative h-3 w-3" />
                          <span className="relative">Resume &amp; Mark Attendance</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => handleStartCrossfitSession(item)}
                          disabled={isStarting}
                          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-orange-500 py-2 text-xs font-semibold text-white transition-colors hover:bg-orange-600 disabled:opacity-50"
                        >
                          <Play className="h-3 w-3" />
                          {isStarting ? 'Starting…' : 'Start CrossFit'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Client Workout Calendar (tabbed per client) ── */}
      <ClientWorkoutCalendar
        clients={clients.map((c) => ({
          id: c.clientProfile.id,
          firstName: c.clientProfile.user.firstName,
          lastName: c.clientProfile.user.lastName,
        }))}
      />

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

// ─── "Starts in" live countdown ───────────────────────────────────────────────

/** Local timestamp for a session's scheduled start. Uses the date-part of
 *  scheduledDate (not its UTC clock) so a session keeps its intended calendar
 *  day regardless of timezone — matching how the rest of the app reads it. */
function sessionStartMs(scheduledDate: string, scheduledTime: string): number {
  const [y, mo, d] = scheduledDate.split('T')[0]!.split('-').map(Number);
  const [h = 0, mi = 0] = scheduledTime.split(':').map(Number);
  return new Date(y!, (mo ?? 1) - 1, d ?? 1, h, mi, 0, 0).getTime();
}

function fmtCountdown(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/**
 * Live "Starts in N" chip for an upcoming scheduled session. Re-renders every
 * 30s so the label stays current without a per-second timer, and shifts colour
 * as the start time nears and passes:
 *   > 60m → muted · ≤ 60m → blue · ≤ 15m → amber · due/overdue → red.
 */
function StartsInLabel({
  scheduledDate,
  scheduledTime,
}: {
  scheduledDate: string;
  scheduledTime: string;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const diffMin = Math.round((sessionStartMs(scheduledDate, scheduledTime) - now) / 60_000);

  let label: string;
  let tone: string;
  if (diffMin <= 0) {
    label = diffMin === 0 ? 'Due now' : `Overdue ${fmtCountdown(-diffMin)}`;
    tone = 'bg-red-500/10 text-red-400';
  } else {
    label = `Starts in ${fmtCountdown(diffMin)}`;
    tone =
      diffMin <= 15
        ? 'bg-amber-500/10 text-amber-400'
        : diffMin <= 60
          ? 'bg-primary/10 text-primary'
          : 'bg-muted text-muted-foreground';
  }

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums ${tone}`}
    >
      <Timer className="h-3 w-3" />
      {label}
    </span>
  );
}

// ─── Active sessions (live + never-ended) ─────────────────────────────────────

/** Human "Open for N minutes/hours/days" label for a never-ended session,
 *  measured from when it actually started (falling back to its scheduled date).
 *  Replaces a live HH:MM:SS timer, which is meaningless for a session left
 *  running for days (e.g. a 32-day-old "780:31:26"). */
function openForLabel(s: SessionData): string {
  const ref = new Date(s.startedAt ?? s.scheduledDate).getTime();
  const mins = Math.floor((Date.now() - ref) / 60_000);
  if (mins < 60) {
    const m = Math.max(1, mins);
    return `Open for ${m} minute${m === 1 ? '' : 's'}`;
  }
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Open for ${hrs} hour${hrs === 1 ? '' : 's'}`;
  const days = Math.floor(hrs / 24);
  return `Open for ${days} day${days === 1 ? '' : 's'}`;
}

/**
 * Single card for every IN_PROGRESS session, replacing the old separate
 * "Session in progress" banner and "Incomplete Sessions" alert that both
 * rendered the same never-ended session.
 *
 *   • live  — in progress today: green accent + live ticking timer, tap to resume.
 *   • stale — in progress from a previous day (never ended): amber accent, a
 *             static "open Nd" age, and an explicit "Resume & End" action.
 *
 * Theme/header adapt to the mix (pure-live → green, pure-stale → amber,
 * both → neutral card with per-row colour). A session can only ever appear
 * in one group, so nothing is shown twice.
 */
function ActiveSessionsCard({
  live,
  stale,
  onOpen,
}: {
  live: SessionData[];
  stale: SessionData[];
  onOpen: (id: string) => void;
}) {
  // Defensive de-dupe: never let a session land in both groups. (The two
  // source queries are already disjoint by date, but this guarantees the
  // double-render bug can't come back.)
  const staleIds = new Set(stale.map((s) => s.id));
  const liveSessions = live.filter((s) => !staleIds.has(s.id));

  const total = liveSessions.length + stale.length;
  if (total === 0) return null;

  const hasLive = liveSessions.length > 0;
  const hasStale = stale.length > 0;
  const mixed = hasLive && hasStale;
  const staleOnly = hasStale && !hasLive;

  const attention = hasStale; // anything needing "end it" gets the amber treatment

  // Stale/incomplete is a cleanup task, not a critical alert — keep its shell
  // neutral and let colour live only on the warning icon + the action button.
  const shell =
    hasLive && !mixed ? 'bg-emerald-500/[0.06] ring-emerald-500/25' : 'bg-card ring-border/50';

  const heading = mixed
    ? 'Active Sessions'
    : hasLive
      ? liveSessions.length === 1
        ? 'Session in progress'
        : `${liveSessions.length} sessions in progress`
      : 'Incomplete Sessions';

  const subtitle = staleOnly
    ? 'Never ended — resume to close them out.'
    : mixed
      ? 'Some were never ended — resume to close them out.'
      : liveSessions.length === 1
        ? 'Tap to jump back into your session.'
        : 'Tap any session to jump back in.';

  return (
    <div className={`overflow-hidden rounded-3xl ring-1 ${shell}`}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
            attention ? 'bg-amber-500/10' : 'bg-emerald-500/15'
          }`}
        >
          {attention ? (
            <AlertTriangle className="h-5 w-5 text-amber-500" />
          ) : (
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2
            className={`text-base font-bold leading-tight ${
              mixed ? 'text-foreground' : hasLive ? 'text-emerald-400' : 'text-amber-500'
            }`}
          >
            {heading}
          </h2>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold tabular-nums ${
            attention ? 'bg-muted text-muted-foreground' : 'bg-emerald-500/15 text-emerald-400'
          }`}
        >
          {total}
        </span>
      </div>

      {/* Rows */}
      <div className="space-y-2.5 px-3 pb-3">
        {/* Live tiles — running today, with a live timer */}
        {liveSessions.map((s) => {
          const [clock, ampm] = formatTime12(s.scheduledTime).split(' ');
          return (
            <button
              key={s.id}
              onClick={() => onOpen(s.id)}
              className="relative flex w-full items-center gap-3 overflow-hidden rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.06] p-3 text-left transition-all hover:bg-emerald-500/[0.1] active:scale-[0.99]"
            >
              <span className="absolute inset-y-0 left-0 w-1 bg-emerald-500" aria-hidden />
              <div className="flex h-12 w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-emerald-500/15">
                <span className="text-sm font-bold leading-none text-emerald-400">{clock}</span>
                <span className="mt-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-400 opacity-70">
                  {ampm}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {s.client.user.firstName} {s.client.user.lastName}
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live · {s.durationMin} min
                </p>
              </div>
              <span className="font-mono text-lg font-bold tabular-nums text-emerald-400">
                <InlineTimer startedAt={s.startedAt!} expectedDurationMin={s.durationMin} />
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-emerald-500/70" />
            </button>
          );
        })}

        {/* Stale tiles — never ended. Kept calm/neutral: colour lives only on
            the header warning icon and the action button. */}
        {stale.map((s) => {
          const day = new Date(s.scheduledDate).toLocaleDateString('en-IN', { day: 'numeric' });
          const mon = new Date(s.scheduledDate).toLocaleDateString('en-IN', { month: 'short' });
          return (
            <div key={s.id} className="rounded-2xl border border-border/50 bg-muted/20 p-3">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-muted">
                  <span className="text-sm font-bold leading-none text-foreground">{day}</span>
                  <span className="mt-0.5 text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
                    {mon}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {s.client.user.firstName} {s.client.user.lastName}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatTime12(s.scheduledTime)} · {s.durationMin} min
                  </p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted/70 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  <Timer className="h-3 w-3" />
                  {openForLabel(s)}
                </span>
              </div>
              <button
                onClick={() => onOpen(s.id)}
                className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-amber-500 py-2.5 text-xs font-bold text-amber-950 transition-colors hover:bg-amber-400 active:scale-[0.98]"
              >
                <Square className="h-3.5 w-3.5" />
                Resume &amp; End Session
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
