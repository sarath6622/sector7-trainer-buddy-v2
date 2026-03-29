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
  DialogFooter,
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
  SkipForward,
  Timer,
  Trash2,
  User,
  Users,
  Zap,
} from 'lucide-react';
import type { EventInput, EventClickArg, DateSelectArg, DatesSetArg } from '@fullcalendar/core';
import { toast } from 'sonner';
import { useConfirm } from '@/hooks/use-confirm';
import { cn } from '@/lib/utils';

interface Schedule {
  id: string;
  trainerProfileId: string;
  clientProfileId: string;
  dayOfWeek: string;
  startTime: string;
  durationMin: number;
  isActive: boolean;
  validFrom: string;
  validUntil: string | null;
  client: { user: { firstName: string; lastName: string } };
  trainer: { user: { firstName: string; lastName: string } };
}

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

interface PreviewClient {
  scheduleId: string;
  clientName: string;
  dayOfWeek: string;
  startTime: string;
  durationMin: number;
  dates: string[];
}

interface GeneratePreview {
  willCreate: number;
  daysAffected: number;
  skippedDueToOverride: { scheduleId: string; date: string; reason: string }[];
  skippedDueToConflict: { scheduleId: string; date: string; reason: string }[];
  preview: { trainerName: string; clients: PreviewClient[] }[];
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

interface SmartSlot {
  startTime: string;
  endTime: string;
  freeTrainers: { id: string; name: string; currentLoad: number }[];
  busyTrainerCount: number;
  score: number;
}

interface SmartData {
  durationMin: number;
  recommendations: { day: string; slots: SmartSlot[] }[];
}

interface TrainerWeekDay {
  day: string;
  isWorkingDay: boolean;
  workStart?: string;
  workEnd?: string;
  bookedSlots: { startTime: string; durationMin: number; clientName: string }[];
  freeWindows: { startTime: string; endTime: string; durationMin: number }[];
}

interface TrainerAvailData {
  trainer: {
    id: string;
    name: string;
    workingDays: string[];
    workStart: string;
    workEnd: string;
    totalScheduledSessions: number;
  };
  weekView: TrainerWeekDay[];
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

export default function SchedulingPage() {
  const { confirm, ConfirmDialog } = useConfirm();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [sessions, setSessions] = useState<SessionInstance[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [trainers, setTrainers] = useState<TrainerOption[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [recurringDialogOpen, setRecurringDialogOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<SessionInstance | null>(null);
  const [selectedTrainer, setSelectedTrainer] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [generatePreview, setGeneratePreview] = useState<GeneratePreview | null>(null);
  const [excludedScheduleIds, setExcludedScheduleIds] = useState<Set<string>>(new Set());
  const [previewing, setPreviewing] = useState(false);
  const [editingSession, setEditingSession] = useState(false);
  const [editForm, setEditForm] = useState({
    scheduledDate: '',
    scheduledTime: '',
    trainerProfileId: '',
  });
  const [editSaving, setEditSaving] = useState(false);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [scheduleEditForm, setScheduleEditForm] = useState({ startTime: '', durationMin: '' });
  const [scheduleEditSaving, setScheduleEditSaving] = useState(false);
  const [scheduleTrainerFilter, setScheduleTrainerFilter] = useState('');

  // Availability check modal
  const [availCheckOpen, setAvailCheckOpen] = useState(false);
  const [availMode, setAvailMode] = useState<'smart' | 'trainer'>('smart');
  const [availLoading, setAvailLoading] = useState(false);
  const [availSmartData, setAvailSmartData] = useState<SmartData | null>(null);
  const [availTrainerData, setAvailTrainerData] = useState<TrainerAvailData | null>(null);
  const [availTrainerId, setAvailTrainerId] = useState('');
  const [availDuration, setAvailDuration] = useState(60);

  const [generateMonth, setGenerateMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

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
    sessionsPerMonth: number;
    alreadyScheduled: number;
    alreadyDates: string[];
  } | null>(null);
  const [packageLoading, setPackageLoading] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [clientMappings, setClientMappings] = useState<
    Array<{ trainerProfileId: string; sessionsPerMonth: number }>
  >([]);
  const [mappingsLoading, setMappingsLoading] = useState(false);

  const fetchSchedules = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/schedules');
      if (res.ok) {
        const { data } = await res.json();
        setSchedules(data);
      }
    } catch {
      /* ignore */
    }
  }, []);

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
      const [tRes, cRes] = await Promise.all([
        fetch('/api/admin/users?role=TRAINER&pageSize=100'),
        fetch('/api/admin/users?role=CLIENT&pageSize=100'),
      ]);
      if (tRes.ok) {
        const { data } = await tRes.json();
        setTrainers(data);
      }
      if (cRes.ok) {
        const { data } = await cRes.json();
        setClients(data);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    // fetchSessions is omitted here — FullCalendar fires datesSet on mount
    // which calls fetchSessions with the correct visible range automatically.
    Promise.all([fetchSchedules(), fetchTrainersAndClients()]).finally(() => setLoading(false));
  }, [fetchSchedules, fetchTrainersAndClients]);

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

