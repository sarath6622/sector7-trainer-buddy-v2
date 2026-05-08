'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { SessionCalendar } from '@/components/calendar/SessionCalendar';
import {
  Activity,
  AlertTriangle,
  Calendar,
  CalendarPlus,
  Check,
  ChevronDown,
  Clock,
  Loader2,
  Maximize2,
  Minimize2,
  Pencil,
  Plus,
  Search,
  Timer,
  Trash2,
  User,
  Users,
} from 'lucide-react';
import type { EventInput, EventClickArg, DateSelectArg, DatesSetArg } from '@fullcalendar/core';
import { toast } from 'sonner';
import { useConfirm } from '@/hooks/use-confirm';
import { cn } from '@/lib/utils';
import { TrainerAvailabilityDialog } from '@/components/trainer-availability-dialog';

interface SessionInstance {
  id: string;
  scheduledDate: string;
  scheduledTime: string;
  durationMin: number;
  status: string;
  client: { user: { firstName: string; lastName: string } };
  trainer: { user: { firstName: string; lastName: string } };
}

interface Conflict {
  sessionA: { id: string; scheduledDate: string; scheduledTime: string; clientName: string };
  sessionB: { id: string; scheduledDate: string; scheduledTime: string; clientName: string };
  trainerName: string;
  overlapMinutes: number;
}

interface TrainerOption {
  id: string;
  firstName: string;
  lastName: string;
  trainerProfile: { id: string } | null;
}

