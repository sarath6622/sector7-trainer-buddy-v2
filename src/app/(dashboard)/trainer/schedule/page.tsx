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
  Timer,
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
}: {
  clients: SchedulerClient[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScheduled: () => void;
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
        <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10">
              <CalendarPlus className="h-4 w-4 text-blue-500" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">Schedule Sessions</h2>
              <p className="text-xs text-muted-foreground">Pick specific dates for this month</p>
            </div>
          </div>
          <input
            type="month"
            value={scheduleMonth}
            onChange={(e) => {
              setScheduleMonth(e.target.value);
              setSelectedDates(new Set());
            }}
            className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        {/* Body */}
        <div className="max-h-[68vh] space-y-4 overflow-y-auto px-5 py-4">
          {/* Client */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Client</Label>
            <ClientCombobox
              clients={clients}
              value={clientProfileId}
              onChange={(v) => {
                setClientProfileId(v);
                setSelectedDates(new Set());
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
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-muted/40 px-3 py-2 text-xs">
                  <span className="font-medium">
                    {packageInfo!.totalSessions} total
                    {packageInfo!.planName && (
                      <span className="ml-1 text-muted-foreground">· {packageInfo!.planName}</span>
                    )}
                  </span>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-zinc-500 dark:text-zinc-400">{packageInfo!.used} used</span>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-emerald-600 dark:text-emerald-400">
                    {packageInfo!.upcoming} scheduled
                  </span>
                  <span className="text-muted-foreground">·</span>
                  {(() => {
                    const rem = Math.max(0, packageInfo!.remaining - selectedDates.size);
                    const tone =
                      rem === 0
                        ? 'font-semibold text-red-500'
                        : rem <= 3
                          ? 'font-semibold text-amber-500'
                          : 'font-semibold text-blue-600 dark:text-blue-400';
                    return <span className={tone}>{rem} remaining</span>;
                  })()}
                  <span className="text-muted-foreground">·</span>
                  <span
                    className={
                      packageInfo!.daysRemaining <= 7
                        ? 'text-red-500'
                        : packageInfo!.daysRemaining <= 14
                          ? 'text-amber-500'
                          : 'text-muted-foreground'
                    }
                  >
                    {packageInfo!.daysRemaining} day{packageInfo!.daysRemaining === 1 ? '' : 's'}{' '}
                    left
                  </span>
                  {selectedDates.size > 0 && (
                    <>
                      <span className="text-muted-foreground">·</span>
                      <span className="font-semibold text-blue-600 dark:text-blue-400">
                        {selectedDates.size} selected
                      </span>
                    </>
                  )}
                </div>
              ) : (
                <div className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
                  No active PT package for this client — scheduling without session limit
                </div>
              )}

              {/* Month calendar grid */}
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
                              !isAlready && !isSelected && !isPast && canSelect && 'hover:bg-muted',
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
            </>
          ) : (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/10">
                <CalendarIconLucide className="h-5 w-5 text-blue-500" />
              </div>
              <p className="text-sm text-muted-foreground">
                {clients.length === 0
                  ? 'No active clients assigned to you yet'
                  : 'Select a client to get started'}
              </p>
            </div>
          )}

          {/* Start Time & Duration */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Clock className="h-3 w-3" /> Start Time
              </Label>
              <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Timer className="h-3 w-3" /> Duration (min)
              </Label>
              <Input
                type="number"
                min="15"
                step="15"
                value={durationMin}
                onChange={(e) => setDurationMin(e.target.value)}
              />
            </div>
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
        <div className="flex items-center justify-between border-t border-border/60 bg-muted/20 px-5 py-3">
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
          <span className="hidden sm:inline">Schedule Sessions</span>
          <span className="sm:hidden">Schedule</span>
        </Button>
      </div>

      <ScheduleSessionsModal
        clients={clients}
        open={bookOpen}
        onOpenChange={setBookOpen}
        onScheduled={fetchSessions}
      />

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
