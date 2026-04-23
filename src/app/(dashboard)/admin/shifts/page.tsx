'use client';

import { useCallback, useEffect, useState } from 'react';
import { Activity, ArrowLeftRight, Clock, Pencil, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { TrainerAvailabilityDialog } from '@/components/trainer-availability-dialog';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Shift {
  id: string;
  label: string;
  startTime: string;
  endTime: string;
  days: string[];
  effectiveFrom: string; // ISO string
  effectiveUntil: string | null;
}

interface TrainerWithShifts {
  id: string; // trainerProfileId
  name: string;
  activeShifts: Shift[];
  scheduledShifts: Shift[]; // effectiveFrom > now
}

interface ShiftSwap {
  id: string;
  trainerAProfileId: string;
  trainerBProfileId: string;
  swapFrom: string;
  swapUntil: string;
  status: 'PENDING' | 'APPROVED' | 'CANCELLED';
  notes: string | null;
  trainerA: { user: { firstName: string; lastName: string } };
  trainerB: { user: { firstName: string; lastName: string } };
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DAYS_ORDER = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
const DAY_LABEL: Record<string, string> = {
  MONDAY: 'Mon',
  TUESDAY: 'Tue',
  WEDNESDAY: 'Wed',
  THURSDAY: 'Thu',
  FRIDAY: 'Fri',
  SATURDAY: 'Sat',
  SUNDAY: 'Sun',
};

const MORNING_PRESETS = [
  { label: 'Morning 5:00–9:30', startTime: '05:00', endTime: '09:30' },
  { label: 'Morning 6:00–10:30', startTime: '06:00', endTime: '10:30' },
  { label: 'Morning 6:00–10:00', startTime: '06:00', endTime: '10:00' },
  { label: 'Morning 6:00–9:00', startTime: '06:00', endTime: '09:00' },
  { label: 'Morning 5:00–10:00', startTime: '05:00', endTime: '10:00' },
  { label: 'Morning 6:00–11:00', startTime: '06:00', endTime: '11:00' },
  { label: 'Morning 5:30–10:30', startTime: '05:30', endTime: '10:30' },
  { label: 'Morning 6:30–15:30', startTime: '06:30', endTime: '15:30' },
];

const EVENING_PRESETS = [
  { label: 'Evening 17:00–21:30', startTime: '17:00', endTime: '21:30' },
  { label: 'Evening 16:00–21:00', startTime: '16:00', endTime: '21:00' },
  { label: 'Evening 15:30–21:30', startTime: '15:30', endTime: '21:30' },
  { label: 'Evening 17:00–21:00', startTime: '17:00', endTime: '21:00' },
  { label: 'Evening 16:30–20:30', startTime: '16:30', endTime: '20:30' },
  { label: 'Evening 18:00–22:30', startTime: '18:00', endTime: '22:30' },
  { label: 'Evening 17:30–23:00', startTime: '17:30', endTime: '23:00' },
  { label: 'Evening 16:30–21:00', startTime: '16:30', endTime: '21:00' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(t: string) {
  const [h = '0', m = '00'] = t.split(':');
  const hour = parseInt(h, 10);
  return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

// ─── Day Picker ───────────────────────────────────────────────────────────────

function DayPicker({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (days: string[]) => void;
}) {
  function toggle(day: string) {
    onChange(selected.includes(day) ? selected.filter((d) => d !== day) : [...selected, day]);
  }
  return (
    <div className="flex flex-wrap gap-2">
      {DAYS_ORDER.map((day) => (
        <button
          key={day}
          type="button"
          onClick={() => toggle(day)}
          className={cn(
            'rounded-md border px-3 py-1 text-xs font-medium transition-colors',
            selected.includes(day)
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border hover:border-primary/50 hover:bg-muted text-muted-foreground',
          )}
        >
          {DAY_LABEL[day]}
        </button>
      ))}
    </div>
  );
}

// ─── Shift Form (shared by Add + Edit) ────────────────────────────────────────

interface ShiftFormState {
  tab: 'morning' | 'evening' | 'custom';
  selectedPreset: { label: string; startTime: string; endTime: string } | null;
  customLabel: string;
  customStart: string;
  customEnd: string;
  selectedDays: string[];
  applyFrom: string; // YYYY-MM-DD; empty = today
}

function emptyFormState(): ShiftFormState {
  return {
    tab: 'morning',
    selectedPreset: null,
    customLabel: '',
    customStart: '',
    customEnd: '',
    selectedDays: [],
    applyFrom: '',
  };
}

interface ShiftFormProps {
  state: ShiftFormState;
  onChange: (s: ShiftFormState) => void;
  showApplyFrom: boolean; // false for plain "Add", true for "Edit"
  minApplyFrom?: string; // ISO date string — for edit, prevents setting apply < effectiveFrom
  applyFromLabel?: string;
  applyFromHint?: string;
}

function ShiftForm({
  state,
  onChange,
  showApplyFrom,
  minApplyFrom,
  applyFromLabel,
  applyFromHint,
}: ShiftFormProps) {
  function set<K extends keyof ShiftFormState>(key: K, value: ShiftFormState[K]) {
    onChange({ ...state, [key]: value });
  }

  return (
    <div className="space-y-4">
      <Tabs
        value={state.tab}
        onValueChange={(v) =>
          onChange({ ...state, tab: v as ShiftFormState['tab'], selectedPreset: null })
        }
      >
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="morning">Morning</TabsTrigger>
          <TabsTrigger value="evening">Evening</TabsTrigger>
          <TabsTrigger value="custom">Custom</TabsTrigger>
        </TabsList>

        {(['morning', 'evening'] as const).map((t) => (
          <TabsContent key={t} value={t} className="mt-4">
            <div className="grid grid-cols-2 gap-2">
              {(t === 'morning' ? MORNING_PRESETS : EVENING_PRESETS).map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => set('selectedPreset', preset)}
                  className={cn(
                    'rounded-md border px-3 py-2 text-left text-sm transition-colors',
                    state.selectedPreset?.label === preset.label
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border hover:border-primary/50 hover:bg-muted',
                  )}
                >
                  <div className="font-medium">{fmt(preset.startTime)}</div>
                  <div className="text-muted-foreground text-xs">to {fmt(preset.endTime)}</div>
                </button>
              ))}
            </div>
          </TabsContent>
        ))}

        <TabsContent value="custom" className="mt-4 space-y-4">
          <div className="space-y-2">
            <Label>Label</Label>
            <Input
              placeholder="e.g. Mid-Day Shift"
              value={state.customLabel}
              onChange={(e) => set('customLabel', e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Start Time</Label>
              <Input
                type="time"
                value={state.customStart}
                onChange={(e) => set('customStart', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>End Time</Label>
              <Input
                type="time"
                value={state.customEnd}
                onChange={(e) => set('customEnd', e.target.value)}
              />
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <div className="space-y-2">
        <Label>Days</Label>
        <DayPicker selected={state.selectedDays} onChange={(days) => set('selectedDays', days)} />
      </div>

      {showApplyFrom && (
        <div className="space-y-2">
          <Label>{applyFromLabel ?? 'Apply from'}</Label>
          <Input
            type="date"
            min={minApplyFrom ?? new Date().toISOString().slice(0, 10)}
            value={state.applyFrom}
            onChange={(e) => set('applyFrom', e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            {applyFromHint ??
              'Current shift stays active until this date. Leave blank to apply immediately.'}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Add Shift Dialog ─────────────────────────────────────────────────────────

function AddShiftDialog({
  trainer,
  open,
  onOpenChange,
  onAdded,
}: {
  trainer: TrainerWithShifts;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onAdded: () => void;
}) {
  const [form, setForm] = useState(emptyFormState);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setForm(emptyFormState());
  }, [open]);

  async function handleSubmit() {
    const isCustom = form.tab === 'custom';
    const label = isCustom ? form.customLabel.trim() : (form.selectedPreset?.label ?? '');
    const startTime = isCustom ? form.customStart : (form.selectedPreset?.startTime ?? '');
    const endTime = isCustom ? form.customEnd : (form.selectedPreset?.endTime ?? '');

    if (!label) {
      toast.error('Shift label is required');
      return;
    }
    if (!startTime || !endTime) {
      toast.error('Start and end times are required');
      return;
    }
    if (startTime >= endTime) {
      toast.error('End time must be after start time');
      return;
    }
    if (form.selectedDays.length === 0) {
      toast.error('Select at least one day');
      return;
    }

    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        trainerProfileId: trainer.id,
        label,
        startTime,
        endTime,
        days: form.selectedDays,
      };
      if (form.applyFrom) body.effectiveFrom = new Date(form.applyFrom).toISOString();

      const res = await fetch('/api/admin/shifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? 'Failed to add shift');
      }
      toast.success(
        form.applyFrom ? `Shift scheduled from ${fmtDate(form.applyFrom)}` : 'Shift added',
      );
      onOpenChange(false);
      onAdded();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add shift');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Shift — {trainer.name}</DialogTitle>
        </DialogHeader>
        <ShiftForm state={form} onChange={setForm} showApplyFrom={true} />
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            className="bg-blue-600 hover:bg-blue-700 text-white"
            onClick={handleSubmit}
            disabled={saving}
          >
            {saving ? 'Adding…' : 'Add Shift'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit Shift Dialog ────────────────────────────────────────────────────────

function EditShiftDialog({
  shift,
  isScheduled,
  open,
  onOpenChange,
  onEdited,
}: {
  shift: Shift;
  isScheduled: boolean;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onEdited: () => void;
}) {
  // Pre-populate from existing shift
  const [form, setForm] = useState<ShiftFormState>(emptyFormState);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      // Try to match against a preset
      const allPresets = [...MORNING_PRESETS, ...EVENING_PRESETS];
      const matchedPreset = allPresets.find(
        (p) => p.startTime === shift.startTime && p.endTime === shift.endTime,
      );
      const isMorning = MORNING_PRESETS.some((p) => p === matchedPreset);

      setForm({
        tab: matchedPreset ? (isMorning ? 'morning' : 'evening') : 'custom',
        selectedPreset: matchedPreset ?? null,
        customLabel: matchedPreset ? '' : shift.label,
        customStart: matchedPreset ? '' : shift.startTime,
        customEnd: matchedPreset ? '' : shift.endTime,
        selectedDays: [...shift.days],
        // For scheduled shifts pre-fill with their scheduled date so the admin
        // can see (and change) when it activates. For active shifts default to today.
        applyFrom: isScheduled
          ? new Date(shift.effectiveFrom).toISOString().slice(0, 10)
          : new Date().toISOString().slice(0, 10),
      });
    }
  }, [open, shift, isScheduled]);

  // Scheduled shifts can be moved to any future date; active shifts already started.
  const minDate = new Date().toISOString().slice(0, 10);

  async function handleSubmit() {
    const isCustom = form.tab === 'custom';
    const label = isCustom ? form.customLabel.trim() : (form.selectedPreset?.label ?? '');
    const startTime = isCustom ? form.customStart : (form.selectedPreset?.startTime ?? '');
    const endTime = isCustom ? form.customEnd : (form.selectedPreset?.endTime ?? '');

    if (!label) {
      toast.error('Shift label is required');
      return;
    }
    if (!startTime || !endTime) {
      toast.error('Start and end times are required');
      return;
    }
    if (startTime >= endTime) {
      toast.error('End time must be after start time');
      return;
    }
    if (form.selectedDays.length === 0) {
      toast.error('Select at least one day');
      return;
    }
    if (!form.applyFrom) {
      toast.error('Apply-from date is required');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/admin/shifts/${shift.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label,
          startTime,
          endTime,
          days: form.selectedDays,
          effectiveFrom: new Date(form.applyFrom).toISOString(),
        }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? 'Failed to update shift');
      }
      toast.success(`Shift updated — applies from ${fmtDate(form.applyFrom)}`);
      onOpenChange(false);
      onEdited();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update shift');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isScheduled ? 'Edit Scheduled Shift' : 'Edit Shift'}</DialogTitle>
        </DialogHeader>
        <ShiftForm
          state={form}
          onChange={setForm}
          showApplyFrom={true}
          minApplyFrom={minDate}
          applyFromLabel={isScheduled ? 'Active from' : 'Apply from'}
          applyFromHint={
            isScheduled
              ? 'Change the date this shift becomes active.'
              : 'Current shift stays active until this date. Leave blank to apply immediately.'
          }
        />
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            className="bg-blue-600 hover:bg-blue-700 text-white"
            onClick={handleSubmit}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Swap Dialog ──────────────────────────────────────────────────────────────

function SwapDialog({
  trainers,
  open,
  onOpenChange,
  onCreated,
}: {
  trainers: TrainerWithShifts[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const [trainerAId, setTrainerAId] = useState('');
  const [trainerBId, setTrainerBId] = useState('');
  const [swapFrom, setSwapFrom] = useState('');
  const [swapUntil, setSwapUntil] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setTrainerAId('');
      setTrainerBId('');
      setSwapFrom('');
      setSwapUntil('');
      setNotes('');
    }
  }, [open]);

  const trainerA = trainers.find((t) => t.id === trainerAId);
  const trainerB = trainers.find((t) => t.id === trainerBId);

  async function handleSubmit() {
    if (!trainerAId || !trainerBId) {
      toast.error('Select both trainers');
      return;
    }
    if (trainerAId === trainerBId) {
      toast.error('Select two different trainers');
      return;
    }
    if (!swapFrom || !swapUntil) {
      toast.error('Select swap date range');
      return;
    }
    if (swapUntil <= swapFrom) {
      toast.error('End date must be after start date');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/admin/shifts/swaps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trainerAProfileId: trainerAId,
          trainerBProfileId: trainerBId,
          swapFrom: new Date(swapFrom).toISOString(),
          swapUntil: new Date(swapUntil).toISOString(),
          notes: notes.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? 'Failed to create swap');
      }
      toast.success('Shift swap created — pending approval');
      onOpenChange(false);
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create swap');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Swap Shifts Between Trainers</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            During the selected date range, each trainer works the other&apos;s shift window.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Trainer A</Label>
              <Select
                value={trainerAId}
                onValueChange={(v) => {
                  if (v) setTrainerAId(v);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  {trainers
                    .filter((t) => t.id !== trainerBId)
                    .map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Trainer B</Label>
              <Select
                value={trainerBId}
                onValueChange={(v) => {
                  if (v) setTrainerBId(v);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  {trainers
                    .filter((t) => t.id !== trainerAId)
                    .map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {trainerA && trainerB && (
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs space-y-1">
              <div className="font-medium text-sm mb-2">Swap Preview</div>
              <div>
                <span className="font-medium">{trainerA.name}</span> will work{' '}
                <span className="font-medium">{trainerB.name}</span>&apos;s shifts
              </div>
              <div>
                <span className="font-medium">{trainerB.name}</span> will work{' '}
                <span className="font-medium">{trainerA.name}</span>&apos;s shifts
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>From (inclusive)</Label>
              <Input
                type="date"
                min={new Date().toISOString().slice(0, 10)}
                value={swapFrom}
                onChange={(e) => setSwapFrom(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Until (exclusive)</Label>
              <Input
                type="date"
                min={swapFrom || new Date().toISOString().slice(0, 10)}
                value={swapUntil}
                onChange={(e) => setSwapUntil(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Notes (optional)</Label>
            <Input
              placeholder="e.g. Holiday coverage"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            className="bg-blue-600 hover:bg-blue-700 text-white"
            onClick={handleSubmit}
            disabled={saving}
          >
            {saving ? 'Creating…' : 'Create Swap'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Shift Card ───────────────────────────────────────────────────────────────

function ShiftCard({
  shift,
  isScheduled,
  deletingId,
  onEdit,
  onDelete,
}: {
  shift: Shift;
  isScheduled: boolean;
  deletingId: string | null;
  onEdit: (s: Shift, isScheduled: boolean) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-2 rounded-md border px-3 py-2',
        isScheduled ? 'border-amber-500/30 bg-amber-500/5' : 'border-border bg-muted/40',
      )}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium truncate">{shift.label}</span>
          {isScheduled && (
            <Badge
              variant="secondary"
              className="bg-amber-500/15 text-amber-600 text-[10px] px-1.5 py-0"
            >
              Scheduled · {fmtDate(shift.effectiveFrom)}
            </Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          {fmt(shift.startTime)} – {fmt(shift.endTime)}
        </div>
        <div className="mt-1 flex flex-wrap gap-1">
          {DAYS_ORDER.filter((d) => shift.days.includes(d)).map((d) => (
            <span
              key={d}
              className={cn(
                'rounded px-1.5 py-0.5 text-[10px] font-medium',
                isScheduled ? 'bg-amber-500/10 text-amber-600' : 'bg-primary/10 text-primary',
              )}
            >
              {DAY_LABEL[d]}
            </span>
          ))}
        </div>
      </div>
      <div className="flex shrink-0 gap-0.5">
        <button
          type="button"
          onClick={() => onEdit(shift, isScheduled)}
          className="rounded p-1 text-muted-foreground hover:bg-blue-500/10 hover:text-blue-500 transition-colors"
          aria-label="Edit shift"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          disabled={deletingId === shift.id}
          onClick={() => onDelete(shift.id)}
          className="rounded p-1 text-muted-foreground hover:bg-red-500/10 hover:text-red-500 transition-colors disabled:opacity-40"
          aria-label={isScheduled ? 'Cancel scheduled shift' : 'Remove shift'}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── Swap Badge ───────────────────────────────────────────────────────────────

function SwapBadge({
  swap,
  trainerId,
  onCancel,
}: {
  swap: ShiftSwap;
  trainerId: string;
  onCancel: (id: string) => void;
}) {
  const other =
    swap.trainerAProfileId === trainerId
      ? `${swap.trainerB.user.firstName} ${swap.trainerB.user.lastName}`
      : `${swap.trainerA.user.firstName} ${swap.trainerA.user.lastName}`;

  const statusColor =
    swap.status === 'APPROVED'
      ? 'border-teal-500/30 bg-teal-500/5 text-teal-600'
      : 'border-blue-500/30 bg-blue-500/5 text-blue-600';

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-2 rounded-md border px-3 py-2',
        statusColor,
      )}
    >
      <div className="text-xs">
        <span className="font-medium">
          {swap.status === 'APPROVED' ? 'Swapped' : 'Swap pending'}
        </span>{' '}
        with {other}
        <div className="text-[10px] opacity-80">
          {fmtDate(swap.swapFrom)} – {fmtDate(swap.swapUntil)}
        </div>
      </div>
      <button
        type="button"
        onClick={() => onCancel(swap.id)}
        className="shrink-0 rounded p-1 hover:bg-red-500/10 hover:text-red-500 transition-colors"
        aria-label="Cancel swap"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ShiftsPage() {
  const [trainers, setTrainers] = useState<TrainerWithShifts[]>([]);
  const [swaps, setSwaps] = useState<ShiftSwap[]>([]);
  const [loading, setLoading] = useState(true);

  const [addTrainer, setAddTrainer] = useState<TrainerWithShifts | null>(null);
  const [editShift, setEditShift] = useState<Shift | null>(null);
  const [editShiftIsScheduled, setEditShiftIsScheduled] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [cancellingSwapId, setCancellingSwapId] = useState<string | null>(null);
  const [availCheckOpen, setAvailCheckOpen] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [trainersRes, shiftsRes, swapsRes] = await Promise.all([
        fetch('/api/admin/trainers'),
        fetch('/api/admin/shifts?includeScheduled=true'),
        fetch('/api/admin/shifts/swaps?status=PENDING'),
      ]);

      if (!trainersRes.ok || !shiftsRes.ok || !swapsRes.ok) throw new Error('Failed to load data');

      const trainersData = (await trainersRes.json()) as { data: { id: string; name: string }[] };
      const shiftsData = (await shiftsRes.json()) as {
        data: {
          id: string;
          label: string;
          startTime: string;
          endTime: string;
          days: string[];
          effectiveFrom: string;
          effectiveUntil: string | null;
          trainerProfileId: string;
        }[];
      };
      const swapsData = (await swapsRes.json()) as { data: ShiftSwap[] };

      const now = new Date();

      const shiftsByTrainer = new Map<string, { active: Shift[]; scheduled: Shift[] }>();
      for (const s of shiftsData.data) {
        const bucket = shiftsByTrainer.get(s.trainerProfileId) ?? { active: [], scheduled: [] };
        const shift: Shift = {
          id: s.id,
          label: s.label,
          startTime: s.startTime,
          endTime: s.endTime,
          days: s.days,
          effectiveFrom: s.effectiveFrom,
          effectiveUntil: s.effectiveUntil,
        };
        if (new Date(s.effectiveFrom) > now) {
          bucket.scheduled.push(shift);
        } else {
          bucket.active.push(shift);
        }
        shiftsByTrainer.set(s.trainerProfileId, bucket);
      }

      const merged: TrainerWithShifts[] = trainersData.data.map((t) => {
        const bucket = shiftsByTrainer.get(t.id) ?? { active: [], scheduled: [] };
        return {
          id: t.id,
          name: t.name,
          activeShifts: bucket.active.sort((a, b) => a.startTime.localeCompare(b.startTime)),
          scheduledShifts: bucket.scheduled.sort((a, b) =>
            a.effectiveFrom.localeCompare(b.effectiveFrom),
          ),
        };
      });

      setTrainers(merged);
      setSwaps(swapsData.data);
    } catch {
      toast.error('Failed to load shifts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  async function handleDeleteShift(shiftId: string) {
    setDeletingId(shiftId);
    try {
      const res = await fetch(`/api/admin/shifts/${shiftId}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? 'Failed to remove shift');
      }
      toast.success('Shift removed');
      void fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove shift');
    } finally {
      setDeletingId(null);
    }
  }

  async function handleCancelSwap(swapId: string) {
    setCancellingSwapId(swapId);
    try {
      const res = await fetch(`/api/admin/shifts/swaps/${swapId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? 'Failed to cancel swap');
      }
      toast.success('Swap cancelled');
      void fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to cancel swap');
    } finally {
      setCancellingSwapId(null);
    }
  }

  // Collect swaps that are relevant (PENDING or APPROVED and not past)
  const activeSwapsByTrainer = new Map<string, ShiftSwap[]>();
  for (const swap of swaps) {
    const add = (tid: string) => {
      const existing = activeSwapsByTrainer.get(tid) ?? [];
      existing.push(swap);
      activeSwapsByTrainer.set(tid, existing);
    };
    add(swap.trainerAProfileId);
    add(swap.trainerBProfileId);
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Clock className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-semibold">Shift Management</h1>
            <p className="text-sm text-muted-foreground">
              Manage working hour shifts for each trainer
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2" onClick={() => setAvailCheckOpen(true)}>
            <Activity className="h-4 w-4" />
            Check Availability
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => setSwapOpen(true)}>
            <ArrowLeftRight className="h-4 w-4" />
            Swap Shifts
          </Button>
        </div>
      </div>

      {/* Trainer cards */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : trainers.length === 0 ? (
        <div className="rounded-xl border border-dashed py-16 text-center text-muted-foreground">
          No trainers found
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {trainers.map((trainer) => {
            const trainerSwaps = activeSwapsByTrainer.get(trainer.id) ?? [];
            return (
              <div
                key={trainer.id}
                className="rounded-xl border border-border bg-card p-4 space-y-3"
              >
                {/* Name + Add button */}
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm">{trainer.name}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-xs gap-1"
                    onClick={() => setAddTrainer(trainer)}
                  >
                    <Plus className="h-3 w-3" />
                    Add Shift
                  </Button>
                </div>

                {/* Active shifts */}
                {trainer.activeShifts.length === 0 && trainer.scheduledShifts.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">
                    No shifts — all-day available
                  </p>
                ) : (
                  <div className="space-y-2">
                    {trainer.activeShifts.map((shift) => (
                      <ShiftCard
                        key={shift.id}
                        shift={shift}
                        isScheduled={false}
                        deletingId={deletingId}
                        onEdit={(s, scheduled) => {
                          setEditShift(s);
                          setEditShiftIsScheduled(scheduled);
                        }}
                        onDelete={handleDeleteShift}
                      />
                    ))}
                    {trainer.scheduledShifts.map((shift) => (
                      <ShiftCard
                        key={shift.id}
                        shift={shift}
                        isScheduled={true}
                        deletingId={deletingId}
                        onEdit={(s, scheduled) => {
                          setEditShift(s);
                          setEditShiftIsScheduled(scheduled);
                        }}
                        onDelete={handleDeleteShift}
                      />
                    ))}
                  </div>
                )}

                {/* Active swaps */}
                {trainerSwaps.length > 0 && (
                  <div className="space-y-2 border-t border-border pt-2">
                    {trainerSwaps.map((swap) => (
                      <SwapBadge
                        key={swap.id}
                        swap={swap}
                        trainerId={trainer.id}
                        onCancel={cancellingSwapId === swap.id ? () => {} : handleCancelSwap}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Dialogs */}
      {addTrainer && (
        <AddShiftDialog
          trainer={addTrainer}
          open={!!addTrainer}
          onOpenChange={(v) => {
            if (!v) setAddTrainer(null);
          }}
          onAdded={fetchData}
        />
      )}

      {editShift && (
        <EditShiftDialog
          shift={editShift}
          isScheduled={editShiftIsScheduled}
          open={!!editShift}
          onOpenChange={(v) => {
            if (!v) setEditShift(null);
          }}
          onEdited={fetchData}
        />
      )}

      <SwapDialog
        trainers={trainers}
        open={swapOpen}
        onOpenChange={setSwapOpen}
        onCreated={fetchData}
      />

      <TrainerAvailabilityDialog
        open={availCheckOpen}
        onOpenChange={setAvailCheckOpen}
        trainers={trainers.map((t) => ({ id: t.id, name: t.name }))}
      />
    </div>
  );
}
