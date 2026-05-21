'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, AlertTriangle, Clock, Loader2, CalendarIcon, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Calendar, CalendarDayButton } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SessionCalendar, type SessionCalendarHandle } from '@/components/calendar/SessionCalendar';
import type { EventInput, EventClickArg } from '@fullcalendar/core';

// ─── Types ──────────────────────────────────────────────────────────────────

interface SessionInstance {
  id: string;
  clientProfileId: string;
  scheduledDate: string;
  scheduledTime: string;
  durationMin: number;
  status: string;
  client: { user: { firstName: string; lastName: string } };
}

interface AssignedClient {
  id: string;
  user: { firstName: string; lastName: string };
}

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  SCHEDULED: 'bg-blue-500/10 text-blue-500',
  IN_PROGRESS: 'bg-green-500/10 text-green-500',
  COMPLETED: 'bg-emerald-500/10 text-emerald-500',
  NO_SHOW: 'bg-amber-500/10 text-amber-500',
  CANCELLED: 'bg-red-500/10 text-red-500',
};

// All possible slots from 06:00 to 21:30 in 30-min steps
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

/** Returns set of slot strings that overlap with existing sessions given the new durationMin */
function computeUnavailable(existingSessions: SessionInstance[], durationMin: number): Set<string> {
  const unavailable = new Set<string>();
  for (const slot of ALL_SLOTS) {
    const newStart = slotToMinutes(slot);
    const newEnd = newStart + durationMin;
    for (const s of existingSessions) {
      if (s.status === 'CANCELLED') continue;
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
  date,
  durationMin,
  selected,
  onSelect,
}: {
  date: string;
  durationMin: number;
  selected: string;
  onSelect: (slot: string) => void;
}) {
  const [sessionsOnDate, setSessionsOnDate] = useState<SessionInstance[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!date) return;
    const run = async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/trainer/schedule?date=${date}`);
        const { data } = r.ok ? await r.json() : { data: [] };
        setSessionsOnDate(data ?? []);
      } catch {
        setSessionsOnDate([]);
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, [date]);

  const unavailable = computeUnavailable(sessionsOnDate, durationMin);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6 text-muted-foreground text-sm gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Checking availability…
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium text-muted-foreground">Available Times</Label>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500/20 ring-1 ring-emerald-500/40" />
            Available
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-muted/60 ring-1 ring-border/30" />
            Booked
          </span>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-1.5 max-h-48 overflow-y-auto pr-1">
        {ALL_SLOTS.map((slot) => {
          const isBooked = unavailable.has(slot);
          const isSelected = selected === slot;
          return (
            <button
              key={slot}
              type="button"
              disabled={isBooked}
              onClick={() => onSelect(slot)}
              className={`rounded-lg px-2 py-2 text-[11px] font-medium transition-all ring-1 leading-none ${
                isBooked
                  ? 'cursor-not-allowed bg-muted/40 text-muted-foreground/40 ring-border/20'
                  : isSelected
                    ? 'bg-blue-600 text-white ring-blue-600 shadow-sm'
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
          Selected: <span className="font-medium text-foreground">{formatSlot(selected)}</span> (
          {durationMin} min)
        </p>
      )}
    </div>
  );
}

// ─── Book Session Modal ───────────────────────────────────────────────────────