  async function fetchAvailability() {
    setAvailLoading(true);
    setAvailSmartData(null);
    setAvailTrainerData(null);
    try {
      if (availMode === 'smart') {
        const res = await fetch(
          `/api/admin/availability-check?mode=smart&durationMin=${availDuration}`,
        );
        if (res.ok) setAvailSmartData(await res.json());
      } else {
        if (!availTrainerId) return;
        const res = await fetch(
          `/api/admin/availability-check?mode=trainer&trainerId=${availTrainerId}`,
        );
        if (res.ok) setAvailTrainerData(await res.json());
      }
    } catch {
      /* ignore */
    } finally {
      setAvailLoading(false);
    }
  }

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
          data as Array<{ trainerProfileId: string; sessionsPerMonth: number; isActive: boolean }>
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
        const [yStr, mStr] = month.split('-');
        const lastDay = new Date(parseInt(yStr!, 10), parseInt(mStr!, 10), 0).getDate();
        const dateFrom = `${month}-01`;
        const dateTo = `${month}-${String(lastDay).padStart(2, '0')}`;
        const [mappingRes, sessionsRes] = await Promise.all([
          fetch(`/api/admin/mappings?clientId=${clientId}`),
          fetch(
            `/api/admin/sessions?clientId=${clientId}&trainerId=${trainerId}&dateFrom=${dateFrom}&dateTo=${dateTo}&pageSize=100`,
          ),
        ]);
        let sessionsPerMonth = 0;
        if (mappingRes.ok) {
          const { data } = await mappingRes.json();
          const pkg = (
            data as Array<{ trainerProfileId: string; sessionsPerMonth: number; isActive: boolean }>
          ).find((p) => p.trainerProfileId === trainerId && p.isActive);
          if (pkg) sessionsPerMonth = pkg.sessionsPerMonth;
        }
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
        setPackageInfo({ sessionsPerMonth, alreadyScheduled: alreadyDates.length, alreadyDates });
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

  async function handlePreviewGenerate() {
    setPreviewing(true);
    setExcludedScheduleIds(new Set());
    try {
      const res = await fetch('/api/admin/schedules/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: generateMonth, dryRun: true }),
      });
      if (res.ok) {
        const { data } = await res.json();
        setGeneratePreview(data);
      } else {
        toast.error('Failed to preview sessions');
      }
    } catch {
      toast.error('Failed to preview sessions');
    } finally {
      setPreviewing(false);
    }
  }

  function toggleScheduleExclusion(scheduleId: string) {
    setExcludedScheduleIds((prev) => {
      const next = new Set(prev);
      if (next.has(scheduleId)) {
        next.delete(scheduleId);
      } else {
        next.add(scheduleId);
      }
      return next;
    });
  }