interface ClientOption {
  id: string;
  firstName: string;
  lastName: string;
  clientProfile: { id: string } | null;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const DAYS_OF_WEEK = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

const TRAINER_COLORS = [
  '#3b82f6',
  '#8b5cf6',
  '#06b6d4',
  '#f59e0b',
  '#ef4444',
  '#22c55e',
  '#ec4899',
  '#14b8a6',
  '#f97316',
  '#6366f1',
];

function getTrainerColor(index: number) {
  return TRAINER_COLORS[index % TRAINER_COLORS.length]!;
}

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

/** Client-side duplicate of timeSlotsOverlap for live conflict previews. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function slotsOverlap(startA: string, durA: number, startB: string, durB: number): number {
  const toMin = (t: string) => {
    const [h = '0', m = '0'] = t.split(':');
    return parseInt(h) * 60 + parseInt(m);
  };
  const s1 = toMin(startA),
    e1 = s1 + durA,
    s2 = toMin(startB),
    e2 = s2 + durB;
  return Math.max(0, Math.min(e1, e2) - Math.max(s1, s2));
}

function formatTime12(t: string) {
  const [h = '0', m = '00'] = t.split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

function TrainerCombobox({
  trainerNames,
  value,
  onChange,
}: {
  trainerNames: string[];
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = trainerNames.filter((name) => name.toLowerCase().includes(search.toLowerCase()));

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => {
          setOpen(!open);
          setSearch('');
        }}
        className="flex h-8 w-[140px] items-center justify-between rounded-lg border border-input bg-transparent px-2.5 text-sm transition-colors hover:bg-muted/50"
      >
        <span className={value ? '' : 'text-muted-foreground'}>{value ?? 'All Trainers'}</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-[220px] overflow-hidden rounded-lg bg-popover shadow-lg ring-1 ring-foreground/10">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search trainers..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-[200px] overflow-y-auto p-1">
            <button
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors ${
                value === null ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
              }`}
            >
              All Trainers
            </button>
            {filtered.map((name) => (
              <button
                key={name}
                onClick={() => {
                  onChange(name);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors ${
                  value === name ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
                }`}
              >
                {name}
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-2.5 py-3 text-center text-xs text-muted-foreground">
                No trainers found
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function FormSearchSelect({
  options,
  value,
  onChange,
  placeholder,
  icon: Icon,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);
  const filtered = options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()));

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
          setOpen(!open);
          setSearch('');
        }}
        className="flex h-10 w-full items-center gap-2 rounded-lg border border-input bg-transparent px-3 text-sm transition-colors hover:bg-muted/50"
      >
        {Icon && <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />}
        <span className={selected ? 'flex-1 text-left' : 'flex-1 text-left text-muted-foreground'}>
          {selected?.label ?? placeholder}
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
              placeholder="Search..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-[200px] overflow-y-auto p-1">
            {filtered.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center rounded-md px-2.5 py-2 text-sm transition-colors ${
                  value === opt.value ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
                }`}
              >
                {opt.label}
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-2.5 py-3 text-center text-xs text-muted-foreground">No results</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const JS_DAY_MAP = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

interface CrossfitClassForCalendar {
  id: string;
  name: string;
  dayOfWeek: string;
  startTime: string;
  durationMin: number;
  isActive: boolean;
  trainers: Array<{ trainer: { user: { firstName: string; lastName: string } } }>;
}

/** Returns all dates (as YYYY-MM-DD) within [dateFrom, dateTo] that match dayOfWeek. */
function getDatesForDayInRange(dayOfWeek: string, dateFrom: string, dateTo: string): string[] {
  const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  const targetDay = days.indexOf(dayOfWeek);
  if (targetDay === -1) return [];
  const dates: string[] = [];
  const end = new Date(dateTo + 'T23:59:59');
  const cur = new Date(dateFrom + 'T00:00:00');
  // advance to first matching weekday
  while (cur.getDay() !== targetDay) cur.setDate(cur.getDate() + 1);
  while (cur <= end) {
    dates.push(
      `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`,
    );
    cur.setDate(cur.getDate() + 7);
  }
  return dates;
}

export default function SchedulingPage() {
  const { confirm, ConfirmDialog } = useConfirm();
  const [sessions, setSessions] = useState<SessionInstance[]>([]);
  const [conflicts] = useState<Conflict[]>([]);
  const [crossfitClasses, setCrossfitClasses] = useState<CrossfitClassForCalendar[]>([]);
  const [trainers, setTrainers] = useState<TrainerOption[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<SessionInstance | null>(null);
  const [selectedTrainer, setSelectedTrainer] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [editingSession, setEditingSession] = useState(false);
  const [editForm, setEditForm] = useState({
    scheduledDate: '',
    scheduledTime: '',
    trainerProfileId: '',
  });
  const [editSaving, setEditSaving] = useState(false);

  // Availability check modal
  const [availCheckOpen, setAvailCheckOpen] = useState(false);

  const [form, setForm] = useState({
    trainerProfileId: '',
    clientProfileId: '',
    startTime: '07:00',
    durationMin: '60',
  });
  const [formError, setFormError] = useState('');
  const [scheduleMonth, setScheduleMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [packageInfo, setPackageInfo] = useState<{
    packageId: string;
    sessionsPerMonth: number;
    totalSessions: number;
    used: number;
    upcoming: number;
    remaining: number;
    daysRemaining: number;
    windowEnd: string;
    planName: string | null;
    alreadyScheduled: number;
    alreadyDates: string[];
  } | null>(null);
  const [packageLoading, setPackageLoading] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [clientMappings, setClientMappings] = useState<
    Array<{ id: string; trainerProfileId: string; sessionsPerMonth: number }>
  >([]);
  const [mappingsLoading, setMappingsLoading] = useState(false);

  // Tracks the calendar's currently visible date range so fetchSessions always loads
  // the right data regardless of what the "Generate" month picker is set to.
  const calendarRangeRef = useRef({
    start: (() => {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    })(),
    end: (() => {
      const now = new Date();
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    })(),
  });

  const fetchSessions = useCallback(async (dateFrom?: string, dateTo?: string) => {
    try {
      const from = dateFrom ?? calendarRangeRef.current.start;
      const to = dateTo ?? calendarRangeRef.current.end;
      const res = await fetch(`/api/admin/sessions?pageSize=500&dateFrom=${from}&dateTo=${to}`);
      if (res.ok) {
        const json = await res.json();
        setSessions(json.data ?? []);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const fetchTrainersAndClients = useCallback(async () => {
    try {
      const [tRes, cRes, cfRes] = await Promise.all([
        fetch('/api/admin/users?role=TRAINER&pageSize=100'),
        fetch('/api/admin/users?role=CLIENT&pageSize=100'),
        fetch('/api/admin/crossfit/classes'),
      ]);
      if (tRes.ok) {
        const { data } = await tRes.json();
        setTrainers(data);
      }
      if (cRes.ok) {
        const { data } = await cRes.json();
        setClients(data);
      }
      if (cfRes.ok) {
        const { data } = await cfRes.json();
        setCrossfitClasses((data ?? []).filter((c: CrossfitClassForCalendar) => c.isActive));
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    // fetchSessions is omitted here — FullCalendar fires datesSet on mount
    // which calls fetchSessions with the correct visible range automatically.
    fetchTrainersAndClients().finally(() => setLoading(false));
  }, [fetchTrainersAndClients]);

  // Unique trainer names from sessions for filter chips
  const trainerNames = useMemo(() => {
    const map = new Map<string, string>();
    sessions.forEach((s) => {
      const name = `${s.trainer.user.firstName} ${s.trainer.user.lastName}`;
      if (!map.has(name)) map.set(name, name);
    });
    return Array.from(map.values()).sort();
  }, [sessions]);

  // Filtered sessions
  const filteredSessions = useMemo(() => {
    if (!selectedTrainer) return sessions;
    return sessions.filter(
      (s) => `${s.trainer.user.firstName} ${s.trainer.user.lastName}` === selectedTrainer,
    );
  }, [sessions, selectedTrainer]);

  const fetchClientMappings = useCallback(async (clientId: string) => {
    setMappingsLoading(true);
    setClientMappings([]);
    setForm((prev) => ({ ...prev, trainerProfileId: '' }));
    setSelectedDates(new Set());
    try {
      const res = await fetch(`/api/admin/mappings?clientId=${clientId}`);
      if (res.ok) {
        const { data } = await res.json();
        const active = (
          data as Array<{
            id: string;
            trainerProfileId: string;
            sessionsPerMonth: number;
            isActive: boolean;
          }>
        ).filter((p) => p.isActive);
        setClientMappings(active);
        // Auto-select trainer when only one active mapping exists
        if (active.length === 1) {
          setForm((prev) => ({ ...prev, trainerProfileId: active[0]!.trainerProfileId }));
        }
      }
    } catch {
      /* ignore */
    } finally {
      setMappingsLoading(false);
    }
  }, []);

  const fetchPackageInfo = useCallback(
    async (clientId: string, trainerId: string, month: string) => {
      setPackageLoading(true);
      setPackageInfo(null);
      try {
        // First find the active package for this client+trainer pair
        const mappingRes = await fetch(`/api/admin/mappings?clientId=${clientId}`);
        if (!mappingRes.ok) return;
        const { data } = await mappingRes.json();
        const pkg = (
          data as Array<{
            id: string;
            trainerProfileId: string;
            sessionsPerMonth: number;
            isActive: boolean;
          }>
        ).find((p) => p.trainerProfileId === trainerId && p.isActive);
        if (!pkg) return;

        // Get package-window counts (full startDate→endDate scope)
        const [yStr, mStr] = month.split('-');
        const lastDay = new Date(parseInt(yStr!, 10), parseInt(mStr!, 10), 0).getDate();
        const dateFrom = `${month}-01`;
        const dateTo = `${month}-${String(lastDay).padStart(2, '0')}`;
        const [windowRes, sessionsRes] = await Promise.all([
          fetch(`/api/admin/mappings/${pkg.id}/window-counts`),
          fetch(
            `/api/admin/sessions?clientId=${clientId}&trainerId=${trainerId}&dateFrom=${dateFrom}&dateTo=${dateTo}&pageSize=100`,
          ),
        ]);

        // alreadyDates is calendar-month scoped — used to gray out picked dates
        const alreadyDates: string[] = [];
        if (sessionsRes.ok) {
          const json = await sessionsRes.json();
          const list = (json.data ?? []) as Array<{ scheduledDate: string; status: string }>;
          for (const s of list) {
            if (s.status !== 'CANCELLED') {
              alreadyDates.push(new Date(s.scheduledDate).toISOString().split('T')[0]!);
            }
          }
        }

        if (windowRes.ok) {
          const { data: w } = await windowRes.json();
          setPackageInfo({
            packageId: pkg.id,
            sessionsPerMonth: w.sessionsPerMonth,
            totalSessions: w.totalSessions,
            used: w.used,
            upcoming: w.upcoming,
            remaining: w.remaining,
            daysRemaining: w.window.daysRemaining,
            windowEnd: w.window.end,
            planName: w.plan?.name ?? null,
            alreadyScheduled: alreadyDates.length,
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

  async function handleBulkCreate() {
    if (!form.trainerProfileId || !form.clientProfileId) {
      setFormError('Select both a trainer and a client');
      return;
    }
    if (selectedDates.size === 0) {
      setFormError('Select at least one date on the calendar');
      return;
    }
    setBulkSaving(true);
    setFormError('');
    try {
      const res = await fetch('/api/admin/sessions/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientProfileId: form.clientProfileId,
          trainerProfileId: form.trainerProfileId,
          dates: Array.from(selectedDates).sort(),
          startTime: form.startTime,
          durationMin: parseInt(form.durationMin, 10),
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
        setCreateDialogOpen(false);
        setForm({
          trainerProfileId: '',
          clientProfileId: '',
          startTime: '07:00',
          durationMin: '60',
        });
        setSelectedDates(new Set());
        setPackageInfo(null);
        setClientMappings([]);
        setFormError('');
        await fetchSessions();
      }
    } catch {
      setFormError('Failed to schedule sessions');
    } finally {
      setBulkSaving(false);
    }
  }

  // Fetch client's trainer mappings whenever client selection changes
  useEffect(() => {
    if (createDialogOpen && form.clientProfileId) {
      void fetchClientMappings(form.clientProfileId);
    } else if (!form.clientProfileId) {
      setClientMappings([]);
    }
  }, [createDialogOpen, form.clientProfileId, fetchClientMappings]);

  // Auto-fetch PT package info whenever the dialog's pair or month changes
  useEffect(() => {
    if (createDialogOpen && form.trainerProfileId && form.clientProfileId) {
      void fetchPackageInfo(form.clientProfileId, form.trainerProfileId, scheduleMonth);
    } else if (!form.trainerProfileId || !form.clientProfileId) {
      setPackageInfo(null);
    }
  }, [
    createDialogOpen,
    form.trainerProfileId,
    form.clientProfileId,
    scheduleMonth,
    fetchPackageInfo,
  ]);

  function handleStartEdit() {
    if (!selectedSession) return;
    setEditForm({
      scheduledDate: new Date(selectedSession.scheduledDate).toISOString().split('T')[0]!,
      scheduledTime: selectedSession.scheduledTime,
      trainerProfileId: '',
    });
    setEditingSession(true);
  }

  async function handleSaveEdit() {
    if (!selectedSession) return;
    setEditSaving(true);
    try {
      const body: Record<string, string> = {};
      const origDate = new Date(selectedSession.scheduledDate).toISOString().split('T')[0];
      if (editForm.scheduledDate && editForm.scheduledDate !== origDate) {
        body.scheduledDate = editForm.scheduledDate;
      }
      if (editForm.scheduledTime && editForm.scheduledTime !== selectedSession.scheduledTime) {
        body.scheduledTime = editForm.scheduledTime;
      }
      if (editForm.trainerProfileId) {
        body.trainerProfileId = editForm.trainerProfileId;
      }

      if (Object.keys(body).length === 0) {
        setEditingSession(false);
        return;
      }

      const res = await fetch(`/api/admin/sessions/${selectedSession.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        toast.success('Session updated');
        setSelectedSession(null);
        setEditingSession(false);
        await fetchSessions();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to update session');
      }
    } catch {
      toast.error('Failed to update session');
    } finally {
      setEditSaving(false);
    }
  }

  async function handleCancelSession() {
    if (!selectedSession) return;
    const ok = await confirm({
      title: 'Cancel Session',
      description: `Cancel the session for ${selectedSession.client.user.firstName} ${selectedSession.client.user.lastName} on ${new Date(selectedSession.scheduledDate).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}?`,
      confirmText: 'Cancel Session',
      variant: 'destructive',
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/admin/sessions/${selectedSession.id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Session cancelled');
        setSelectedSession(null);
        await fetchSessions();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to cancel session');
      }
    } catch {
      toast.error('Failed to cancel session');
    }
  }

  function handleDatesSet(info: DatesSetArg) {
    // Use local date parts — toISOString() shifts to UTC and breaks IST/negative-offset timezones
    const localYMD = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const dateFrom = localYMD(info.start);
    // info.end is exclusive (one day past the last visible day)
    const endExclusive = new Date(info.end);
    endExclusive.setDate(endExclusive.getDate() - 1);
    const dateTo = localYMD(endExclusive);
    calendarRangeRef.current = { start: dateFrom, end: dateTo };
    void fetchSessions(dateFrom, dateTo);
  }

  function handleEventClick(info: EventClickArg) {
    // CrossFit events are read-only — don't open the PT session panel
    if (info.event.extendedProps?.isCrossfit) return;
    setEditingSession(false);
    const session = sessions.find((s) => s.id === info.event.id);
    setSelectedSession(session ?? null);
  }

  function handleDateSelect(info: DateSelectArg) {
    const date = info.start;
    const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const startTime = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    const dateStr = date.toISOString().split('T')[0]!;
    setScheduleMonth(month);
    setForm((prev) => ({ ...prev, startTime: startTime === '00:00' ? prev.startTime : startTime }));
    setSelectedDates(new Set([dateStr]));
    setCreateDialogOpen(true);
  }

  // Escape key exits fullscreen
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && isFullscreen) setIsFullscreen(false);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isFullscreen]);

  // Convert sessions to calendar events
  const ptEvents: EventInput[] = filteredSessions.map((s) => {
    const [h, m] = s.scheduledTime.split(':').map(Number);
    const start = new Date(s.scheduledDate);
    start.setHours(h!, m!, 0);
    const end = new Date(start);
    end.setMinutes(end.getMinutes() + s.durationMin);

    const trainerName = `${s.trainer.user.firstName} ${s.trainer.user.lastName}`;
    const trainerIdx = trainerNames.indexOf(trainerName);

    return {
      id: s.id,
      title: `${s.client.user.firstName} — ${s.trainer.user.firstName}`,
      start,
      end,
      extendedProps: {
        status: s.status,
        trainerColor: getTrainerColor(trainerIdx >= 0 ? trainerIdx : 0),
      },
    };
  });

  // Generate CrossFit recurring events for the currently visible range
  const crossfitEvents: EventInput[] = crossfitClasses.flatMap((cls) => {
    const { start: rangeFrom, end: rangeTo } = calendarRangeRef.current;
    const dates = getDatesForDayInRange(cls.dayOfWeek, rangeFrom, rangeTo);
    return dates.map((dateStr) => {
      const [h, m] = cls.startTime.split(':').map(Number);
      const start = new Date(dateStr + 'T00:00:00');
      start.setHours(h!, m!, 0);
      const end = new Date(start);
      end.setMinutes(end.getMinutes() + cls.durationMin);
      const trainerLabel = cls.trainers.map((t) => t.trainer.user.firstName).join(', ');
      return {
        id: `cf-${cls.id}-${dateStr}`,
        title: `${cls.name}${trainerLabel ? ` — ${trainerLabel}` : ''}`,
        start,
        end,
        extendedProps: {
          status: 'CROSSFIT',
          trainerColor: '#f97316', // orange for CrossFit
          isCrossfit: true,
        },
      };
    });
  });

  const calendarEvents: EventInput[] = [...ptEvents, ...crossfitEvents];

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-6 pb-8">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-10 w-full rounded-xl" />
        <Skeleton className="h-[500px] rounded-2xl" />
      </div>
    );
  }

  const sessionCount = filteredSessions.length;
  const scheduledCount = filteredSessions.filter((s) => s.status === 'SCHEDULED').length;
  const completedCount = filteredSessions.filter((s) => s.status === 'COMPLETED').length;
  return (
    <div className="mx-auto max-w-6xl space-y-4 pb-8">
      {/* Header row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Scheduling</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {sessionCount} session{sessionCount !== 1 ? 's' : ''} · {scheduledCount} upcoming ·{' '}
            {completedCount} completed
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Trainer Availability Check */}
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setAvailCheckOpen(true)}
          >
            <Activity className="h-3.5 w-3.5" />
            <span className="sm:hidden">Availability</span>
            <span className="hidden sm:inline">Check Trainer Availability</span>
          </Button>

          {/* New Schedule — opens dialog */}
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger
              render={
                <Button size="sm" className="gap-1.5">
                  <Plus className="h-3.5 w-3.5" />
                  New Schedule
                </Button>
              }
            />
            <DialogContent
              showCloseButton={false}
              className="sm:max-w-[580px] gap-0 overflow-hidden p-0"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10">
                    <CalendarPlus className="h-4 w-4 text-blue-500" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold">Schedule Sessions</h2>
                    <p className="text-xs text-muted-foreground">
                      Pick specific dates for this month
                    </p>
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
              <div className="max-h-[68vh] overflow-y-auto px-5 py-4 space-y-4">
                {/* Client first, then Trainer (auto-filled from mapping) */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">Client</Label>
                    <FormSearchSelect
                      options={clients
                        .filter((c) => c.clientProfile)
                        .map((c) => ({
                          value: c.clientProfile!.id,
                          label: `${c.firstName} ${c.lastName}`,
                        }))}
                      value={form.clientProfileId}
                      onChange={(v) => {
                        setForm((prev) => ({ ...prev, clientProfileId: v }));
                        setSelectedDates(new Set());
                      }}
                      placeholder="Select client"
                      icon={Users}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      Trainer
                      {mappingsLoading && (
                        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                      )}
                    </Label>
                    <FormSearchSelect
                      options={
                        form.clientProfileId && clientMappings.length > 0
                          ? trainers
                              .filter(
                                (t) =>
                                  t.trainerProfile &&
                                  clientMappings.some(
                                    (m) => m.trainerProfileId === t.trainerProfile!.id,
                                  ),
                              )
                              .map((t) => ({
                                value: t.trainerProfile!.id,
                                label: `${t.firstName} ${t.lastName}`,
                              }))
                          : trainers
                              .filter((t) => t.trainerProfile)
                              .map((t) => ({
                                value: t.trainerProfile!.id,
                                label: `${t.firstName} ${t.lastName}`,
                              }))
                      }
                      value={form.trainerProfileId}
                      onChange={(v) => {
                        setForm((prev) => ({ ...prev, trainerProfileId: v }));
                        setSelectedDates(new Set());
                      }}
                      placeholder={
                        mappingsLoading
                          ? 'Loading...'
                          : form.clientProfileId && clientMappings.length === 0
                            ? 'No mapped trainer'
                            : 'Select trainer'
                      }
                      icon={User}
                    />
                  </div>
                </div>

                {/* Calendar + package info — only when pair is selected */}
                {form.trainerProfileId && form.clientProfileId ? (
                  <>
                    {/* Package info bar */}
                    {packageLoading ? (
                      <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Loading package info...
                      </div>
                    ) : packageInfo && packageInfo.totalSessions > 0 ? (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-muted/40 px-3 py-2 text-xs">
                        <span className="font-medium">
                          {packageInfo.totalSessions} total
                          {packageInfo.planName && (
                            <span className="ml-1 text-muted-foreground">
                              · {packageInfo.planName}
                            </span>
                          )}
                        </span>
                        <span className="text-muted-foreground">·</span>
                        <span className="text-zinc-500 dark:text-zinc-400">
                          {packageInfo.used} used
                        </span>
                        <span className="text-muted-foreground">·</span>
                        <span className="text-emerald-600 dark:text-emerald-400">
                          {packageInfo.upcoming} scheduled
                        </span>
                        <span className="text-muted-foreground">·</span>
                        {(() => {
                          const rem = Math.max(0, packageInfo.remaining - selectedDates.size);
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
                            packageInfo.daysRemaining <= 7
                              ? 'text-red-500'
                              : packageInfo.daysRemaining <= 14
                                ? 'text-amber-500'
                                : 'text-muted-foreground'
                          }
                        >
                          {packageInfo.daysRemaining} day
                          {packageInfo.daysRemaining === 1 ? '' : 's'} left
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
                    ) : !packageLoading ? (
                      <div className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
                        No active PT package for this pairing — scheduling without session limit
                      </div>
                    ) : null}

                    {/* Month calendar grid */}
                    <div>
                      {/* Day headers */}
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
                      {/* Weeks */}
                      {buildMonthCalendar(scheduleMonth).map((week, wi) => {
                        const remaining =
                          packageInfo && packageInfo.totalSessions > 0
                            ? Math.max(0, packageInfo.remaining - selectedDates.size)
                            : Infinity;
                        const todayStr = new Date().toISOString().split('T')[0]!;
                        return (
                          <div key={wi} className="mb-0.5 grid grid-cols-7 gap-0.5">
                            {week.map((dateStr, di) => {
                              if (!dateStr) return <div key={di} />;
                              const isAlready =
                                packageInfo?.alreadyDates.includes(dateStr) ?? false;
                              const isSelected = selectedDates.has(dateStr);
                              const isPast = dateStr < todayStr;
                              const canSelect =
                                !isAlready && !isPast && (isSelected || remaining > 0);
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
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-2 py-10 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/10">
                      <Calendar className="h-5 w-5 text-blue-500" />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {!form.clientProfileId
                        ? 'Select a client to get started'
                        : mappingsLoading
                          ? 'Loading trainer mappings...'
                          : form.clientProfileId && clientMappings.length === 0
                            ? 'No active trainer mapping found for this client'
                            : 'Select a trainer to see the calendar'}
                    </p>
                  </div>
                )}

                {/* Start Time & Duration */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <Clock className="h-3 w-3" /> Start Time
                    </Label>
                    <Input
                      type="time"
                      value={form.startTime}
                      onChange={(e) => setForm((prev) => ({ ...prev, startTime: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <Timer className="h-3 w-3" /> Duration (min)
                    </Label>
                    <Input
                      type="number"
                      min="15"
                      step="15"
                      value={form.durationMin}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, durationMin: e.target.value }))
                      }
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
                      setCreateDialogOpen(false);
                      setForm({
                        trainerProfileId: '',
                        clientProfileId: '',
                        startTime: '07:00',
                        durationMin: '60',
                      });
                      setSelectedDates(new Set());
                      setPackageInfo(null);
                      setClientMappings([]);
                      setFormError('');
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleBulkCreate}
                    disabled={
                      bulkSaving ||
                      selectedDates.size === 0 ||
                      !form.trainerProfileId ||
                      !form.clientProfileId
                    }
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
        </div>
      </div>

      {/* Conflicts */}
      {conflicts.length > 0 && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 ring-1 ring-red-500/10">
          <div className="flex items-center gap-2 text-sm font-semibold text-red-600 dark:text-red-400">
            <AlertTriangle className="h-4 w-4" />
            {conflicts.length} Scheduling Conflict{conflicts.length !== 1 ? 's' : ''}
          </div>
          <div className="mt-3 space-y-2">
            {conflicts.map((c, i) => (
              <div
                key={i}
                className="flex items-start gap-3 rounded-xl bg-card p-3 ring-1 ring-border/50"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-500/10">
                  <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                </div>
                <div className="text-sm">
                  <p className="font-medium">{c.trainerName}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.sessionA.clientName} ({c.sessionA.scheduledTime}) overlaps{' '}
                    {c.sessionB.clientName} ({c.sessionB.scheduledTime}) — {c.overlapMinutes}min
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Calendar */}
      {isFullscreen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => setIsFullscreen(false)}
        />
      )}
      <div
        className={`rounded-2xl bg-card p-4 ring-1 ring-border/50 transition-all ${
          isFullscreen ? 'fixed inset-4 z-50 overflow-auto shadow-2xl' : ''
        }`}
      >
        <SessionCalendar
          events={calendarEvents}
          onEventClick={handleEventClick}
          onDateSelect={handleDateSelect}
          onDatesSet={handleDatesSet}
          selectable
          height={isFullscreen ? 'auto' : undefined}
          initialView="timeGridWeek"
          filterSlot={
            <div className="flex items-center gap-3">
              {trainerNames.length > 1 && (
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
                    Filter
                  </span>
                  <TrainerCombobox
                    trainerNames={trainerNames}
                    value={selectedTrainer}
                    onChange={setSelectedTrainer}
                  />
                </div>
              )}
              <button
                onClick={() => setIsFullscreen(!isFullscreen)}
                className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              >
                {isFullscreen ? (
                  <Minimize2 className="h-4 w-4" />
                ) : (
                  <Maximize2 className="h-4 w-4" />
                )}
              </button>
            </div>
          }
        />
      </div>

      {/* Selected Session Detail — Dialog */}
      <Dialog
        open={!!selectedSession}
        onOpenChange={(v) => {
          if (!v) {
            setSelectedSession(null);
            setEditingSession(false);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingSession ? 'Edit Session' : 'Session Details'}</DialogTitle>
          </DialogHeader>
          {selectedSession && !editingSession && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/10">
                    <User className="h-4 w-4 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Client</p>
                    <p className="text-sm font-medium">
                      {selectedSession.client.user.firstName} {selectedSession.client.user.lastName}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-500/10">
                    <Users className="h-4 w-4 text-violet-500" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Trainer</p>
                    <p className="text-sm font-medium">
                      {selectedSession.trainer.user.firstName}{' '}
                      {selectedSession.trainer.user.lastName}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10">
                    <Clock className="h-4 w-4 text-amber-500" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Date & Time</p>
                    <p className="text-sm font-medium">
                      {new Date(selectedSession.scheduledDate).toLocaleDateString('en-IN', {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                      })}{' '}
                      at {formatTime12(selectedSession.scheduledTime)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10">
                    <Calendar className="h-4 w-4 text-emerald-500" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Status</p>
                    <Badge
                      variant={
                        selectedSession.status === 'COMPLETED'
                          ? 'default'
                          : selectedSession.status === 'NO_SHOW'
                            ? 'destructive'
                            : 'secondary'
                      }
                      className="mt-0.5"
                    >
                      {selectedSession.status.replace('_', ' ')}
                    </Badge>
                  </div>
                </div>
              </div>

              {selectedSession.status === 'SCHEDULED' && (
                <div className="flex gap-2 border-t pt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 gap-1.5"
                    onClick={handleStartEdit}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 gap-1.5 text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/30"
                    onClick={handleCancelSession}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Cancel Session
                  </Button>
                </div>
              )}
            </div>
          )}

          {selectedSession && editingSession && (
            <div className="space-y-4">
              <div className="space-y-3">
                <div>
                  <Label className="text-xs">Date</Label>
                  <Input
                    type="date"
                    value={editForm.scheduledDate}
                    onChange={(e) => setEditForm((f) => ({ ...f, scheduledDate: e.target.value }))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Start Time</Label>
                  <Input
                    type="time"
                    value={editForm.scheduledTime}
                    onChange={(e) => setEditForm((f) => ({ ...f, scheduledTime: e.target.value }))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Reassign Trainer (optional)</Label>
                  <select
                    value={editForm.trainerProfileId}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, trainerProfileId: e.target.value }))
                    }
                    className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="">Keep current trainer</option>
                    {trainers.map((t) => (
                      <option key={t.id} value={t.trainerProfile?.id ?? ''}>
                        {t.firstName} {t.lastName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => setEditingSession(false)}
                >
                  Back
                </Button>
                <Button
                  size="sm"
                  className="flex-1 gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
                  onClick={handleSaveEdit}
                  disabled={editSaving}
                >
                  {editSaving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  Save Changes
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {ConfirmDialog}

      <TrainerAvailabilityDialog
        open={availCheckOpen}
        onOpenChange={setAvailCheckOpen}
        trainers={trainers
          .filter((t) => t.trainerProfile)
          .map((t) => ({ id: t.trainerProfile!.id, name: `${t.firstName} ${t.lastName}` }))}
      />
    </div>
  );
}
