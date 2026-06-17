'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChevronLeft, ChevronRight, Clock, Dumbbell, Star, User } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface CalendarDay {
  date: string; // YYYY-MM-DD
  sessionIds: string[];
  isPR: boolean;
}

interface DayWorkoutLog {
  id: string;
  exercise: {
    id: string;
    name: string;
    targetMuscleGroup: string;
  };
  sets: {
    setNumber: number;
    reps: number | null;
    weightKg: number | null;
    durationSec: number | null;
  }[];
  sessionInstance: {
    id: string;
    scheduledDate: string;
    scheduledTime: string;
    trainer: { user: { firstName: string; lastName: string } };
  };
}

const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

function formatTime(timeStr: string) {
  const [h = '0', m = '00'] = timeStr.split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  return `${hour % 12 || 12}:${m} ${ampm}`;
}

function setSummary(sets: DayWorkoutLog['sets']) {
  const weighted = sets.filter((s) => s.weightKg != null && s.weightKg > 0);
  if (weighted.length > 0) {
    const best = weighted.reduce((a, b) => ((b.weightKg ?? 0) > (a.weightKg ?? 0) ? b : a));
    return `Best ${best.weightKg}kg${best.reps ? ` × ${best.reps}` : ''}`;
  }
  const repsTotal = sets.reduce((sum, s) => sum + (s.reps ?? 0), 0);
  if (repsTotal > 0) return `${repsTotal} reps`;
  const durTotal = sets.reduce((sum, s) => sum + (s.durationSec ?? 0), 0);
  if (durTotal > 0) {
    const min = Math.floor(durTotal / 60);
    return min > 0 ? `${min} min` : `${durTotal}s`;
  }
  return null;
}

interface WorkoutCalendarCardProps {
  /**
   * Endpoint for the month grid. Defaults to the signed-in client's own data.
   * Trainers/admins pass a client-scoped endpoint, e.g.
   * `/api/trainer/clients/<id>/workout-calendar`.
   */
  calendarEndpoint?: string;
  /**
   * Endpoint for a single day's logged workouts (powers the detail modal).
   * Defaults to the signed-in client's own data.
   */
  workoutsEndpoint?: string;
  /** Builds the "View full session" link target for a session id. */
  sessionHref?: (sessionId: string) => string;
  /**
   * When true, render without the card chrome (rounded ring + bg) so the
   * calendar can sit inside a parent container (e.g. under a client picker)
   * as one cohesive card instead of a detached second box.
   */
  embedded?: boolean;
}

