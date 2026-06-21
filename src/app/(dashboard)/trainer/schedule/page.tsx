'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Plus,
  AlertTriangle,
  Clock,
  Loader2,
  CalendarPlus,
  Calendar as CalendarIconLucide,
  ChevronDown,
  Search,
  Users,
  User,
  MoreHorizontal,
  CalendarClock,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SessionCalendar, type SessionCalendarHandle } from '@/components/calendar/SessionCalendar';
import type { EventInput, EventClickArg } from '@fullcalendar/core';
import { cn } from '@/lib/utils';

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

/** A client the logged-in trainer can schedule for (active PT package only). */
interface SchedulerClient {
  clientProfileId: string;
  name: string;
  packageId: string | null;
}

interface PackageInfo {
  totalSessions: number;
  used: number;
  upcoming: number;
  remaining: number;
  daysRemaining: number;
  planName: string | null;
  alreadyDates: string[];
}

/** Mobile day-agenda payload from /api/trainer/schedule/day. */
interface DayView {
  date: string;
  workingDay: boolean;
  sessions: {
    id: string;
    clientProfileId: string;
    clientName: string;
    startTime: string;
    durationMin: number;
    status: string;
  }[];
  availableSlots: { startTime: string; endTime: string; durationMin: number }[];
  summary: { sessionCount: number; bookedMin: number; availableMin: number };
}

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  SCHEDULED: 'bg-blue-500/10 text-blue-500',
  IN_PROGRESS: 'bg-green-500/10 text-green-500',
  COMPLETED: 'bg-emerald-500/10 text-emerald-500',
  NO_SHOW: 'bg-amber-500/10 text-amber-500',
  CANCELLED: 'bg-red-500/10 text-red-500',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build a Mon-Sun calendar grid for a given YYYY-MM month string. */
function buildMonthCalendar(yearMonth: string): (string | null)[][] {
  const [yStr, mStr] = yearMonth.split('-');
  const y = parseInt(yStr!, 10);
  const m = parseInt(mStr!, 10);
  const firstDay = new Date(y, m - 1, 1);
  const daysInMonth = new Date(y, m, 0).getDate();
  // Offset so Mon=0, Tue=1, ... Sun=6
  const startOffset = (firstDay.getDay() + 6) % 7;

  const weeks: (string | null)[][] = [];
  let week: (string | null)[] = Array(startOffset).fill(null);

  for (let d = 1; d <= daysInMonth; d++) {
    week.push(`${yearMonth}-${String(d).padStart(2, '0')}`);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }
  return weeks;
}

