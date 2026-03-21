'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Dumbbell,
  PlayCircle,
  XCircle,
} from 'lucide-react';

type SessionStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'NO_SHOW' | 'CANCELLED';

interface Session {
  id: string;
  scheduledDate: string;
  scheduledTime: string;
  durationMin: number;
  status: SessionStatus;
  startedAt: string | null;
  endedAt: string | null;
  actualDurationMin: number | null;
  isCarryForward: boolean;
  notes: string | null;
  trainer: {
    user: { firstName: string; lastName: string };
  };
}

const STATUS_CONFIG: Record<
  SessionStatus,
  { label: string; color: string; bgColor: string; icon: typeof CheckCircle2 }
> = {
  SCHEDULED: {
    label: 'Scheduled',
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
    icon: Calendar,
  },
  IN_PROGRESS: {
    label: 'In Progress',
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
    icon: PlayCircle,
  },
  COMPLETED: {
    label: 'Completed',
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-500/10',
    icon: CheckCircle2,
  },
  NO_SHOW: {
    label: 'No Show',
    color: 'text-amber-500',
    bgColor: 'bg-amber-500/10',
    icon: AlertCircle,
  },
  CANCELLED: { label: 'Cancelled', color: 'text-red-500', bgColor: 'bg-red-500/10', icon: XCircle },
};

export default function ClientSessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const fetchSessions = useCallback(async (month: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/client/sessions?month=${month}`);
      if (res.ok) {
        const json = await res.json();
        setSessions(json.data ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions(currentMonth);
  }, [currentMonth, fetchSessions]);

  function navigateMonth(direction: -1 | 1) {
    const [y, m] = currentMonth.split('-').map(Number) as [number, number];
    const d = new Date(y, m - 1 + direction, 1);
    setCurrentMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  const monthLabel = (() => {
    const [y, m] = currentMonth.split('-').map(Number) as [number, number];
    return new Date(y, m - 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  })();

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  }

  function formatTime(timeStr: string) {
    const [h = '0', m = '00'] = timeStr.split(':');
    const hour = parseInt(h, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const h12 = hour % 12 || 12;
    return `${h12}:${m} ${ampm}`;
  }

  // Group sessions: upcoming first, then past
  const now = new Date();
  const upcoming = sessions.filter(
    (s) => new Date(s.scheduledDate) >= new Date(now.toDateString()) && s.status === 'SCHEDULED',
  );
  const past = sessions.filter(
    (s) => !(new Date(s.scheduledDate) >= new Date(now.toDateString()) && s.status === 'SCHEDULED'),
  );

  // Stats
  const completed = sessions.filter((s) => s.status === 'COMPLETED').length;
  const noShow = sessions.filter((s) => s.status === 'NO_SHOW').length;
  const cancelled = sessions.filter((s) => s.status === 'CANCELLED').length;
  const scheduled = sessions.filter((s) => s.status === 'SCHEDULED').length;

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My Sessions</h1>
        <p className="mt-1 text-sm text-muted-foreground">Track all your training sessions</p>
      </div>

      {/* Month navigator */}
      <div className="flex items-center justify-between rounded-2xl bg-card p-3 ring-1 ring-border/50">
        <button
          onClick={() => navigateMonth(-1)}
          className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold">{monthLabel}</span>
        <button
          onClick={() => navigateMonth(1)}
          className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: 'Done', value: completed, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
          { label: 'Upcoming', value: scheduled, color: 'text-blue-500', bg: 'bg-blue-500/10' },
          { label: 'No Show', value: noShow, color: 'text-amber-500', bg: 'bg-amber-500/10' },
          { label: 'Cancelled', value: cancelled, color: 'text-red-500', bg: 'bg-red-500/10' },
        ].map((stat) => (
          <div
            key={stat.label}
            className="flex flex-col items-center gap-1 rounded-xl bg-card p-3 ring-1 ring-border/50"
          >
            <span className={`text-xl font-bold ${stat.color}`}>{stat.value}</span>
            <span className="text-[10px] text-muted-foreground">{stat.label}</span>
          </div>
        ))}
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="text-sm text-muted-foreground">Loading sessions...</p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && sessions.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <Dumbbell className="h-7 w-7 text-muted-foreground" />
          </div>
          <p className="font-medium">No sessions this month</p>
          <p className="text-sm text-muted-foreground">Sessions will appear here once scheduled</p>
        </div>
      )}

      {/* Upcoming sessions */}
      {!loading && upcoming.length > 0 && (
        <div>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Upcoming
          </h2>
          <div className="space-y-2">
            {upcoming.map((s) => (
              <SessionCard key={s.id} session={s} formatDate={formatDate} formatTime={formatTime} />
            ))}
          </div>
        </div>
      )}

      {/* Past / other sessions */}
      {!loading && past.length > 0 && (
        <div>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {upcoming.length > 0 ? 'Past & Other' : 'All Sessions'}
          </h2>
          <div className="space-y-2">
            {past.map((s) => (
              <SessionCard key={s.id} session={s} formatDate={formatDate} formatTime={formatTime} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SessionCard({
  session,
  formatTime,
}: {
  session: Session;
  formatDate: (d: string) => string;
  formatTime: (t: string) => string;
}) {
  const config = STATUS_CONFIG[session.status];
  const StatusIcon = config.icon;
  const day = new Date(session.scheduledDate).getDate();
  const monthShort = new Date(session.scheduledDate).toLocaleDateString('en-IN', {
    month: 'short',
  });

  return (
    <div className="flex items-center gap-4 rounded-2xl bg-card p-4 ring-1 ring-border/50 transition-colors hover:ring-border">
      {/* Date block */}
      <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-primary/10">
        <span className="text-base font-bold leading-none text-primary">{day}</span>
        <span className="text-[9px] font-medium uppercase text-primary/70">{monthShort}</span>
      </div>

      {/* Details */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold">
            {session.trainer.user.firstName} {session.trainer.user.lastName}
          </p>
          {session.isCarryForward && (
            <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-medium text-amber-500">
              CF
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatTime(session.scheduledTime)}
          </span>
          <span>{session.actualDurationMin ?? session.durationMin} min</span>
        </div>
      </div>

      {/* Status badge */}
      <div
        className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 ${config.bgColor}`}
      >
        <StatusIcon className={`h-3 w-3 ${config.color}`} />
        <span className={`text-[10px] font-medium ${config.color}`}>{config.label}</span>
      </div>
    </div>
  );
}