export function WorkoutCalendarCard({
  calendarEndpoint = '/api/client/workout-calendar',
  workoutsEndpoint = '/api/client/workouts',
  sessionHref = (id) => `/client/session/${id}`,
  embedded = false,
}: WorkoutCalendarCardProps = {}) {
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth()); // 0-based
  const [days, setDays] = useState<Map<string, CalendarDay>>(new Map());
  const [totalDays, setTotalDays] = useState(0);
  // Loading is derived (no setState in effect body): true until this month's fetch settles
  const [loadedMonth, setLoadedMonth] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const monthParam = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`;
  const loading = loadedMonth !== monthParam;

  useEffect(() => {
    let cancelled = false;
    fetch(`${calendarEndpoint}?month=${monthParam}`)
      .then((r) => r.json())
      .then(({ data }) => {
        if (cancelled || !data) return;
        setDays(new Map((data.days as CalendarDay[]).map((d) => [d.date, d])));
        setTotalDays(data.totalDays ?? 0);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadedMonth(monthParam);
      });
    return () => {
      cancelled = true;
    };
  }, [monthParam, calendarEndpoint]);

  const todayStr = ymd(now);
  const isCurrentMonth = viewYear === now.getFullYear() && viewMonth === now.getMonth();

  // Monday-first grid: leading cells from previous month, trailing to fill the week
  const cells = useMemo(() => {
    const first = new Date(viewYear, viewMonth, 1);
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const lead = (first.getDay() + 6) % 7;
    const out: { date: Date; inMonth: boolean }[] = [];
    for (let i = lead; i > 0; i--) {
      out.push({ date: new Date(viewYear, viewMonth, 1 - i), inMonth: false });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      out.push({ date: new Date(viewYear, viewMonth, d), inMonth: true });
    }
    while (out.length % 7 !== 0) {
      const last = out[out.length - 1]!.date;
      out.push({
        date: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1),
        inMonth: false,
      });
    }
    return out;
  }, [viewYear, viewMonth]);

  function shiftMonth(delta: number) {
    const next = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  }

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className={embedded ? 'p-4' : 'rounded-2xl bg-card p-4 ring-1 ring-border/50'}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => shiftMonth(-1)}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex flex-col items-center">
          <span className="text-sm font-semibold">{monthLabel}</span>
          <span className="text-[10px] text-muted-foreground">
            {loading ? '…' : `${totalDays} PT day${totalDays !== 1 ? 's' : ''}`}
          </span>
        </div>
        <button
          onClick={() => shiftMonth(1)}
          disabled={isCurrentMonth}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground disabled:opacity-30"
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Weekday header */}
      <div className="mt-3 grid grid-cols-7 gap-1">
        {WEEKDAYS.map((d) => (
          <span key={d} className="text-center text-[9px] font-medium text-muted-foreground">
            {d}
          </span>
        ))}
      </div>

      {/* Day grid */}
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map(({ date, inMonth }) => {
          const dateStr = ymd(date);
          const day = inMonth ? days.get(dateStr) : undefined;
          const isToday = inMonth && dateStr === todayStr;
          const clickable = !!day;

          let circle =
            'border border-transparent text-muted-foreground/40' + (inMonth ? '' : ' opacity-40');
          if (day?.isPR) {
            circle = 'border border-amber-400/60 bg-amber-400/10 text-amber-400';
          } else if (day) {
            circle = 'border border-emerald-500/60 bg-emerald-500/10 text-emerald-400';
          } else if (inMonth) {
            circle = 'border border-border/40 text-muted-foreground/60';
          }
          if (isToday) circle += ' ring-2 ring-orange-500';

          return (
            <button
              key={dateStr}
              disabled={!clickable}
              onClick={() => setSelectedDate(dateStr)}
              aria-label={day ? `${dateStr} — workout day${day.isPR ? ' with PR' : ''}` : dateStr}
              className={`mx-auto flex h-9 w-9 items-center justify-center rounded-full text-xs font-medium transition-transform ${circle} ${
                clickable ? 'active:scale-90' : 'cursor-default'
              }`}
            >
              {day?.isPR ? (
                <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
              ) : (
                date.getDate()
              )}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 border-t border-border/50 pt-3">
        <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className="flex h-4 w-4 items-center justify-center rounded-full border border-emerald-500/60 bg-emerald-500/10">
            <Check className="h-2.5 w-2.5 text-emerald-400" />
          </span>
          Workout
        </span>
        <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
          PR Day
        </span>
        <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className="h-3.5 w-3.5 rounded-full ring-2 ring-orange-500" />
          Today
        </span>
        <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className="h-3.5 w-3.5 rounded-full border border-border/60" />
          No workout
        </span>
      </div>

      <DayWorkoutModal
        date={selectedDate}
        isPR={selectedDate ? (days.get(selectedDate)?.isPR ?? false) : false}
        onClose={() => setSelectedDate(null)}
        workoutsEndpoint={workoutsEndpoint}
        sessionHref={sessionHref}
      />
    </div>
  );
}

// ─── Day detail modal ─────────────────────────────────────────────────────────

function DayWorkoutModal({
  date,
  isPR,
  onClose,
  workoutsEndpoint,
  sessionHref,
}: {
  date: string | null;
  isPR: boolean;
  onClose: () => void;
  workoutsEndpoint: string;
  sessionHref: (sessionId: string) => string;
}) {
  const router = useRouter();
  const [logs, setLogs] = useState<DayWorkoutLog[]>([]);
  // Loading is derived (no setState in effect body): true until this date's fetch settles
  const [loadedDate, setLoadedDate] = useState<string | null>(null);
  const loading = !!date && loadedDate !== date;

  useEffect(() => {
    if (!date) return;
    let cancelled = false;
    fetch(`${workoutsEndpoint}?dateFrom=${date}&dateTo=${date}`)
      .then((r) => r.json())
      .then(({ data }) => {
        if (!cancelled) setLogs(data ?? []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadedDate(date);
      });
    return () => {
      cancelled = true;
    };
  }, [date, workoutsEndpoint]);

  const session = logs[0]?.sessionInstance;
  const totalSets = logs.reduce((sum, l) => sum + l.sets.length, 0);
  const muscles = [...new Set(logs.map((l) => l.exercise.targetMuscleGroup))];

  const title = date
    ? new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', {
        weekday: 'long',
        day: 'numeric',
        month: 'short',
      })
    : '';

  return (
    <Dialog open={!!date} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {title}
            {isPR && (
              <span className="flex items-center gap-1 rounded-full bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold text-amber-400">
                <Star className="h-3 w-3 fill-amber-400" /> PR Day
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-10">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        )}

        {!loading && logs.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <Dumbbell className="h-7 w-7 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              Session completed — no exercises were logged.
            </p>
          </div>
        )}

        {!loading && session && (
          <div className="space-y-3">
            {/* Summary card */}
            <div className="rounded-xl bg-muted/40 p-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatTime(session.scheduledTime)}
                </span>
                <span className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {session.trainer.user.firstName} {session.trainer.user.lastName}
                </span>
                <span className="font-medium text-foreground">
                  {logs.length} exercise{logs.length !== 1 ? 's' : ''} · {totalSets} sets
                </span>
              </div>
              {muscles.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {muscles.map((m) => (
                    <span
                      key={m}
                      className="rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-medium text-primary"
                    >
                      {m}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Exercise list */}
            <div className="space-y-2">
              {logs.map((log) => {
                const summary = setSummary(log.sets);
                return (
                  <div
                    key={log.id}
                    className="flex items-center gap-3 rounded-xl border border-border/50 p-3"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <Dumbbell className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{log.exercise.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {log.exercise.targetMuscleGroup}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs font-semibold">
                        {log.sets.length} set{log.sets.length !== 1 ? 's' : ''}
                      </p>
                      {summary && <p className="text-[10px] text-muted-foreground">{summary}</p>}
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              onClick={() => router.push(sessionHref(session.id))}
              className="w-full rounded-xl bg-primary/10 py-2.5 text-center text-sm font-semibold text-primary transition-colors hover:bg-primary/15"
            >
              View full session
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
