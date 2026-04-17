'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock,
  XCircle,
  CalendarIcon,
  ChevronDown,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Calendar, CalendarDayButton } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

// ─── Types ───────────────────────────────────────────────────────────────────

interface UpcomingSession {
  id: string;
  scheduledDate: string;
  scheduledTime: string;
  durationMin: number;
  status: string;
  trainer: { user: { firstName: string; lastName: string } };
}

interface ClientSession {
  id: string;
  scheduledDate: string;
  scheduledTime: string;
  durationMin: number;
  status: string;
}

interface RescheduleRequest {
  id: string;
  requestedDate: string;
  requestedTime: string;
  reason: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewNotes: string | null;
  createdAt: string;
  sessionInstance: {
    scheduledDate: string;
    scheduledTime: string;
    trainer: { user: { firstName: string; lastName: string } };
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatTime(timeStr: string) {
  const [h = '0', m = '00'] = timeStr.split(':');
  const hour = parseInt(h, 10);
  return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`;
}

const STATUS_CONFIG = {
  PENDING: { label: 'Pending', color: 'bg-amber-500/10 text-amber-500', icon: Clock },
  APPROVED: { label: 'Approved', color: 'bg-emerald-500/10 text-emerald-500', icon: CheckCircle2 },
  REJECTED: { label: 'Declined', color: 'bg-red-500/10 text-red-500', icon: XCircle },
};

// ─── Time Slot Helpers ────────────────────────────────────────────────────────

const ALL_SLOTS: string[] = [];
for (let h = 6; h < 22; h++) {
  for (let m = 0; m < 60; m += 30) {
    ALL_SLOTS.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  }
}

function slotToMinutes(slot: string) {
  const [h, m] = slot.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function formatSlot(slot: string) {
  const [h, m] = slot.split(':').map(Number);
  const hour = h ?? 0;
  return `${hour % 12 || 12}:${String(m ?? 0).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`;
}

function computeUnavailable(
  sessions: ClientSession[],
  durationMin: number,
  excludeId: string,
): Set<string> {
  const unavailable = new Set<string>();
  for (const slot of ALL_SLOTS) {
    const newStart = slotToMinutes(slot);
    const newEnd = newStart + durationMin;
    for (const s of sessions) {
      if (s.id === excludeId || s.status === 'CANCELLED') continue;
      const exStart = slotToMinutes(s.scheduledTime);
      const exEnd = exStart + s.durationMin;
      if (newStart < exEnd && newEnd > exStart) {
        unavailable.add(slot);
        break;
      }
    }
  }
  return unavailable;
}

// ─── Time Slot Grid ───────────────────────────────────────────────────────────

function TimeSlotGrid({
  sessionsOnDate,
  durationMin,
  excludeId,
  currentSlot,
  selected,
  onSelect,
}: {
  sessionsOnDate: ClientSession[];
  durationMin: number;
  excludeId: string;
  currentSlot?: string;
  selected: string;
  onSelect: (slot: string) => void;
}) {
  const unavailable = computeUnavailable(sessionsOnDate, durationMin, excludeId);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium text-muted-foreground">Preferred Time</Label>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500/20 ring-1 ring-emerald-500/40" />
            Available
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-500/20 ring-1 ring-amber-500/40" />
            Current
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-red-500/20 ring-1 ring-red-500/30" />
            Booked
          </span>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-1.5 max-h-48 overflow-y-auto pr-1">
        {ALL_SLOTS.map((slot) => {
          const isBooked = unavailable.has(slot);
          const isCurrent = slot === currentSlot;
          const isSelected = selected === slot;
          return (
            <button
              key={slot}
              type="button"
              disabled={isBooked}
              onClick={() => onSelect(slot)}
              className={`rounded-lg px-2 py-2 text-[11px] font-medium transition-all ring-1 leading-none ${
                isBooked
                  ? 'cursor-not-allowed bg-red-500/15 text-red-400/60 ring-red-500/20'
                  : isSelected
                    ? 'bg-blue-600 text-white ring-blue-600 shadow-sm'
                    : isCurrent
                      ? 'bg-amber-500/20 text-amber-400 ring-amber-500/40 hover:bg-amber-500/30'
                      : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-500/30 hover:bg-emerald-500/20 hover:ring-emerald-500/50'
              }`}
            >
              {formatSlot(slot)}
            </button>
          );
        })}
      </div>
      {selected && !unavailable.has(selected) && (
        <p className="text-[11px] text-muted-foreground">
          Selected: <span className="font-medium text-foreground">{formatSlot(selected)}</span>
        </p>
      )}
    </div>
  );
}

// ─── Request Dialog ───────────────────────────────────────────────────────────

function RequestDialog({
  session,
  open,
  onClose,
  onSubmitted,
}: {
  session: UpcomingSession | null;
  open: boolean;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [requestedDate, setRequestedDate] = useState('');
  const [requestedTime, setRequestedTime] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showCalendar, setShowCalendar] = useState(false);

  // All client sessions across 3 months — for booked dates + time slots
  const [allSessions, setAllSessions] = useState<ClientSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);

  // Fetch 3 months of sessions when dialog opens
  useEffect(() => {
    if (!open || !session) return;
    setSessionsLoading(true);
    const months = [0, 1, 2].map((offset) => {
      const d = new Date();
      d.setMonth(d.getMonth() + offset);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });
    Promise.all(
      months.map((m) =>
        fetch(`/api/client/sessions?month=${m}`)
          .then((r) => (r.ok ? r.json() : { data: [] }))
          .then(({ data }) => data as ClientSession[]),
      ),
    )
      .then((results) => setAllSessions(results.flat()))
      .catch(() => setAllSessions([]))
      .finally(() => setSessionsLoading(false));
  }, [open, session]);

  useEffect(() => {
    if (!open) {
      setRequestedDate('');
      setRequestedTime('');
      setReason('');
      setError('');
      setShowCalendar(false);
      setAllSessions([]);
    }
  }, [open]);

  if (!session) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!requestedDate || !requestedTime) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/client/reschedule-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionInstanceId: session!.id,
          requestedDate,
          requestedTime,
          reason: reason || undefined,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        toast.success('Reschedule request submitted. Your trainer and admin have been notified.');
        onSubmitted();
        onClose();
      } else {
        setError(json.error || 'Failed to submit request');
      }
    } finally {
      setSubmitting(false);
    }
  }

  // The date of the session being rescheduled — shown orange on calendar
  const sessionLocalDate = new Date(session.scheduledDate);
  const currentSessionCalDate = new Date(
    sessionLocalDate.getFullYear(),
    sessionLocalDate.getMonth(),
    sessionLocalDate.getDate(),
  );
  // Date key for comparing with requestedDate string
  const sessionDateKey = `${sessionLocalDate.getFullYear()}-${String(sessionLocalDate.getMonth() + 1).padStart(2, '0')}-${String(sessionLocalDate.getDate()).padStart(2, '0')}`;

  // Booked dates for calendar (other sessions, excluding this one — shown red)
  const bookedDates = allSessions
    .filter((s) => s.id !== session.id && s.status !== 'CANCELLED')
    .map((s) => {
      const d = new Date(s.scheduledDate);
      return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    });

  // Sessions on the selected date (for time slot grid)
  const sessionsOnDate = requestedDate
    ? allSessions.filter((s) => {
        const d = new Date(s.scheduledDate);
        const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        return local === requestedDate;
      })
    : [];

  const displayDate = requestedDate
    ? new Date(requestedDate + 'T00:00:00').toLocaleDateString('en-IN', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null;

  return (
    <>
      {/* Calendar modal with backdrop */}
      {showCalendar && (
        <>
          <div
            className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm"
            onClick={() => setShowCalendar(false)}
          />
          <div className="fixed left-1/2 top-1/2 z-[201] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-card shadow-2xl ring-1 ring-border/50 overflow-hidden">
            <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
              <div>
                <p className="text-sm font-semibold">Pick a Date</p>
                <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-2 w-2 rounded-full bg-amber-500 align-middle" />
                    This session
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-2 w-2 rounded-full bg-red-500 align-middle" />
                    Other booking
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCalendar(false)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                ✕
              </button>
            </div>
            {sessionsLoading ? (
              <div className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading…
              </div>
            ) : (
              <Calendar
                mode="single"
                selected={requestedDate ? new Date(requestedDate + 'T00:00:00') : undefined}
                onSelect={(date) => {
                  if (date) {
                    const y = date.getFullYear();
                    const mo = String(date.getMonth() + 1).padStart(2, '0');
                    const d = String(date.getDate()).padStart(2, '0');
                    setRequestedDate(`${y}-${mo}-${d}`);
                    setRequestedTime('');
                    setShowCalendar(false);
                  }
                }}
                disabled={(date) => {
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  return date < today;
                }}
                modifiers={{ booked: bookedDates, currentSession: [currentSessionCalDate] }}
                components={{
                  DayButton: (props) => {
                    const isBooked = !!props.modifiers?.booked;
                    const isCurrent = !!props.modifiers?.currentSession;
                    const isSelected = !!props.modifiers?.selected;
                    return (
                      <CalendarDayButton
                        {...props}
                        className={
                          isSelected
                            ? undefined
                            : isCurrent
                              ? 'bg-amber-500/25 text-amber-300 hover:bg-amber-500/35 ring-1 ring-amber-500/40'
                              : isBooked
                                ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30 ring-1 ring-red-500/30'
                                : undefined
                        }
                      />
                    );
                  },
                }}
                className="p-4 [--cell-size:2.75rem]"
              />
            )}
          </div>
        </>
      )}

      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4" />
              Request Reschedule
            </DialogTitle>
          </DialogHeader>

          {/* Current session info */}
          <div className="rounded-xl bg-muted/40 px-4 py-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Current Session
            </p>
            <p className="font-medium">
              {formatDate(session.scheduledDate)} at {formatTime(session.scheduledTime)}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              with {session.trainer.user.firstName} {session.trainer.user.lastName} ·{' '}
              {session.durationMin} min
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-500">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                {error}
              </div>
            )}

            {/* Preferred Date — calendar modal */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Preferred Date</Label>
              <button
                type="button"
                onClick={() => setShowCalendar(true)}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm ring-1 transition-colors ${
                  requestedDate
                    ? 'bg-card text-foreground ring-border'
                    : 'bg-muted/30 text-muted-foreground ring-border/40 hover:bg-muted/50'
                }`}
              >
                <span className="flex items-center gap-2">
                  <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                  {displayDate ?? 'Pick a date'}
                </span>
                <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
              </button>
            </div>

            {/* Preferred Time — slot grid */}
            {requestedDate ? (
              <TimeSlotGrid
                sessionsOnDate={sessionsOnDate}
                durationMin={session.durationMin}
                excludeId={session.id}
                currentSlot={requestedDate === sessionDateKey ? session.scheduledTime : undefined}
                selected={requestedTime}
                onSelect={setRequestedTime}
              />
            ) : (
              <div className="rounded-xl bg-muted/30 px-3 py-4 text-center text-xs text-muted-foreground">
                Pick a date above to see available times
              </div>
            )}

            {/* Reason */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">
                Reason <span className="text-muted-foreground/60">(optional)</span>
              </Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                placeholder="Why do you need to reschedule?"
                maxLength={500}
              />
            </div>

            <p className="text-[11px] text-muted-foreground">
              Your trainer and admin will be notified. They will confirm or decline your request.
            </p>

            <Button
              type="submit"
              disabled={submitting || !requestedDate || !requestedTime}
              className="w-full bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700"
            >
              {submitting ? 'Submitting...' : 'Submit Request'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ClientRescheduleRequestsPage() {
  const [upcomingSessions, setUpcomingSessions] = useState<UpcomingSession[]>([]);
  const [requests, setRequests] = useState<RescheduleRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState<UpcomingSession | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pendingSessionIds, setPendingSessionIds] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const now = new Date();
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      const [sessionsRes, requestsRes] = await Promise.all([
        fetch(`/api/client/sessions?month=${month}`),
        fetch('/api/client/reschedule-requests?pageSize=50'),
      ]);

      if (sessionsRes.ok) {
        const { data } = await sessionsRes.json();
        const upcoming = (data as UpcomingSession[]).filter(
          (s) => s.status === 'SCHEDULED' && new Date(s.scheduledDate) > now,
        );
        setUpcomingSessions(upcoming);
      }

      if (requestsRes.ok) {
        const { data } = await requestsRes.json();
        setRequests(data);
        setPendingSessionIds(
          new Set(
            (data as RescheduleRequest[])
              .filter((r) => r.status === 'PENDING')
              .map((r) => `${r.sessionInstance.scheduledDate}|${r.sessionInstance.scheduledTime}`),
          ),
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function openDialog(session: UpcomingSession) {
    setSelectedSession(session);
    setDialogOpen(true);
  }

  function hasPendingRequest(session: UpcomingSession) {
    return pendingSessionIds.has(`${session.scheduledDate}|${session.scheduledTime}`);
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 pb-8">
        <Skeleton className="h-8 w-48 rounded-lg" />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Reschedule Requests</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Request to move an upcoming session to a different date and time
        </p>
      </div>

      {/* Upcoming sessions */}
      <div>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Upcoming Sessions
        </h2>
        {upcomingSessions.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl bg-card py-10 text-center ring-1 ring-border/50">
            <CalendarClock className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No upcoming sessions this month.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {upcomingSessions.map((s) => {
              const pending = hasPendingRequest(s);
              const day = new Date(s.scheduledDate).getDate();
              const monthShort = new Date(s.scheduledDate).toLocaleDateString('en-IN', {
                month: 'short',
              });
              return (
                <div
                  key={s.id}
                  className="flex items-center gap-3 rounded-2xl bg-card p-4 ring-1 ring-border/50"
                >
                  <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-primary/10">
                    <span className="text-base font-bold leading-none text-primary">{day}</span>
                    <span className="text-[9px] font-medium uppercase text-primary/70">
                      {monthShort}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">
                      {s.trainer.user.firstName} {s.trainer.user.lastName}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {formatTime(s.scheduledTime)} · {s.durationMin} min
                    </p>
                  </div>
                  {pending ? (
                    <span className="shrink-0 rounded-full bg-amber-500/10 px-2.5 py-1 text-[10px] font-medium text-amber-500">
                      Request Pending
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0 text-xs"
                      onClick={() => openDialog(s)}
                    >
                      Request Reschedule
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Request history */}
      {requests.length > 0 && (
        <div>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Request History
          </h2>
          <div className="space-y-2">
            {requests.map((r) => {
              const config = STATUS_CONFIG[r.status];
              const StatusIcon = config.icon;
              return (
                <div key={r.id} className="rounded-2xl bg-card p-4 ring-1 ring-border/50 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-0.5 min-w-0">
                      <p className="text-sm font-medium">
                        Original: {formatDate(r.sessionInstance.scheduledDate)} at{' '}
                        {formatTime(r.sessionInstance.scheduledTime)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Requested: {formatDate(r.requestedDate)} at {formatTime(r.requestedTime)}
                      </p>
                      {r.reason && (
                        <p className="text-xs text-muted-foreground italic">
                          &quot;{r.reason}&quot;
                        </p>
                      )}
                      {r.reviewNotes && (
                        <p className="text-xs text-muted-foreground">Response: {r.reviewNotes}</p>
                      )}
                    </div>
                    <div
                      className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 ${config.color}`}
                    >
                      <StatusIcon className="h-3 w-3" />
                      <span className="text-[10px] font-medium">{config.label}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <RequestDialog
        session={selectedSession}
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setSelectedSession(null);
        }}
        onSubmitted={fetchData}
      />
    </div>
  );
}