function BookSessionModal({
  clients,
  onBooked,
  open,
  onOpenChange,
}: {
  clients: AssignedClient[];
  onBooked: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [clientId, setClientId] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [durationMin, setDurationMin] = useState('60');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showCalendar, setShowCalendar] = useState(false);
  const [clientBookedDates, setClientBookedDates] = useState<Date[]>([]);

  // Fetch this client's existing sessions (with this trainer) for the next 3 months
  useEffect(() => {
    if (!clientId || !open) {
      setClientBookedDates([]);
      return;
    }
    const today = new Date();
    const dateFrom = today.toISOString().split('T')[0];
    const future = new Date(today);
    future.setMonth(future.getMonth() + 3);
    const dateTo = future.toISOString().split('T')[0];
    fetch(`/api/trainer/schedule?dateFrom=${dateFrom}&dateTo=${dateTo}&clientId=${clientId}`)
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then(({ data }) => {
        const dates = (data as SessionInstance[])
          .filter((s) => s.status !== 'CANCELLED')
          .map((s) => {
            // Parse scheduledDate (ISO string) into local year/month/day to avoid UTC offset shifting the day
            const d = new Date(s.scheduledDate);
            return new Date(d.getFullYear(), d.getMonth(), d.getDate());
          });
        setClientBookedDates(dates);
      })
      .catch(() => setClientBookedDates([]));
  }, [clientId, open]);

  function reset() {
    setClientId('');
    setScheduledDate('');
    setScheduledTime('');
    setDurationMin('60');
    setNotes('');
    setError('');
    setShowCalendar(false);
    setClientBookedDates([]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId || !scheduledDate || !scheduledTime || !durationMin) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/trainer/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientProfileId: clientId,
          scheduledDate,
          scheduledTime,
          durationMin: parseInt(durationMin, 10),
          notes: notes || undefined,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        toast.success('Session booked successfully.');
        reset();
        onOpenChange(false);
        onBooked();
      } else {
        setError(json.error || 'Failed to book session');
      }
    } finally {
      setSubmitting(false);
    }
  }

  const isValid = !!clientId && !!scheduledDate && !!scheduledTime && !!durationMin;
  const displayDate = scheduledDate
    ? new Date(scheduledDate + 'T00:00:00').toLocaleDateString('en-IN', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null;

  return (
    <>
      {/* Date picker modal with backdrop */}
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
                {clientId && (
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    <span className="inline-block h-2 w-2 rounded-full bg-red-500 mr-1 align-middle" />
                    Red dates = already booked with this client
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowCalendar(false)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                ✕
              </button>
            </div>
            <Calendar
              mode="single"
              selected={scheduledDate ? new Date(scheduledDate + 'T00:00:00') : undefined}
              onSelect={(date) => {
                if (date) {
                  const y = date.getFullYear();
                  const m = String(date.getMonth() + 1).padStart(2, '0');
                  const d = String(date.getDate()).padStart(2, '0');
                  setScheduledDate(`${y}-${m}-${d}`);
                  setScheduledTime('');
                  setShowCalendar(false);
                }
              }}
              disabled={(date) => {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                return date < today;
              }}
              modifiers={{ booked: clientBookedDates }}
              components={{
                DayButton: (props) => {
                  const isBooked = !!props.modifiers?.booked;
                  const isSelected = !!props.modifiers?.selected;
                  return (
                    <CalendarDayButton
                      {...props}
                      className={
                        isBooked && !isSelected
                          ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30 ring-1 ring-red-500/30'
                          : undefined
                      }
                    />
                  );
                },
              }}
              className="p-4 [--cell-size:2.75rem]"
            />
          </div>
        </>
      )}

      <Dialog
        open={open}
        onOpenChange={(o) => {
          onOpenChange(o);
          if (!o) reset();
        }}
      >
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Book a Session
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-5 pt-1">
            {error && (
              <div className="flex items-center gap-2 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-500">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                {error}
              </div>
            )}

            {/* Client — pill buttons */}
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground">Client</Label>
              {clients.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  No active clients assigned to you yet.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {clients.map((c) => {
                    const active = clientId === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setClientId(c.id);
                          setScheduledDate('');
                          setScheduledTime('');
                        }}
                        className={`rounded-xl px-3 py-2 text-sm font-medium ring-1 transition-colors ${
                          active
                            ? 'bg-blue-600 text-white ring-blue-600'
                            : 'bg-muted/40 text-foreground ring-border/40 hover:bg-muted/70'
                        }`}
                      >
                        {c.user.firstName} {c.user.lastName}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Date + Duration — same row */}
            <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Date</Label>
                <button
                  type="button"
                  disabled={!clientId}
                  onClick={() => setShowCalendar(true)}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm ring-1 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                    scheduledDate
                      ? 'bg-card text-foreground ring-border'
                      : 'bg-muted/30 text-muted-foreground ring-border/40 hover:bg-muted/50'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                    {displayDate ?? (clientId ? 'Pick a date' : 'Select a client first')}
                  </span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Duration</Label>
                <Select
                  value={durationMin}
                  onValueChange={(v) => {
                    if (v) {
                      setDurationMin(v);
                      setScheduledTime('');
                    }
                  }}
                >
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[30, 45, 60, 75, 90, 120].map((d) => (
                      <SelectItem key={d} value={String(d)}>
                        {d} min
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Time slot grid */}
            {scheduledDate ? (
              <TimeSlotGrid
                date={scheduledDate}
                durationMin={parseInt(durationMin, 10)}
                selected={scheduledTime}
                onSelect={setScheduledTime}
              />
            ) : (
              <div className="rounded-xl bg-muted/30 px-3 py-4 text-center text-xs text-muted-foreground">
                {clientId
                  ? 'Pick a date above to see available times'
                  : 'Select a client and date first'}
              </div>
            )}

            {/* Notes */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">
                Notes <span className="text-muted-foreground/60">(optional)</span>
              </Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Any notes for this session..."
                maxLength={500}
              />
            </div>

            <Button
              type="submit"
              disabled={submitting || !isValid}
              className="w-full bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700"
            >
              {submitting ? 'Booking...' : 'Book Session'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function TrainerSchedulePage() {
  const [sessions, setSessions] = useState<SessionInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<SessionInstance | null>(null);
  const [clients, setClients] = useState<AssignedClient[]>([]);
  const [bookOpen, setBookOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [viewedDate, setViewedDate] = useState<Date>(() => new Date());
  const calendarHandle = useRef<SessionCalendarHandle>(null);

  // Mobile fills the viewport (minus TopNav + bottom tab bar + page chrome);
  // desktop keeps the fixed 600px height.
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const now = new Date();
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const res = await fetch(`/api/trainer/schedule?month=${month}`);
      if (res.ok) {
        const { data } = await res.json();
        setSessions(data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchClients = useCallback(async () => {
    try {
      const res = await fetch('/api/trainer/clients');
      if (res.ok) {
        const { data } = await res.json();
        // data is [{ clientProfile: { id, user: {...} }, ... }]
        const unique: AssignedClient[] = (data as { clientProfile: AssignedClient }[]).map(
          (item) => item.clientProfile,
        );
        setClients(unique);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    fetchSessions();
    fetchClients();
  }, [fetchSessions, fetchClients]);

  function handleEventClick(info: EventClickArg) {
    const session = sessions.find((s) => s.id === info.event.id);
    setSelected(session ?? null);
  }

  const calendarEvents: EventInput[] = sessions.map((s) => {
    const [h, m] = s.scheduledTime.split(':').map(Number);
    const start = new Date(s.scheduledDate);
    start.setHours(h!, m!, 0);
    const end = new Date(start);
    end.setMinutes(end.getMinutes() + s.durationMin);
    return {
      id: s.id,
      title: `${s.client.user.firstName} ${s.client.user.lastName}`,
      start,
      end,
      extendedProps: { status: s.status },
    };
  });

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Header — title + button on a single row at every breakpoint */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Schedule</h1>
        <Button
          size="sm"
          onClick={() => setBookOpen(true)}
          className="gap-1.5 bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700"
        >
          <Plus className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Book Session</span>
          <span className="sm:hidden">Book</span>
        </Button>
      </div>

      {/* Calendar */}
      {loading ? (
        <Skeleton className="h-96 w-full rounded-2xl" />
      ) : (
        <Card className="py-3 sm:py-4">
          <CardContent className="px-2 sm:px-4">
            <SessionCalendar
              ref={calendarHandle}
              events={calendarEvents}
              onEventClick={handleEventClick}
              onDatesSet={(info) => setViewedDate(info.view.currentStart)}
              onTitleClick={() => setDatePickerOpen(true)}
              showDaySummary
              scrollToCurrentTime
              initialView="timeGridWeek"
              height={isMobile ? 'calc(100dvh - 232px)' : 600}
            />
          </CardContent>
        </Card>
      )}

      {/* Date jump picker — opens when user taps the calendar title */}
      <Dialog open={datePickerOpen} onOpenChange={setDatePickerOpen}>
        <DialogContent className="max-w-xs p-0">
          <DialogHeader className="border-b border-border/50 px-4 py-3">
            <DialogTitle className="text-sm">Jump to date</DialogTitle>
          </DialogHeader>
          <Calendar
            mode="single"
            selected={viewedDate}
            onSelect={(date) => {
              if (date) {
                calendarHandle.current?.gotoDate(date);
                setDatePickerOpen(false);
              }
            }}
            className="p-3 [--cell-size:2.5rem]"
          />
        </DialogContent>
      </Dialog>

      <BookSessionModal
        clients={clients}
        onBooked={fetchSessions}
        open={bookOpen}
        onOpenChange={setBookOpen}
      />

      {/* Selected session details */}
      {selected && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Session Details</h3>
              <button
                onClick={() => setSelected(null)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                ✕
              </button>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <div>
                <p className="text-sm text-muted-foreground">Client</p>
                <p className="font-medium">
                  {selected.client.user.firstName} {selected.client.user.lastName}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Date & Time</p>
                <p className="font-medium">
                  {new Date(selected.scheduledDate).toLocaleDateString()} at{' '}
                  {selected.scheduledTime}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLOR[selected.status] ?? 'bg-muted text-muted-foreground'}`}
                >
                  {selected.status}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
