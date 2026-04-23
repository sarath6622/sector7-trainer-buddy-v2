'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Activity,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  Search,
  User,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime12(t: string) {
  const [h = '0', m = '00'] = t.split(':');
  const hour = parseInt(h, 10);
  return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`;
}

function TrainerSearchSelect({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
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
    <div ref={containerRef} className="relative flex-1">
      <button
        type="button"
        onClick={() => {
          setOpen(!open);
          setSearch('');
        }}
        className="flex h-10 w-full items-center gap-2 rounded-lg border border-input bg-transparent px-3 text-sm transition-colors hover:bg-muted/50"
      >
        <User className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className={selected ? 'flex-1 text-left' : 'flex-1 text-left text-muted-foreground'}>
          {selected?.label ?? 'Choose a trainer'}
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

// ─── Dialog ───────────────────────────────────────────────────────────────────

interface TrainerAvailabilityDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Optional pre-loaded trainer list. If omitted, the dialog fetches its own. */
  trainers?: { id: string; name: string }[];
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/** Returns the Monday of the week containing `dateIso` (YYYY-MM-DD). */
function getMondayIso(dateIso: string): string {
  const d = new Date(`${dateIso}T12:00:00`);
  const dow = d.getDay(); // 0 = Sun
  const offset = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

function fmtWeekLabel(mondayIso: string): string {
  const start = new Date(`${mondayIso}T12:00:00`);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return `${start.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

export function TrainerAvailabilityDialog({
  open,
  onOpenChange,
  trainers: trainersProp,
}: TrainerAvailabilityDialogProps) {
  const [mode, setMode] = useState<'smart' | 'trainer'>('smart');
  const [duration, setDuration] = useState(60);
  const [trainerId, setTrainerId] = useState('');
  const [loading, setLoading] = useState(false);
  const [smartData, setSmartData] = useState<SmartData | null>(null);
  const [trainerData, setTrainerData] = useState<TrainerAvailData | null>(null);

  // Week selector — defaults to the current week's Monday
  const [weekOf, setWeekOf] = useState<string>(() => getMondayIso(todayIso()));

  // Trainer list — use prop if provided, otherwise fetch
  const [fetchedTrainers, setFetchedTrainers] = useState<{ id: string; name: string }[]>([]);
  const trainers = trainersProp ?? fetchedTrainers;

  useEffect(() => {
    if (trainersProp) return; // skip fetch when trainers are supplied
    fetch('/api/admin/trainers')
      .then((r) => r.json())
      .then((json: { data: { id: string; name: string }[] }) => setFetchedTrainers(json.data))
      .catch(() => {});
  }, [trainersProp]);

  // Reset results on close
  useEffect(() => {
    if (!open) {
      setSmartData(null);
      setTrainerData(null);
      setWeekOf(getMondayIso(todayIso()));
    }
  }, [open]);

  function shiftWeek(direction: -1 | 1) {
    const d = new Date(`${weekOf}T12:00:00`);
    d.setDate(d.getDate() + direction * 7);
    const newWeek = d.toISOString().slice(0, 10);
    setWeekOf(newWeek);
    setSmartData(null);
    setTrainerData(null);
  }

  function switchMode(m: 'smart' | 'trainer') {
    setMode(m);
    setSmartData(null);
    setTrainerData(null);
  }

  async function fetchAvailability() {
    setLoading(true);
    setSmartData(null);
    setTrainerData(null);
    try {
      if (mode === 'smart') {
        const res = await fetch(
          `/api/admin/availability-check?mode=smart&durationMin=${duration}&weekOf=${weekOf}`,
        );
        if (res.ok) setSmartData(await res.json());
      } else {
        if (!trainerId) return;
        const res = await fetch(
          `/api/admin/availability-check?mode=trainer&trainerId=${trainerId}&weekOf=${weekOf}`,
        );
        if (res.ok) setTrainerData(await res.json());
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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

        {/* Week picker */}
        <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2">
          <button
            type="button"
            onClick={() => shiftWeek(-1)}
            className="rounded p-1 hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            aria-label="Previous week"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={weekOf}
              onChange={(e) => {
                if (!e.target.value) return;
                const monday = getMondayIso(e.target.value);
                setWeekOf(monday);
                setSmartData(null);
                setTrainerData(null);
              }}
              className="sr-only"
              id="avail-week-picker"
            />
            <label
              htmlFor="avail-week-picker"
              className="cursor-pointer text-xs font-medium text-foreground hover:text-primary transition-colors"
            >
              {fmtWeekLabel(weekOf)}
            </label>
            {weekOf !== getMondayIso(todayIso()) && (
              <button
                type="button"
                onClick={() => {
                  setWeekOf(getMondayIso(todayIso()));
                  setSmartData(null);
                  setTrainerData(null);
                }}
                className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/20 transition-colors"
              >
                Today
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => shiftWeek(1)}
            className="rounded p-1 hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            aria-label="Next week"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Mode tabs */}
        <div className="flex gap-1 rounded-xl bg-muted/50 p-1">
          <button
            onClick={() => switchMode('smart')}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-colors ${
              mode === 'smart'
                ? 'bg-background text-foreground shadow-sm ring-1 ring-border/50'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Zap className="h-3.5 w-3.5" />
            Smart Slot Finder
          </button>
          <button
            onClick={() => switchMode('trainer')}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-colors ${
              mode === 'trainer'
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
          {mode === 'smart' ? (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Session Duration</Label>
              <div className="flex gap-1.5">
                {[30, 45, 60, 90].map((d) => (
                  <button
                    key={d}
                    onClick={() => setDuration(d)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                      duration === d
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
              <Label className="text-xs font-medium text-muted-foreground">Select Trainer</Label>
              <TrainerSearchSelect
                options={trainers.map((t) => ({ value: t.id, label: t.name }))}
                value={trainerId}
                onChange={setTrainerId}
              />
            </div>
          )}
          <Button
            onClick={fetchAvailability}
            disabled={loading || (mode === 'trainer' && !trainerId)}
            size="sm"
            className="gap-1.5 bg-violet-600 text-white hover:bg-violet-700 dark:bg-violet-600 dark:hover:bg-violet-700"
          >
            {loading ? (
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
          {mode === 'smart' &&
            smartData &&
            (smartData.recommendations.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No free slots found. All trainers are fully booked.
              </p>
            ) : (
              smartData.recommendations.map(({ day, slots }) => (
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
                              {slot.busyTrainerCount > 0 && ` · ${slot.busyTrainerCount} busy`}
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
          {mode === 'trainer' && trainerData && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 rounded-xl bg-muted/40 px-4 py-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/10">
                  <User className="h-4 w-4 text-violet-500" />
                </div>
                <div>
                  <p className="text-sm font-semibold">{trainerData.trainer.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {trainerData.trainer.workStart} – {trainerData.trainer.workEnd}
                    {' · '}
                    {trainerData.trainer.totalScheduledSessions} recurring session
                    {trainerData.trainer.totalScheduledSessions !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              {trainerData.weekView.map((dayView) => (
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
          {!loading && !smartData && !trainerData && (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500/10">
                <Activity className="h-5 w-5 text-violet-500" />
              </div>
              <p className="text-sm text-muted-foreground">
                {mode === 'smart'
                  ? 'Click Check to find the best available slots across all trainers'
                  : 'Select a trainer and click Check to view their weekly schedule'}
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
