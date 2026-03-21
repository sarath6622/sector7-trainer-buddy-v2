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
  AlertTriangle,
  Calendar,
  CalendarPlus,
  ChevronDown,
  Clock,
  Loader2,
  Maximize2,
  Minimize2,
  Plus,
  Search,
  Timer,
  User,
  Users,
  X,
} from 'lucide-react';
import type { EventInput, EventClickArg, DateSelectArg } from '@fullcalendar/core';
import { toast } from 'sonner';
import { useConfirm } from '@/hooks/use-confirm';

interface Schedule {
  id: string;
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
        className="flex h-8 w-[180px] items-center justify-between rounded-lg border border-input bg-transparent px-2.5 text-sm transition-colors hover:bg-muted/50"
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

  const [generateMonth, setGenerateMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const [form, setForm] = useState({
    trainerProfileId: '',
    clientProfileId: '',
    dayOfWeek: 'MONDAY',
    startTime: '07:00',
    durationMin: '60',
    validFrom: new Date().toISOString().split('T')[0],
    validUntil: '',
  });
  const [formError, setFormError] = useState('');
  const [formSaving, setFormSaving] = useState(false);

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

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/sessions?pageSize=100');
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
    Promise.all([fetchSchedules(), fetchSessions(), fetchTrainersAndClients()]).finally(() =>
      setLoading(false),
    );
  }, [fetchSchedules, fetchSessions, fetchTrainersAndClients]);

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

  async function handleCreateSchedule() {
    if (!form.trainerProfileId || !form.clientProfileId) {
      setFormError('Select both a trainer and a client');
      return;
    }
    setFormSaving(true);
    setFormError('');
    try {
      const res = await fetch('/api/admin/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trainerProfileId: form.trainerProfileId,
          clientProfileId: form.clientProfileId,
          dayOfWeek: form.dayOfWeek,
          startTime: form.startTime,
          durationMin: parseInt(form.durationMin, 10),
          validFrom: form.validFrom,
          validUntil: form.validUntil || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setFormError(data.error ?? 'Failed to create schedule');
      } else {
        setCreateDialogOpen(false);
        setForm({
          trainerProfileId: '',
          clientProfileId: '',
          dayOfWeek: 'MONDAY',
          startTime: '07:00',
          durationMin: '60',
          validFrom: new Date().toISOString().split('T')[0],
          validUntil: '',
        });
        setFormError('');
        await fetchSchedules();
      }
    } catch {
      setFormError('Failed to create schedule');
    } finally {
      setFormSaving(false);
    }
  }

  async function handleGenerate() {
    setGenerating(true);
    setConflicts([]);
    try {
      const res = await fetch('/api/admin/schedules/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: generateMonth }),
      });
      if (res.ok) {
        const { data } = await res.json();
        setConflicts(data.conflicts);
        await fetchSessions();
        toast.success(
          `Generated ${data.created} sessions. ${data.conflicts.length} conflicts found.`,
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

  function handleEventClick(info: EventClickArg) {
    const session = sessions.find((s) => s.id === info.event.id);
    setSelectedSession(session ?? null);
  }

  function handleDateSelect(info: DateSelectArg) {
    const date = info.start;
    const dayOfWeek = JS_DAY_MAP[date.getDay()]!;
    const startTime = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    const validFrom = date.toISOString().split('T')[0];
    setForm((prev) => ({ ...prev, dayOfWeek, startTime, validFrom }));
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Scheduling</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {sessionCount} session{sessionCount !== 1 ? 's' : ''} &middot; {scheduledCount} upcoming
            &middot; {completedCount} completed
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Generate Sessions */}
          <div className="flex items-center gap-2">
            <Input
              type="month"
              value={generateMonth}
              onChange={(e) => setGenerateMonth(e.target.value)}
              className="h-8 w-[150px] text-sm"
            />
            <Button
              onClick={handleGenerate}
              disabled={generating}
              size="sm"
              className="h-8 gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-700"
            >
              {generating ? (
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

          <div className="hidden h-5 w-px bg-border sm:block" />

          {/* Recurring Schedules — opens dialog */}
          <Dialog open={recurringDialogOpen} onOpenChange={setRecurringDialogOpen}>
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
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Recurring Schedules</DialogTitle>
              </DialogHeader>
              {schedules.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No recurring schedules yet. Create one to get started.
                </p>
              ) : (
                <div className="max-h-[400px] space-y-2 overflow-y-auto">
                  {schedules.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between rounded-xl bg-muted/40 p-3"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="font-medium">
                            {s.client.user.firstName} {s.client.user.lastName}
                          </span>
                          <span className="text-muted-foreground">with</span>
                          <span className="font-medium">
                            {s.trainer.user.firstName} {s.trainer.user.lastName}
                          </span>
                          {!s.isActive && (
                            <Badge
                              variant="secondary"
                              className="bg-zinc-500/15 text-zinc-500 text-[10px] px-1.5 py-0"
                            >
                              Inactive
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {s.dayOfWeek.charAt(0) + s.dayOfWeek.slice(1).toLowerCase()} at{' '}
                          {formatTime12(s.startTime)} ({s.durationMin} min)
                        </p>
                      </div>
                      {s.isActive && (
                        <button
                          onClick={() => handleDeleteSchedule(s.id)}
                          className="rounded-lg p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-500 transition-colors"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
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
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10">
                    <CalendarPlus className="h-4 w-4 text-blue-500" />
                  </div>
                  <div>
                    <span>Create Recurring Schedule</span>
                    <p className="mt-0.5 text-xs font-normal text-muted-foreground">
                      Set up a recurring training session
                    </p>
                  </div>
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-5">
                {/* Trainer & Client */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">Trainer</Label>
                    <FormSearchSelect
                      options={trainers
                        .filter((t) => t.trainerProfile)
                        .map((t) => ({
                          value: t.trainerProfile!.id,
                          label: `${t.firstName} ${t.lastName}`,
                        }))}
                      value={form.trainerProfileId}
                      onChange={(v) => setForm((prev) => ({ ...prev, trainerProfileId: v }))}
                      placeholder="Select trainer"
                      icon={User}
                    />
                  </div>
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
                      onChange={(v) => setForm((prev) => ({ ...prev, clientProfileId: v }))}
                      placeholder="Select client"
                      icon={Users}
                    />
                  </div>
                </div>

                {/* Day of Week — pill buttons */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Day of Week</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {DAYS_OF_WEEK.map((day) => (
                      <button
                        key={day}
                        type="button"
                        onClick={() => setForm((prev) => ({ ...prev, dayOfWeek: day }))}
                        className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                          form.dayOfWeek === day
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'bg-muted/60 text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        {day.slice(0, 3)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Time, Duration, Valid From */}
                <div className="grid gap-3 sm:grid-cols-3">
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
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <Calendar className="h-3 w-3" /> Valid From
                    </Label>
                    <Input
                      type="date"
                      value={form.validFrom}
                      onChange={(e) => setForm((prev) => ({ ...prev, validFrom: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              {formError && (
                <div className="flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-500">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  {formError}
                </div>
              )}

              <div className="flex justify-end gap-2 border-t border-border pt-4">
                <Button variant="outline" size="sm" onClick={() => setCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleCreateSchedule}
                  disabled={formSaving}
                  size="sm"
                  className="gap-1.5 bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700"
                >
                  {formSaving ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus className="h-3.5 w-3.5" />
                      Create Schedule
                    </>
                  )}
                </Button>
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
          selectable
          height={isFullscreen ? 'auto' : 600}
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
          if (!v) setSelectedSession(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Session Details</DialogTitle>
          </DialogHeader>
          {selectedSession && (
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
                    {selectedSession.trainer.user.firstName} {selectedSession.trainer.user.lastName}
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
          )}
        </DialogContent>
      </Dialog>

      {ConfirmDialog}
    </div>
  );
}