/** Local YYYY-MM-DD for a Date — avoids the UTC shift toISOString() introduces in IST. */
function localYMD(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The seven Mon→Sun dates of the week containing `date`. */
function weekDaysFor(date: Date): Date[] {
  const monday = new Date(date);
  monday.setHours(0, 0, 0, 0);
  const offset = (monday.getDay() + 6) % 7; // Mon=0 … Sun=6
  monday.setDate(monday.getDate() - offset);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

/** "60" → "1h", "90" → "1h 30m", "30" → "30m". */
function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** Add `min` minutes to an "HH:MM" string, returning "HH:MM". */
function addMinutes(hhmm: string, min: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = h! * 60 + m! + min;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** "YYYY-MM-DD" → "Thu, 18 Jun" (local, no UTC shift). */
function formatDateLabel(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

/** "HH:MM" (24h) → "hh:MM AM/PM". e.g. "05:00" → "05:00 AM", "13:30" → "01:30 PM". */
function formatTime12(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const period = h! < 12 ? 'AM' : 'PM';
  const h12 = h! % 12 === 0 ? 12 : h! % 12;
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${period}`;
}

const SESSION_STATUS_LABEL: Record<string, string> = {
  SCHEDULED: 'PT Session',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  NO_SHOW: 'No Show',
};

// ─── Client picker (in-memory search over the trainer's assigned clients) ──────

function ClientCombobox({
  clients,
  value,
  onChange,
}: {
  clients: SchedulerClient[];
  value: string;
  onChange: (clientProfileId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const selected = clients.find((c) => c.clientProfileId === value);
  const filtered = clients.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          setSearch('');
        }}
        className="flex h-10 w-full items-center gap-2 rounded-lg border border-input bg-transparent px-3 text-sm transition-colors hover:bg-muted/50"
      >
        <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className={selected ? 'flex-1 text-left' : 'flex-1 text-left text-muted-foreground'}>
          {selected?.name ?? 'Select client'}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-full overflow-hidden rounded-lg bg-popover shadow-lg ring-1 ring-foreground/10">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search clients..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-[200px] overflow-y-auto p-1">
            {filtered.map((c) => (
              <button
                key={c.clientProfileId}
                type="button"
                onClick={() => {
                  onChange(c.clientProfileId);
                  setOpen(false);
                }}
                className={`flex w-full items-center rounded-md px-2.5 py-2 text-sm transition-colors ${
                  value === c.clientProfileId
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-accent/50'
                }`}
              >
                {c.name}
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-2.5 py-3 text-center text-xs text-muted-foreground">No clients</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Schedule Sessions Modal (mirrors the admin scheduling modal) ─────────────

function ScheduleSessionsModal({
  clients,
  open,
  onOpenChange,
  onScheduled,
  presetDate,
  presetStartTime,
  presetDurationMin,
}: {
  clients: SchedulerClient[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScheduled: () => void;
  /** When the modal is opened from an available-slot tap, prefill this date… */
  presetDate?: string | null;
  /** …this start time… */
  presetStartTime?: string | null;
  /** …and this duration (minutes). */
  presetDurationMin?: number | null;
}) {
  const [clientProfileId, setClientProfileId] = useState('');
  const [scheduleMonth, setScheduleMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [startTime, setStartTime] = useState('07:00');
  const [durationMin, setDurationMin] = useState('60');
  const [packageInfo, setPackageInfo] = useState<PackageInfo | null>(null);
  const [packageLoading, setPackageLoading] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const selectedClient = clients.find((c) => c.clientProfileId === clientProfileId) ?? null;

  // Single-slot mode: opened from an available-slot tap with a fixed date+time.
  const isSlotMode = !!presetDate;
  const presetDateLabel = presetDate
    ? (() => {
        const [yy, mm, dd] = presetDate.split('-').map(Number);
        return new Date(yy!, mm! - 1, dd!).toLocaleDateString(undefined, {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
        });
      })()
    : '';

  function resetForm() {
    setClientProfileId('');
    setSelectedDates(new Set());
    setStartTime('07:00');
    setDurationMin('60');
    setPackageInfo(null);
    setFormError('');
  }

  const fetchPackageInfo = useCallback(
    async (clientId: string, packageId: string | null, month: string) => {
      setPackageLoading(true);
      setPackageInfo(null);
      try {
        const [yStr, mStr] = month.split('-');
        const lastDay = new Date(parseInt(yStr!, 10), parseInt(mStr!, 10), 0).getDate();
        const dateFrom = `${month}-01`;
        const dateTo = `${month}-${String(lastDay).padStart(2, '0')}`;

        const requests: [Promise<Response> | null, Promise<Response>] = [
          packageId ? fetch(`/api/trainer/packages/${packageId}/window-counts`) : null,
          fetch(`/api/trainer/schedule?clientId=${clientId}&dateFrom=${dateFrom}&dateTo=${dateTo}`),
        ];
        const [windowRes, sessionsRes] = await Promise.all(requests);

        // Calendar-month-scoped existing sessions — used to gray out picked dates.
        const alreadyDates: string[] = [];
        if (sessionsRes.ok) {
          const json = await sessionsRes.json();
          const list = (json.data ?? []) as Array<{ scheduledDate: string; status: string }>;
          for (const s of list) {
            if (s.status !== 'CANCELLED') alreadyDates.push(localYMD(new Date(s.scheduledDate)));
          }
        }

        if (windowRes && windowRes.ok) {
          const { data: w } = await windowRes.json();
          setPackageInfo({
            totalSessions: w.totalSessions,
            used: w.used,
            upcoming: w.upcoming,
            remaining: w.remaining,
            daysRemaining: w.window.daysRemaining,
            planName: w.plan?.name ?? null,
            alreadyDates,
          });
        } else {
          // No package id (shouldn't happen for active clients) — still surface
          // already-booked dates so the grid stays accurate.
          setPackageInfo({
            totalSessions: 0,
            used: 0,
            upcoming: 0,
            remaining: 0,
            daysRemaining: 0,
            planName: null,
            alreadyDates,
          });
        }
      } catch {
        /* ignore */
      } finally {
        setPackageLoading(false);
      }
    },
    [],
  );

  // Apply a preset (date + start time) when the modal is opened from an
  // available-slot tap. The client is still chosen inside the modal.
  useEffect(() => {
    if (open && presetDate) {
      setScheduleMonth(presetDate.slice(0, 7));
      setSelectedDates(new Set([presetDate]));
      if (presetStartTime) setStartTime(presetStartTime);
      if (presetDurationMin) setDurationMin(String(presetDurationMin));
    }
  }, [open, presetDate, presetStartTime, presetDurationMin]);

  // Refresh package info whenever the client or month changes while open.
  useEffect(() => {
    if (open && clientProfileId) {
      void fetchPackageInfo(clientProfileId, selectedClient?.packageId ?? null, scheduleMonth);
    } else if (!clientProfileId) {
      setPackageInfo(null);
    }
    // selectedClient is derived from clientProfileId, so it's covered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, clientProfileId, scheduleMonth, fetchPackageInfo]);

  async function handleBulkCreate() {
    if (!clientProfileId) {
      setFormError('Select a client');
      return;
    }
    if (selectedDates.size === 0) {
      setFormError('Select at least one date on the calendar');
      return;
    }
    setBulkSaving(true);
    setFormError('');
    try {
      const res = await fetch('/api/trainer/sessions/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientProfileId,
          dates: Array.from(selectedDates).sort(),
          startTime,
          durationMin: parseInt(durationMin, 10),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setFormError(data.error ?? 'Failed to schedule sessions');
      } else {
        const { data } = await res.json();
        toast.success(
          `${data.created} session${data.created !== 1 ? 's' : ''} scheduled!${data.skipped.length > 0 ? ` (${data.skipped.length} skipped — already exist)` : ''}`,
        );
        onOpenChange(false);
        resetForm();
        onScheduled();
      }
    } catch {
      setFormError('Failed to schedule sessions');
    } finally {
      setBulkSaving(false);
    }
  }

  const hasPackage = !!packageInfo && packageInfo.totalSessions > 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) resetForm();
      }}
    >
      <DialogContent showCloseButton={false} className="sm:max-w-[580px] gap-0 overflow-hidden p-0">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10">
              <CalendarPlus className="h-4 w-4 text-blue-500" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">Schedule Sessions</h2>
              <p className="text-xs text-muted-foreground">
                {isSlotMode
                  ? 'Confirm this slot for a client'
                  : 'Pick specific dates for this month'}
              </p>
            </div>
          </div>
          {!isSlotMode && (
            <input
              type="month"
              value={scheduleMonth}
              onChange={(e) => {
                setScheduleMonth(e.target.value);
                setSelectedDates(new Set());
              }}
              className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          )}
        </div>

        {/* Body */}
        <div className="max-h-[72vh] space-y-3 overflow-y-auto px-4 py-3">
          {/* Single-slot booking summary */}
          {isSlotMode && (
            <div className="flex items-center gap-2.5 rounded-lg border border-blue-500/30 bg-blue-500/5 px-3 py-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/15">
                <CalendarIconLucide className="h-4 w-4 text-blue-500" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] text-muted-foreground">Booking for</p>
                <p className="text-sm font-semibold">
                  {presetDateLabel} · {formatTime12(startTime)} –{' '}
                  {formatTime12(addMinutes(startTime, parseInt(durationMin, 10) || 0))}
                </p>
              </div>
            </div>
          )}

          {/* Client */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Client</Label>
            <ClientCombobox
              clients={clients}
              value={clientProfileId}
              onChange={(v) => {
                setClientProfileId(v);
                // Keep the prefilled slot date in single-slot mode; otherwise
                // start fresh (package limits differ per client).
                setSelectedDates(presetDate ? new Set([presetDate]) : new Set());
              }}
            />
          </div>

          {clientProfileId ? (
            <>
              {/* Package info bar */}
              {packageLoading ? (
                <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading package info...
                </div>
              ) : hasPackage ? (
                (() => {
                  const rem = Math.max(0, packageInfo!.remaining - selectedDates.size);
                  const remTone =
                    rem === 0 ? 'text-red-500' : rem <= 3 ? 'text-amber-500' : 'text-emerald-500';
                  const days = packageInfo!.daysRemaining;
                  const expired = days <= 0;
                  const daysTone =
                    expired || days <= 7
                      ? 'bg-red-500/10 text-red-500'
                      : days <= 14
                        ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                        : 'bg-muted text-muted-foreground';
                  return (
                    <div className="space-y-1.5 rounded-lg border border-border/60 bg-muted/30 p-2">
                      {/* Plan name + validity */}
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[11px] font-semibold">
                          {packageInfo!.planName ?? 'PT Package'}
                        </span>
                        <span
                          className={cn(
                            'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium',
                            daysTone,
                          )}
                        >
                          {expired ? 'Expired' : `${days} day${days === 1 ? '' : 's'} left`}
                        </span>
                      </div>

                      {/* Capacity stats */}
                      <div className="grid grid-cols-3 divide-x divide-border/60 overflow-hidden rounded border border-border/60 bg-background/50">
                        <div className="px-1 py-1 text-center">
                          <p className="text-sm font-bold leading-none">{packageInfo!.used}</p>
                          <p className="mt-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">
                            Used
                          </p>
                        </div>
                        <div className="px-1 py-1 text-center">
                          <p className="text-sm font-bold leading-none">{packageInfo!.upcoming}</p>
                          <p className="mt-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">
                            Scheduled
                          </p>
                        </div>
                        <div className="px-1 py-1 text-center">
                          <p className={cn('text-sm font-bold leading-none', remTone)}>{rem}</p>
                          <p className="mt-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">
                            Remaining
                          </p>
                        </div>
                      </div>

                      {/* Total + current selection */}
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-muted-foreground">
                          {packageInfo!.totalSessions} sessions total
                        </span>
                        {selectedDates.size > 0 && (
                          <span className="font-semibold text-blue-600 dark:text-blue-400">
                            {selectedDates.size} selected now
                          </span>
                        )}
                      </div>

                      {/* Expiry warning */}
                      {expired && (
                        <div className="flex items-center gap-1.5 rounded bg-red-500/10 px-2 py-1 text-[10px] leading-tight text-red-500">
                          <AlertTriangle className="h-3 w-3 shrink-0" />
                          This package has expired — confirm with admin before booking.
                        </div>
                      )}
                    </div>
                  );
                })()
              ) : (
                <div className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
                  No active PT package for this client — scheduling without session limit
                </div>
              )}

              {/* Month calendar grid — hidden in single-slot mode (date is fixed) */}
              {!isSlotMode && (
                <div>
                  <div className="mb-1 grid grid-cols-7">
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                      <div
                        key={d}
                        className="py-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                      >
                        {d}
                      </div>
                    ))}
                  </div>
                  {buildMonthCalendar(scheduleMonth).map((week, wi) => {
                    const remaining = hasPackage
                      ? Math.max(0, packageInfo!.remaining - selectedDates.size)
                      : Infinity;
                    const todayStr = localYMD(new Date());
                    return (
                      <div key={wi} className="mb-0.5 grid grid-cols-7 gap-0.5">
                        {week.map((dateStr, di) => {
                          if (!dateStr) return <div key={di} />;
                          const isAlready = packageInfo?.alreadyDates.includes(dateStr) ?? false;
                          const isSelected = selectedDates.has(dateStr);
                          const isPast = dateStr < todayStr;
                          const canSelect = !isAlready && !isPast && (isSelected || remaining > 0);
                          const dayNum = parseInt(dateStr.split('-')[2]!, 10);
                          return (
                            <button
                              key={dateStr}
                              type="button"
                              disabled={!canSelect}
                              title={
                                isAlready
                                  ? 'Already scheduled'
                                  : isPast
                                    ? 'Past date'
                                    : !canSelect
                                      ? 'Session limit reached'
                                      : undefined
                              }
                              onClick={() => {
                                setSelectedDates((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(dateStr)) {
                                    next.delete(dateStr);
                                  } else if (remaining > 0) {
                                    next.add(dateStr);
                                  }
                                  return next;
                                });
                              }}
                              className={cn(
                                'relative flex h-9 w-full items-center justify-center rounded-lg text-sm transition-colors',
                                isAlready &&
                                  'cursor-default bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                                isSelected && 'bg-blue-600 font-semibold text-white shadow-sm',
                                !isAlready &&
                                  !isSelected &&
                                  !isPast &&
                                  canSelect &&
                                  'hover:bg-muted',
                                !isAlready &&
                                  !isSelected &&
                                  (isPast || !canSelect) &&
                                  'cursor-default text-muted-foreground/40',
                              )}
                            >
                              {dayNum}
                              {isAlready && (
                                <span className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-emerald-500" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/10">
                <CalendarIconLucide className="h-5 w-5 text-blue-500" />
              </div>
              <p className="text-sm text-muted-foreground">
                {clients.length === 0
                  ? 'No active clients assigned to you yet'
                  : isSlotMode
                    ? 'Select a client to confirm this booking'
                    : 'Select a client to get started'}
              </p>
            </div>
          )}

          {/* Start Time — full width */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Clock className="h-3 w-3" /> Start Time
            </Label>
            <Input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full appearance-none [&::-webkit-date-and-time-value]:text-left [&::-webkit-date-and-time-value]:m-0"
            />
          </div>

          {/* Error */}
          {formError && (
            <div className="flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-500">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {formError}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border/60 bg-muted/20 px-4 py-2.5">
          <p className="text-xs text-muted-foreground">
            {selectedDates.size > 0
              ? `${selectedDates.size} date${selectedDates.size !== 1 ? 's' : ''} selected`
              : 'No dates selected'}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                onOpenChange(false);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleBulkCreate}
              disabled={bulkSaving || selectedDates.size === 0 || !clientProfileId}
              className="gap-1.5 bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700"
            >
              {bulkSaving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Scheduling...
                </>
              ) : (
                <>
                  <CalendarPlus className="h-3.5 w-3.5" />
                  Schedule{selectedDates.size > 0 ? ` ${selectedDates.size}` : ''} Session
                  {selectedDates.size !== 1 ? 's' : ''}
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Reschedule Session Dialog (direct move of the trainer's own session) ─────

function RescheduleSessionDialog({
  session,
  dayYMD,
  open,
  onOpenChange,
  onSaved,
}: {
  session: DayView['sessions'][number] | null;
  /** The date the session currently sits on (YYYY-MM-DD). */
  dayYMD: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [date, setDate] = useState(dayYMD);
  const [time, setTime] = useState('07:00');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open && session) {
      setDate(dayYMD);
      setTime(session.startTime);
      setError('');
    }
  }, [open, session, dayYMD]);

  async function handleSave() {
    if (!session) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/trainer/sessions/${session.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledDate: date, scheduledTime: time }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? 'Failed to reschedule');
      } else {
        toast.success('Session rescheduled');
        onOpenChange(false);
        onSaved();
      }
    } catch {
      setError('Failed to reschedule');
    } finally {
      setSaving(false);
    }
  }

  const unchanged = !!session && date === dayYMD && time === session.startTime;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">Reschedule Session</DialogTitle>
        </DialogHeader>
        {session && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{session.clientName}</span> · currently{' '}
              {formatDateLabel(dayYMD)} at {formatTime12(session.startTime)}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <CalendarIconLucide className="h-3 w-3" /> New date
                </Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Clock className="h-3 w-3" /> New time
                </Label>
                <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
              </div>
            </div>
            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-500">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                {error}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving || unchanged}
                className="gap-1.5"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Reschedule'
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function TrainerSchedulePage() {
  const [sessions, setSessions] = useState<SessionInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<SessionInstance | null>(null);
  const [clients, setClients] = useState<SchedulerClient[]>([]);
  const [bookOpen, setBookOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [viewedDate, setViewedDate] = useState<Date>(() => new Date());
  const calendarHandle = useRef<SessionCalendarHandle>(null);

  // Mobile day-agenda state.
  const [selectedDay, setSelectedDay] = useState<Date>(() => new Date());
  const [dayView, setDayView] = useState<DayView | null>(null);
  const [dayLoading, setDayLoading] = useState(true);
  const [selectedDaySession, setSelectedDaySession] = useState<DayView['sessions'][number] | null>(
    null,
  );
  const [rescheduleSession, setRescheduleSession] = useState<DayView['sessions'][number] | null>(
    null,
  );
  // Prefill for the schedule modal when opened from an available-slot tap (or
  // from "book another client" on an already-booked session).
  const [presetDate, setPresetDate] = useState<string | null>(null);
  const [presetStartTime, setPresetStartTime] = useState<string | null>(null);
  const [presetDurationMin, setPresetDurationMin] = useState<number | null>(null);

  // Mobile shows the day-agenda; desktop keeps the FullCalendar week-grid.
  // Starts false (server + first client render) and resolves after mount to
  // avoid a hydration mismatch when the two layouts differ.
  const [isMobile, setIsMobile] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    const mq = window.matchMedia('(max-width: 640px)');
    setIsMobile(mq.matches);
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
        // Only primary clients (active PT package with this trainer) can be
        // scheduled for — reassigned clients have no package with this trainer.
        const scheduler: SchedulerClient[] = (
          data as Array<{
            clientProfile: { id: string; user: { firstName: string; lastName: string } };
            package: { id: string } | null;
            isReassigned?: boolean;
          }>
        )
          .filter((item) => !item.isReassigned)
          .map((item) => ({
            clientProfileId: item.clientProfile.id,
            name: `${item.clientProfile.user.firstName} ${item.clientProfile.user.lastName}`,
            packageId: item.package?.id ?? null,
          }));
        setClients(scheduler);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const fetchDayView = useCallback(async (date: Date) => {
    setDayLoading(true);
    try {
      const res = await fetch(`/api/trainer/schedule/day?date=${localYMD(date)}`);
      if (res.ok) {
        const { data } = await res.json();
        setDayView(data);
      }
    } finally {
      setDayLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
    fetchClients();
  }, [fetchSessions, fetchClients]);

  // Mobile agenda: (re)load the selected day whenever it changes.
  useEffect(() => {
    if (isMobile) void fetchDayView(selectedDay);
  }, [isMobile, selectedDay, fetchDayView]);

  // Refresh both views after a booking so whichever is visible stays current.
  const refreshAll = useCallback(() => {
    void fetchSessions();
    if (isMobile) void fetchDayView(selectedDay);
  }, [fetchSessions, fetchDayView, isMobile, selectedDay]);

  function openSlotBooking(time: string, durationMin = 60) {
    setPresetDate(localYMD(selectedDay));
    setPresetStartTime(time);
    setPresetDurationMin(durationMin);
    setBookOpen(true);
  }

  function clearPreset() {
    setPresetDate(null);
    setPresetStartTime(null);
    setPresetDurationMin(null);
  }

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

  // ── Mobile agenda derived values ──────────────────────────────────────────
  const todayYMD = localYMD(new Date());
  const selectedYMD = localYMD(selectedDay);
  const isSelectedToday = selectedYMD === todayYMD;
  const weekDays = weekDaysFor(selectedDay);
  const nowHHMM = (() => {
    const n = new Date();
    return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
  })();
  const dateLabel = `${isSelectedToday ? 'Today, ' : ''}${selectedDay.toLocaleDateString(
    undefined,
    {
      weekday: 'short',
    },
  )} ${selectedDay.getDate()} ${selectedDay.toLocaleDateString(undefined, { month: 'short' })}`;

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Header — title + button on a single row at every breakpoint */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Schedule</h1>
        {/* Mobile: circular FAB. Desktop: labelled button. */}
        <button
          type="button"
          aria-label="Schedule sessions"
          onClick={() => {
            clearPreset();
            setBookOpen(true);
          }}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 sm:hidden"
        >
          <Plus className="h-5 w-5" />
        </button>
        <Button
          size="sm"
          onClick={() => {
            clearPreset();
            setBookOpen(true);
          }}
          className="hidden gap-1.5 sm:inline-flex"
        >
          <Plus className="h-3.5 w-3.5" />
          Schedule Sessions
        </Button>
      </div>

      <ScheduleSessionsModal
        clients={clients}
        open={bookOpen}
        onOpenChange={(o) => {
          setBookOpen(o);
          if (!o) clearPreset();
        }}
        onScheduled={refreshAll}
        presetDate={presetDate}
        presetStartTime={presetStartTime}
        presetDurationMin={presetDurationMin}
      />

      {!mounted ? (
        <Skeleton className="h-96 w-full rounded-2xl" />
      ) : isMobile ? (
        /* ─── Mobile day agenda ─────────────────────────────────────────── */
        <div className="space-y-4">
          {/* Week strip */}
          <div className="grid grid-cols-7 gap-1">
            {weekDays.map((d) => {
              const ymd = localYMD(d);
              const isSel = ymd === selectedYMD;
              const isToday = ymd === todayYMD;
              return (
                <button
                  key={ymd}
                  type="button"
                  onClick={() => {
                    setSelectedDay(d);
                    setSelectedDaySession(null);
                  }}
                  className={cn(
                    'flex flex-col items-center gap-1 rounded-xl py-2 transition-colors',
                    isSel ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
                  )}
                >
                  <span
                    className={cn(
                      'text-[11px] font-medium',
                      isSel
                        ? 'text-primary-foreground/80'
                        : isToday
                          ? 'text-primary'
                          : 'text-muted-foreground',
                    )}
                  >
                    {d.toLocaleDateString(undefined, { weekday: 'short' })}
                  </span>
                  <span className="text-base font-semibold">{d.getDate()}</span>
                  <span
                    className={cn(
                      'h-1 w-1 rounded-full',
                      isToday ? (isSel ? 'bg-primary-foreground' : 'bg-primary') : 'bg-transparent',
                    )}
                  />
                </button>
              );
            })}
          </div>

          {/* Day summary */}
          <Card className="py-0">
            <CardContent className="flex items-center gap-3 px-4 py-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <CalendarIconLucide className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{dateLabel}</p>
                {dayLoading ? (
                  <Skeleton className="mt-1 h-3 w-40" />
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {dayView?.summary.sessionCount ?? 0} session
                    {(dayView?.summary.sessionCount ?? 0) !== 1 ? 's' : ''}
                    {' · '}
                    {formatDuration(dayView?.summary.bookedMin ?? 0)} booked
                    {' · '}
                    <span className="text-emerald-500">
                      {formatDuration(dayView?.summary.availableMin ?? 0)} available
                    </span>
                  </p>
                )}
              </div>
              {!isSelectedToday && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDay(new Date());
                    setSelectedDaySession(null);
                  }}
                  className="shrink-0 rounded-lg border border-primary/40 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/10"
                >
                  Today
                </button>
              )}
            </CardContent>
          </Card>

          {dayLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full rounded-2xl" />
              <Skeleton className="h-16 w-full rounded-2xl" />
              <Skeleton className="h-16 w-full rounded-2xl" />
            </div>
          ) : (
            <>
              {/* Your Schedule */}
              <section className="space-y-2">
                <h2 className="text-sm font-semibold">Your Schedule</h2>
                {dayView && dayView.sessions.length > 0 ? (
                  dayView.sessions.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSelectedDaySession(s)}
                      className="flex w-full items-stretch overflow-hidden rounded-2xl border border-blue-500/30 bg-blue-500/[0.04] text-left"
                    >
                      <div className="flex flex-col justify-center border-r border-blue-500/20 px-3 py-3 text-sm font-semibold text-blue-500">
                        <span className="whitespace-nowrap">{formatTime12(s.startTime)}</span>
                        <span className="whitespace-nowrap">
                          {formatTime12(addMinutes(s.startTime, s.durationMin))}
                        </span>
                      </div>
                      <div className="flex flex-1 items-center gap-3 px-3 py-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-500/15">
                          <User className="h-4 w-4 text-blue-500" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold">{s.clientName}</p>
                          <span
                            className={cn(
                              'mt-0.5 inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium',
                              STATUS_COLOR[s.status] ?? 'bg-blue-500/10 text-blue-500',
                            )}
                          >
                            {SESSION_STATUS_LABEL[s.status] ?? 'Session'}
                          </span>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatDuration(s.durationMin)} session
                          </p>
                        </div>
                        <MoreHorizontal className="h-5 w-5 shrink-0 text-muted-foreground" />
                      </div>
                    </button>
                  ))
                ) : (
                  <p className="rounded-2xl border border-border/60 bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
                    No sessions booked for this day
                  </p>
                )}
              </section>

              {/* Available Slots */}
              <section className="space-y-2">
                <div>
                  <h2 className="text-sm font-semibold">Available Slots</h2>
                  <p className="text-xs text-muted-foreground">Tap a slot to schedule a session</p>
                </div>
                {!dayView?.workingDay ? (
                  <p className="rounded-2xl border border-border/60 bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
                    You&apos;re not scheduled to work this day
                  </p>
                ) : dayView.availableSlots.length > 0 ? (
                  dayView.availableSlots.map((slot) => {
                    const isPast = isSelectedToday && slot.startTime <= nowHHMM;
                    return (
                      <div
                        key={slot.startTime}
                        className={cn(
                          'flex items-stretch overflow-hidden rounded-2xl border',
                          isPast
                            ? 'border-border/60 opacity-50'
                            : 'border-emerald-500/30 bg-emerald-500/[0.04]',
                        )}
                      >
                        <div
                          className={cn(
                            'flex flex-col justify-center border-r px-3 py-3 text-sm font-semibold',
                            isPast
                              ? 'border-border/60 text-muted-foreground'
                              : 'border-emerald-500/20 text-emerald-500',
                          )}
                        >
                          <span className="whitespace-nowrap">{formatTime12(slot.startTime)}</span>
                          <span className="whitespace-nowrap">{formatTime12(slot.endTime)}</span>
                        </div>
                        <div className="flex flex-1 items-center gap-3 px-3 py-3">
                          <div className="min-w-0 flex-1">
                            <p className="flex items-center gap-1.5 font-semibold">
                              <span
                                className={cn(
                                  'h-1.5 w-1.5 rounded-full',
                                  isPast ? 'bg-muted-foreground' : 'bg-emerald-500',
                                )}
                              />
                              Available
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {formatDuration(slot.durationMin)} slot
                            </p>
                          </div>
                          <button
                            type="button"
                            disabled={isPast}
                            aria-label={`Schedule a session at ${slot.startTime}`}
                            onClick={() => openSlotBooking(slot.startTime, slot.durationMin)}
                            className={cn(
                              'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors',
                              isPast
                                ? 'cursor-not-allowed border-border/60 text-muted-foreground'
                                : 'border-emerald-500/40 text-emerald-500 hover:bg-emerald-500/10',
                            )}
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="rounded-2xl border border-border/60 bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
                    No available slots — fully booked
                  </p>
                )}
              </section>

              {/* Legend */}
              <Card className="py-0">
                <CardContent className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 px-4 py-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-blue-500" /> Booked
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" /> Available
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-muted-foreground/50" /> Unavailable
                  </span>
                </CardContent>
              </Card>
            </>
          )}

          {/* Session details sheet */}
          <Dialog
            open={!!selectedDaySession}
            onOpenChange={(o) => !o && setSelectedDaySession(null)}
          >
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle className="text-base">Session Details</DialogTitle>
              </DialogHeader>
              {selectedDaySession && (
                <div className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Client</span>
                    <span className="font-medium">{selectedDaySession.clientName}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Time</span>
                    <span className="font-medium">
                      {formatTime12(selectedDaySession.startTime)} –{' '}
                      {formatTime12(
                        addMinutes(selectedDaySession.startTime, selectedDaySession.durationMin),
                      )}{' '}
                      ({formatDuration(selectedDaySession.durationMin)})
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Status</span>
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                        STATUS_COLOR[selectedDaySession.status] ?? 'bg-muted text-muted-foreground',
                      )}
                    >
                      {selectedDaySession.status}
                    </span>
                  </div>

                  <div className="mt-1 space-y-2">
                    {/* Direct reschedule (date/time move) of this session. */}
                    {selectedDaySession.status === 'SCHEDULED' && (
                      <Button
                        className="w-full gap-1.5"
                        onClick={() => {
                          setRescheduleSession(selectedDaySession);
                          setSelectedDaySession(null);
                        }}
                      >
                        <CalendarClock className="h-4 w-4" />
                        Reschedule
                      </Button>
                    )}
                    {/* Book a second client in the same slot (e.g. partner / group). */}
                    <Button
                      variant="outline"
                      className="w-full gap-1.5"
                      onClick={() => {
                        const time = selectedDaySession.startTime;
                        const dur = selectedDaySession.durationMin;
                        setSelectedDaySession(null);
                        openSlotBooking(time, dur);
                      }}
                    >
                      <Plus className="h-4 w-4" />
                      Book another client at this time
                    </Button>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>

          {/* Reschedule dialog */}
          <RescheduleSessionDialog
            session={rescheduleSession}
            dayYMD={selectedYMD}
            open={!!rescheduleSession}
            onOpenChange={(o) => !o && setRescheduleSession(null)}
            onSaved={() => {
              setRescheduleSession(null);
              refreshAll();
            }}
          />
        </div>
      ) : (
        /* ─── Desktop calendar ──────────────────────────────────────────── */
        <>
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
                  height={600}
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
        </>
      )}
    </div>
  );
}