  async function handleSaveScheduleEdit(scheduleId: string) {
    setScheduleEditSaving(true);
    try {
      const res = await fetch(`/api/admin/schedules/${scheduleId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startTime: scheduleEditForm.startTime,
          durationMin: parseInt(scheduleEditForm.durationMin, 10),
        }),
      });
      if (res.ok) {
        setEditingScheduleId(null);
        toast.success('Schedule updated — refreshing preview...');
        await fetchSchedules();
        // Re-run dry-run to refresh preview
        const previewRes = await fetch('/api/admin/schedules/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ month: generateMonth, dryRun: true }),
        });
        if (previewRes.ok) {
          const { data } = await previewRes.json();
          setGeneratePreview(data);
        }
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to update schedule');
      }
    } catch {
      toast.error('Failed to update schedule');
    } finally {
      setScheduleEditSaving(false);
    }
  }

  // Compute selected counts from preview
  const selectedPreviewCount = useMemo(() => {
    if (!generatePreview) return { sessions: 0, days: 0 };
    let sessions = 0;
    const days = new Set<string>();
    for (const trainer of generatePreview.preview) {
      for (const client of trainer.clients) {
        if (!excludedScheduleIds.has(client.scheduleId)) {
          sessions += client.dates.length;
          client.dates.forEach((d) => days.add(d));
        }
      }
    }
    return { sessions, days: days.size };
  }, [generatePreview, excludedScheduleIds]);

  async function handleConfirmGenerate() {
    if (!generatePreview) return;

    // Collect only the selected schedule IDs
    const allScheduleIds = generatePreview.preview.flatMap((t) =>
      t.clients.map((c) => c.scheduleId),
    );
    const selectedIds = allScheduleIds.filter((id) => !excludedScheduleIds.has(id));
    if (selectedIds.length === 0) {
      toast.error('No schedules selected');
      return;
    }

    setGenerating(true);
    setGeneratePreview(null);
    setConflicts([]);
    try {
      const res = await fetch('/api/admin/schedules/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: generateMonth,
          scheduleIds: selectedIds,
        }),
      });
      if (res.ok) {
        const { data } = await res.json();
        setConflicts(data.conflicts);
        await fetchSessions();
        toast.success(
          `Generated ${data.created} sessions.${data.conflicts.length > 0 ? ` ${data.conflicts.length} conflict(s) found.` : ''}`,
        );
      }
    } catch {
      toast.error('Failed to generate sessions');
    } finally {
      setGenerating(false);
    }
  }

  async function handleDeleteSchedule(scheduleId: string) {
    const ok = await confirm({
      title: 'Deactivate Schedule',
      description: 'Deactivate this recurring schedule?',
      confirmText: 'Deactivate',
      variant: 'destructive',
    });
    if (!ok) return;
    try {
      await fetch(`/api/admin/schedules/${scheduleId}`, { method: 'DELETE' });
      await fetchSchedules();
    } catch {
      /* ignore */
    }
  }

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
  const calendarEvents: EventInput[] = filteredSessions.map((s) => {
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
  const activeScheduleCount = schedules.filter((s) => s.isActive).length;

  return (
    <div className="mx-auto max-w-6xl space-y-4 pb-8">
      {/* Header row */}
      <div className="flex flex-col gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Scheduling</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {sessionCount} session{sessionCount !== 1 ? 's' : ''} &middot; {scheduledCount} upcoming
            &middot; {completedCount} completed
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          {/* Generate Sessions */}
          <div className="flex items-center gap-2">
            <Input
              type="month"
              value={generateMonth}
              onChange={(e) => setGenerateMonth(e.target.value)}
              className="h-8 w-[140px] text-sm"
            />
            <Button
              onClick={handlePreviewGenerate}
              disabled={generating || previewing}
              size="sm"
              className="h-8 gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-700"
            >
              {previewing ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading...
                </>
              ) : generating ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <CalendarPlus className="h-3.5 w-3.5" />
                  Generate
                </>
              )}
            </Button>
          </div>

          {/* Secondary actions row */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Recurring Schedules — opens dialog */}
            <Dialog
              open={recurringDialogOpen}
              onOpenChange={(v) => {
                setRecurringDialogOpen(v);
                if (!v) setScheduleTrainerFilter('');
              }}
            >
              <DialogTrigger
                render={
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    Recurring
                    <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">
                      {activeScheduleCount}
                    </Badge>
                  </Button>
                }
              />
              <DialogContent className="w-[min(92vw,1100px)] sm:max-w-[1100px] gap-0 overflow-hidden p-0">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-border/60 px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
                      <Calendar className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <h2 className="text-sm font-semibold">Recurring Schedules</h2>
                      <p className="text-xs text-muted-foreground">
                        {schedules.length} schedule{schedules.length !== 1 ? 's' : ''} ·{' '}
                        {schedules.filter((s) => s.isActive).length} active
                      </p>
                    </div>
                  </div>
                  {/* Trainer filter */}
                  <select
                    className="h-8 rounded-lg border border-border bg-muted/40 px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    value={scheduleTrainerFilter}
                    onChange={(e) => setScheduleTrainerFilter(e.target.value)}
                  >
                    <option value="">All Trainers</option>
                    {Array.from(
                      new Set(
                        schedules.map(
                          (s) => `${s.trainer.user.firstName} ${s.trainer.user.lastName}`,
                        ),
                      ),
                    )
                      .sort()
                      .map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                  </select>
                </div>

                {/* Table */}
                {schedules.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-16 text-center">
                    <Calendar className="h-8 w-8 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">No recurring schedules yet.</p>
                    <p className="text-xs text-muted-foreground/60">
                      Create one with &ldquo;+ New Schedule&rdquo;.
                    </p>
                  </div>
                ) : (
                  <div className="max-h-[55vh] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur-sm">
                        <tr className="border-b border-border/50">
                          {[
                            'Client',
                            'Trainer',
                            'Day',
                            'Time',
                            'Duration',
                            'Valid From',
                            'Status',
                            '',
                          ].map((h) => (
                            <th
                              key={h}
                              className="whitespace-nowrap px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/30">
                        {schedules.map((s) => {
                          const trainerName = `${s.trainer.user.firstName} ${s.trainer.user.lastName}`;
                          if (scheduleTrainerFilter && trainerName !== scheduleTrainerFilter)
                            return null;
                          const dayLabel =
                            s.dayOfWeek.charAt(0) + s.dayOfWeek.slice(1).toLowerCase();
                          const DAY_COLOR: Record<string, string> = {
                            Monday: 'bg-blue-500/10 text-blue-400',
                            Tuesday: 'bg-violet-500/10 text-violet-400',
                            Wednesday: 'bg-emerald-500/10 text-emerald-400',
                            Thursday: 'bg-orange-500/10 text-orange-400',
                            Friday: 'bg-pink-500/10 text-pink-400',
                            Saturday: 'bg-amber-500/10 text-amber-400',
                            Sunday: 'bg-red-500/10 text-red-400',
                          };
                          return (
                            <tr
                              key={s.id}
                              className={`transition-colors hover:bg-muted/20 ${!s.isActive ? 'opacity-50' : ''}`}
                            >
                              <td className="whitespace-nowrap px-4 py-3 font-medium">
                                {s.client.user.firstName} {s.client.user.lastName}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                                {trainerName}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3">
                                <span
                                  className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold ${DAY_COLOR[dayLabel] ?? 'bg-muted text-muted-foreground'}`}
                                >
                                  {dayLabel}
                                </span>
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">
                                {formatTime12(s.startTime)}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                                {s.durationMin} min
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                                {new Date(s.validFrom).toLocaleDateString('en-GB', {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric',
                                })}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3">
                                {s.isActive ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-500">
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                    Active
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-zinc-500/10 px-2 py-0.5 text-[10px] font-semibold text-zinc-500">
                                    Inactive
                                  </span>
                                )}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3">
                                {s.isActive && (
                                  <button
                                    onClick={() => handleDeleteSchedule(s.id)}
                                    className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500"
                                    title="Deactivate"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Footer */}
                <div className="flex items-center justify-between border-t border-border/60 bg-muted/20 px-6 py-3">
                  <p className="text-xs text-muted-foreground">
                    {schedules.filter((s) => s.isActive).length} active ·{' '}
                    {schedules.filter((s) => !s.isActive).length} inactive
                  </p>
                  <button
                    onClick={() => {
                      setRecurringDialogOpen(false);
                      setCreateDialogOpen(true);
                    }}
                    className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    <Plus className="h-3 w-3" /> New Schedule
                  </button>
                </div>
              </DialogContent>
            </Dialog>

            {/* Trainer Availability Check */}
            <Dialog
              open={availCheckOpen}
              onOpenChange={(v) => {
                setAvailCheckOpen(v);
                if (!v) {
                  setAvailSmartData(null);
                  setAvailTrainerData(null);
                }
              }}
            >
              <DialogTrigger
                render={
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <Activity className="h-3.5 w-3.5" />
                    Availability
                  </Button>
                }
              />
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/10">
                      <Activity className="h-4 w-4 text-violet-500" />
                    </div>
                    <div>
                      <span>Trainer Availability Check</span>
                      <p className="mt-0.5 text-xs font-normal text-muted-foreground">
                        Find the best time slots or inspect a single trainer&apos;s schedule
                      </p>
                    </div>
                  </DialogTitle>
                </DialogHeader>

                {/* Mode tabs */}
                <div className="flex gap-1 rounded-xl bg-muted/50 p-1">
                  <button
                    onClick={() => {
                      setAvailMode('smart');
                      setAvailSmartData(null);
                      setAvailTrainerData(null);
                    }}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-colors ${
                      availMode === 'smart'
                        ? 'bg-background text-foreground shadow-sm ring-1 ring-border/50'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Zap className="h-3.5 w-3.5" />
                    Smart Slot Finder
                  </button>
                  <button
                    onClick={() => {
                      setAvailMode('trainer');
                      setAvailSmartData(null);
                      setAvailTrainerData(null);
                    }}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-colors ${
                      availMode === 'trainer'
                        ? 'bg-background text-foreground shadow-sm ring-1 ring-border/50'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <User className="h-3.5 w-3.5" />
                    Single Trainer View
                  </button>
                </div>

                {/* Controls */}
                <div className="flex items-end gap-3">
                  {availMode === 'smart' ? (
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-muted-foreground">
                        Session Duration
                      </Label>
                      <div className="flex gap-1.5">
                        {[30, 45, 60, 90].map((d) => (
                          <button
                            key={d}
                            onClick={() => setAvailDuration(d)}
                            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                              availDuration === d
                                ? 'bg-primary text-primary-foreground shadow-sm'
                                : 'bg-muted/60 text-muted-foreground hover:bg-muted'
                            }`}
                          >
                            {d}m
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 space-y-1.5">
                      <Label className="text-xs font-medium text-muted-foreground">
                        Select Trainer
                      </Label>
                      <FormSearchSelect
                        options={trainers
                          .filter((t) => t.trainerProfile)
                          .map((t) => ({
                            value: t.trainerProfile!.id,
                            label: `${t.firstName} ${t.lastName}`,
                          }))}
                        value={availTrainerId}
                        onChange={setAvailTrainerId}
                        placeholder="Choose a trainer"
                        icon={User}
                      />
                    </div>
                  )}
                  <Button
                    onClick={fetchAvailability}
                    disabled={availLoading || (availMode === 'trainer' && !availTrainerId)}
                    size="sm"
                    className="gap-1.5 bg-violet-600 text-white hover:bg-violet-700 dark:bg-violet-600 dark:hover:bg-violet-700"
                  >
                    {availLoading ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Checking...
                      </>
                    ) : (
                      <>
                        <Search className="h-3.5 w-3.5" />
                        Check
                      </>
                    )}
                  </Button>
                </div>

                {/* Results */}
                <div className="max-h-[420px] overflow-y-auto space-y-3">
                  {/* Smart results */}
                  {availMode === 'smart' &&
                    availSmartData &&
                    (availSmartData.recommendations.length === 0 ? (
                      <p className="py-6 text-center text-sm text-muted-foreground">
                        No free slots found. All trainers are fully booked.
                      </p>
                    ) : (
                      availSmartData.recommendations.map(({ day, slots }) => (
                        <div key={day} className="rounded-xl bg-muted/30 p-3 ring-1 ring-border/40">
                          <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                            {day.charAt(0) + day.slice(1).toLowerCase()}
                          </p>
                          <div className="space-y-1.5">
                            {slots.map((slot, i) => (
                              <div
                                key={i}
                                className="flex items-center justify-between rounded-lg bg-background px-3 py-2 ring-1 ring-border/50"
                              >
                                <div className="flex items-center gap-3">
                                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/10">
                                    <Clock className="h-3.5 w-3.5 text-violet-500" />
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium">
                                      {formatTime12(slot.startTime)} – {formatTime12(slot.endTime)}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      {slot.freeTrainers.length} trainer
                                      {slot.freeTrainers.length !== 1 ? 's' : ''} free
                                      {slot.busyTrainerCount > 0 &&
                                        ` · ${slot.busyTrainerCount} busy`}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex flex-wrap justify-end gap-1">
                                  {slot.freeTrainers.slice(0, 3).map((t) => (
                                    <span
                                      key={t.id}
                                      className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400"
                                    >
                                      {t.name.split(' ')[0]}
                                      <span className="ml-1 opacity-60">({t.currentLoad})</span>
                                    </span>
                                  ))}
                                  {slot.freeTrainers.length > 3 && (
                                    <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                                      +{slot.freeTrainers.length - 3}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))
                    ))}

                  {/* Trainer view results */}
                  {availMode === 'trainer' && availTrainerData && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-3 rounded-xl bg-muted/40 px-4 py-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/10">
                          <User className="h-4 w-4 text-violet-500" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold">{availTrainerData.trainer.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {availTrainerData.trainer.workStart} –{' '}
                            {availTrainerData.trainer.workEnd}
                            {' · '}
                            {availTrainerData.trainer.totalScheduledSessions} recurring session
                            {availTrainerData.trainer.totalScheduledSessions !== 1 ? 's' : ''}
                          </p>
                        </div>
                      </div>
                      {availTrainerData.weekView.map((dayView) => (
                        <div
                          key={dayView.day}
                          className={`rounded-xl p-3 ring-1 ${
                            dayView.isWorkingDay
                              ? 'bg-muted/30 ring-border/40'
                              : 'bg-muted/10 ring-border/20 opacity-50'
                          }`}
                        >
                          <div className="mb-2 flex items-center justify-between">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              {dayView.day.charAt(0) + dayView.day.slice(1).toLowerCase()}
                            </p>
                            {!dayView.isWorkingDay && (
                              <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                                Day off
                              </span>
                            )}
                          </div>
                          {dayView.isWorkingDay && (
                            <div className="grid gap-2 sm:grid-cols-2">
                              {dayView.bookedSlots.length > 0 && (
                                <div className="space-y-1">
                                  <p className="text-[10px] font-medium uppercase tracking-wide text-red-500/70">
                                    Booked
                                  </p>
                                  {dayView.bookedSlots.map((s, i) => (
                                    <div
                                      key={i}
                                      className="flex items-center gap-2 rounded-lg bg-red-500/5 px-2.5 py-1.5 ring-1 ring-red-500/10"
                                    >
                                      <Clock className="h-3 w-3 shrink-0 text-red-400" />
                                      <span className="text-xs">
                                        {formatTime12(s.startTime)}
                                        <span className="ml-1 text-muted-foreground">
                                          ({s.durationMin}m)
                                        </span>
                                        <span className="ml-1 font-medium">
                                          {' '}
                                          · {s.clientName.split(' ')[0]}
                                        </span>
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {dayView.freeWindows.length > 0 ? (
                                <div className="space-y-1">
                                  <p className="text-[10px] font-medium uppercase tracking-wide text-emerald-500/70">
                                    Free
                                  </p>
                                  {dayView.freeWindows.map((w, i) => (
                                    <div
                                      key={i}
                                      className="flex items-center gap-2 rounded-lg bg-emerald-500/5 px-2.5 py-1.5 ring-1 ring-emerald-500/10"
                                    >
                                      <Check className="h-3 w-3 shrink-0 text-emerald-400" />
                                      <span className="text-xs">
                                        {formatTime12(w.startTime)} – {formatTime12(w.endTime)}
                                        <span className="ml-1 text-muted-foreground">
                                          ({w.durationMin}m)
                                        </span>
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-xs text-muted-foreground italic">Fully booked</p>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Empty state */}
                  {!availLoading && !availSmartData && !availTrainerData && (
                    <div className="flex flex-col items-center gap-2 py-8 text-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500/10">
                        <Activity className="h-5 w-5 text-violet-500" />
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {availMode === 'smart'
                          ? 'Click Check to find the best available slots across all trainers'
                          : 'Select a trainer and click Check to view their weekly schedule'}
                      </p>
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>

            {/* New Schedule — opens dialog */}
            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
              <DialogTrigger
                render={
                  <Button
                    size="sm"
                    className="gap-1.5 bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700"
                  >
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
                      ) : packageInfo && packageInfo.sessionsPerMonth > 0 ? (
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-muted/40 px-3 py-2 text-xs">
                          <span className="font-medium">
                            {packageInfo.sessionsPerMonth} sessions/month
                          </span>
                          <span className="text-muted-foreground">·</span>
                          <span className="text-emerald-600 dark:text-emerald-400">
                            {packageInfo.alreadyScheduled} scheduled
                          </span>
                          <span className="text-muted-foreground">·</span>
                          {(() => {
                            const rem = Math.max(
                              0,
                              packageInfo.sessionsPerMonth -
                                packageInfo.alreadyScheduled -
                                selectedDates.size,
                            );
                            return (
                              <span
                                className={
                                  rem > 0
                                    ? 'font-semibold text-blue-600 dark:text-blue-400'
                                    : 'font-semibold text-red-500'
                                }
                              >
                                {rem} remaining
                              </span>
                            );
                          })()}
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
                            packageInfo && packageInfo.sessionsPerMonth > 0
                              ? Math.max(
                                  0,
                                  packageInfo.sessionsPerMonth -
                                    packageInfo.alreadyScheduled -
                                    selectedDates.size,
                                )
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
                                      isSelected &&
                                        'bg-blue-600 font-semibold text-white shadow-sm',
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
                        onChange={(e) =>
                          setForm((prev) => ({ ...prev, startTime: e.target.value }))
                        }
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
          {/* end secondary actions row */}
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

      {/* Generate Preview Dialog */}
      <Dialog
        open={!!generatePreview}
        onOpenChange={(v) => {
          if (!v) {
            setGeneratePreview(null);
            setExcludedScheduleIds(new Set());
            setEditingScheduleId(null);
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-base">Generate Sessions — Preview</DialogTitle>
            <p className="text-xs text-muted-foreground">
              Review, edit, or toggle schedules before generating. Changes to time/duration update
              the recurring schedule.
            </p>
          </DialogHeader>
          {generatePreview && (
            <div className="space-y-3 flex-1 overflow-hidden flex flex-col">
              {/* Summary stats */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded-lg border bg-emerald-50 px-3 py-2 dark:bg-emerald-950/30">
                  <p className="text-xl font-bold text-emerald-700 dark:text-emerald-400">
                    {selectedPreviewCount.sessions}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {selectedPreviewCount.sessions === 1 ? 'Session' : 'Sessions'} selected
                  </p>
                </div>
                <div className="rounded-lg border bg-blue-50 px-3 py-2 dark:bg-blue-950/30">
                  <p className="text-xl font-bold text-blue-700 dark:text-blue-400">
                    {selectedPreviewCount.days}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {selectedPreviewCount.days === 1 ? 'Day' : 'Days'} affected
                  </p>
                </div>
                {generatePreview.skippedDueToOverride.length > 0 && (
                  <div className="rounded-lg border bg-amber-50 px-3 py-2 dark:bg-amber-950/30">
                    <p className="text-xl font-bold text-amber-700 dark:text-amber-400">
                      {generatePreview.skippedDueToOverride.length}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Skipped (unavailable)</p>
                  </div>
                )}
                {generatePreview.skippedDueToConflict.length > 0 && (
                  <div className="rounded-lg border bg-red-50 px-3 py-2 dark:bg-red-950/30">
                    <p className="text-xl font-bold text-red-700 dark:text-red-400">
                      {generatePreview.skippedDueToConflict.length}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Skipped (conflicts)</p>
                  </div>
                )}
              </div>

              {/* Nothing to create */}
              {generatePreview.willCreate === 0 && (
                <p className="text-sm text-muted-foreground">
                  No new sessions to generate. All schedules already have instances for this month.
                </p>
              )}

              {/* Trainer breakdown with toggleable & editable schedules */}
              {generatePreview.preview.length > 0 && (
                <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0">
                  {generatePreview.preview.map((trainer) => {
                    const trainerSelectedCount = trainer.clients.reduce(
                      (sum, c) =>
                        sum + (excludedScheduleIds.has(c.scheduleId) ? 0 : c.dates.length),
                      0,
                    );
                    return (
                      <div key={trainer.trainerName} className="rounded-lg border">
                        <div className="border-b bg-muted/40 px-3 py-1.5 flex items-center justify-between">
                          <span className="text-xs font-semibold flex items-center gap-1.5">
                            <User className="h-3 w-3 text-muted-foreground" />
                            {trainer.trainerName}
                          </span>
                          <Badge variant="secondary" className="text-[10px]">
                            {trainerSelectedCount}{' '}
                            {trainerSelectedCount === 1 ? 'session' : 'sessions'}
                          </Badge>
                        </div>
                        <div className="divide-y">
                          {trainer.clients.map((client) => {
                            const isExcluded = excludedScheduleIds.has(client.scheduleId);
                            const isEditing = editingScheduleId === client.scheduleId;
                            return (
                              <div
                                key={client.scheduleId}
                                className={`px-3 py-2 transition-opacity ${isExcluded ? 'opacity-40' : ''}`}
                              >
                                {/* Client row */}
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => toggleScheduleExclusion(client.scheduleId)}
                                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                                      isExcluded
                                        ? 'border-muted-foreground/30 bg-transparent'
                                        : 'border-emerald-600 bg-emerald-600'
                                    }`}
                                  >
                                    {!isExcluded && <Check className="h-3 w-3 text-white" />}
                                  </button>
                                  <span className="text-xs font-medium flex-1 truncate">
                                    {client.clientName}
                                  </span>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    {!isEditing && (
                                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                                        {client.dayOfWeek.slice(0, 3)} &middot; {client.startTime}{' '}
                                        &middot; {client.durationMin}min
                                      </span>
                                    )}
                                    {!isExcluded && !isEditing && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditingScheduleId(client.scheduleId);
                                          setScheduleEditForm({
                                            startTime: client.startTime,
                                            durationMin: String(client.durationMin),
                                          });
                                        }}
                                        className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                        title="Edit schedule timing"
                                      >
                                        <Pencil className="h-3 w-3" />
                                      </button>
                                    )}
                                    <Badge
                                      variant={isExcluded ? 'outline' : 'secondary'}
                                      className="text-[10px]"
                                    >
                                      {client.dates.length}{' '}
                                      {client.dates.length === 1 ? 'date' : 'dates'}
                                    </Badge>
                                  </div>
                                </div>

                                {/* Inline edit form */}
                                {isEditing && !isExcluded && (
                                  <div className="mt-2 ml-6 flex items-end gap-2 rounded-md border bg-muted/30 p-2">
                                    <div className="flex-1">
                                      <Label className="text-[10px] text-muted-foreground mb-0.5 block">
                                        Time
                                      </Label>
                                      <Input
                                        type="time"
                                        value={scheduleEditForm.startTime}
                                        onChange={(e) =>
                                          setScheduleEditForm((f) => ({
                                            ...f,
                                            startTime: e.target.value,
                                          }))
                                        }
                                        className="h-7 text-xs"
                                      />
                                    </div>
                                    <div className="w-20">
                                      <Label className="text-[10px] text-muted-foreground mb-0.5 block">
                                        Duration
                                      </Label>
                                      <Input
                                        type="number"
                                        min={15}
                                        step={15}
                                        value={scheduleEditForm.durationMin}
                                        onChange={(e) =>
                                          setScheduleEditForm((f) => ({
                                            ...f,
                                            durationMin: e.target.value,
                                          }))
                                        }
                                        className="h-7 text-xs"
                                      />
                                    </div>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 px-2 text-xs"
                                      onClick={() => setEditingScheduleId(null)}
                                    >
                                      Cancel
                                    </Button>
                                    <Button
                                      size="sm"
                                      className="h-7 px-2 text-xs gap-1 bg-emerald-600 text-white hover:bg-emerald-700"
                                      disabled={scheduleEditSaving}
                                      onClick={() => handleSaveScheduleEdit(client.scheduleId)}
                                    >
                                      {scheduleEditSaving ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                      ) : (
                                        <Check className="h-3 w-3" />
                                      )}
                                      Save
                                    </Button>
                                  </div>
                                )}

                                {/* Date pills */}
                                {!isExcluded && !isEditing && (
                                  <div className="mt-1.5 ml-6 flex flex-wrap gap-1">
                                    {client.dates.map((date) => (
                                      <span
                                        key={date}
                                        className="inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                                      >
                                        {new Date(date + 'T00:00:00').toLocaleDateString('en-IN', {
                                          weekday: 'short',
                                          day: 'numeric',
                                          month: 'short',
                                        })}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Skipped details */}
              {(generatePreview.skippedDueToConflict.length > 0 ||
                generatePreview.skippedDueToOverride.length > 0) && (
                <div className="space-y-1.5 border-t pt-2">
                  {generatePreview.skippedDueToConflict.length > 0 && (
                    <details className="text-xs">
                      <summary className="cursor-pointer font-medium text-red-600 dark:text-red-400">
                        <SkipForward className="mr-1 inline h-3 w-3" />
                        {generatePreview.skippedDueToConflict.length} skipped due to conflicts
                      </summary>
                      <ul className="mt-1 ml-4 list-disc space-y-0.5 text-muted-foreground">
                        {generatePreview.skippedDueToConflict.map((s, i) => (
                          <li key={i}>
                            {s.date}: {s.reason}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                  {generatePreview.skippedDueToOverride.length > 0 && (
                    <details className="text-xs">
                      <summary className="cursor-pointer font-medium text-amber-600 dark:text-amber-400">
                        <AlertTriangle className="mr-1 inline h-3 w-3" />
                        {generatePreview.skippedDueToOverride.length} skipped due to unavailability
                      </summary>
                      <ul className="mt-1 ml-4 list-disc space-y-0.5 text-muted-foreground">
                        {generatePreview.skippedDueToOverride.map((s, i) => (
                          <li key={i}>
                            {s.date}: {s.reason}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              )}
            </div>
          )}
          <DialogFooter className="border-t pt-3 mt-0">
            <Button
              variant="outline"
              onClick={() => {
                setGeneratePreview(null);
                setExcludedScheduleIds(new Set());
                setEditingScheduleId(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmGenerate}
              disabled={generating || selectedPreviewCount.sessions === 0}
              className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {generating ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Check className="h-3.5 w-3.5" />
                  Confirm & Generate
                  {selectedPreviewCount.sessions > 0 && (
                    <span className="font-normal opacity-80">
                      ({selectedPreviewCount.sessions}{' '}
                      {selectedPreviewCount.sessions === 1 ? 'session' : 'sessions'},{' '}
                      {selectedPreviewCount.days} {selectedPreviewCount.days === 1 ? 'day' : 'days'}
                      )
                    </span>
                  )}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {ConfirmDialog}
    </div>
  );
}
