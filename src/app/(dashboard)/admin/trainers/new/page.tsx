'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { ArrowLeft, Clock, Loader2, Plus, UserPlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const DAYS_ORDER = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
const ROLES = ['TRAINER', 'KICKBOXING_TRAINER', 'CROSSFIT_TRAINER'];
const ROLE_LABELS: Record<string, string> = {
  TRAINER: 'General Trainer',
  KICKBOXING_TRAINER: 'Kickboxing Trainer',
  CROSSFIT_TRAINER: 'CrossFit Trainer',
};
const DAY_LABELS: Record<string, string> = {
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

function fmtTime(t: string) {
  const [h = '0', m = '00'] = t.split(':');
  const hour = parseInt(h, 10);
  return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`;
}

interface ShiftDraft {
  _key: string;
  label: string;
  startTime: string;
  endTime: string;
  days: string[];
}

export default function NewTrainerPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    roles: ['TRAINER'] as string[],
    specialties: '',
    certifications: '',
    bio: '',
  });

  // Inline shift builder state
  const [shifts, setShifts] = useState<ShiftDraft[]>([]);
  const [shiftTab, setShiftTab] = useState<'morning' | 'evening' | 'custom'>('morning');
  const [selectedPreset, setSelectedPreset] = useState<{
    label: string;
    startTime: string;
    endTime: string;
  } | null>(null);
  const [customLabel, setCustomLabel] = useState('');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [draftDays, setDraftDays] = useState<string[]>([]);
  const [shiftError, setShiftError] = useState('');

  function updateForm(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function toggleRole(role: string) {
    setForm((prev) => ({
      ...prev,
      roles: prev.roles.includes(role)
        ? prev.roles.filter((r) => r !== role)
        : [...prev.roles, role],
    }));
  }

  function toggleDraftDay(day: string) {
    setDraftDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  }

  function addShift() {
    const isCustom = shiftTab === 'custom';
    const label = isCustom ? customLabel.trim() : (selectedPreset?.label ?? '');
    const startTime = isCustom ? customStart : (selectedPreset?.startTime ?? '');
    const endTime = isCustom ? customEnd : (selectedPreset?.endTime ?? '');

    if (!label) {
      setShiftError('Label is required');
      return;
    }
    if (!startTime || !endTime) {
      setShiftError('Start and end times are required');
      return;
    }
    if (startTime >= endTime) {
      setShiftError('End time must be after start time');
      return;
    }
    if (draftDays.length === 0) {
      setShiftError('Select at least one day');
      return;
    }

    setShifts((prev) => [
      ...prev,
      { _key: `${Date.now()}`, label, startTime, endTime, days: [...draftDays] },
    ]);
    setShiftError('');
    setSelectedPreset(null);
    setCustomLabel('');
    setCustomStart('');
    setCustomEnd('');
    setDraftDays([]);
  }

  function removeShift(key: string) {
    setShifts((prev) => prev.filter((s) => s._key !== key));
  }

  async function handleCreate() {
    if (!form.firstName || !form.lastName || !form.email || !form.password) {
      setError('First name, last name, email, and password are required');
      return;
    }

    if (form.roles.length === 0) {
      setError('At least one role must be selected');
      return;
    }

    // Build final shift list — auto-include any pending draft the user configured but didn't explicitly add
    const isCustom = shiftTab === 'custom';
    const pendingLabel = isCustom ? customLabel.trim() : (selectedPreset?.label ?? '');
    const pendingStart = isCustom ? customStart : (selectedPreset?.startTime ?? '');
    const pendingEnd = isCustom ? customEnd : (selectedPreset?.endTime ?? '');
    const hasPendingDraft =
      pendingLabel &&
      pendingStart &&
      pendingEnd &&
      pendingStart < pendingEnd &&
      draftDays.length > 0;
    const finalShifts: ShiftDraft[] = hasPendingDraft
      ? [
          ...shifts,
          {
            _key: `${Date.now()}`,
            label: pendingLabel,
            startTime: pendingStart,
            endTime: pendingEnd,
            days: [...draftDays],
          },
        ]
      : shifts;

    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          phone: form.phone || undefined,
          password: form.password,
          roles: form.roles,
          specialties: form.specialties
            ? form.specialties
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
            : undefined,
          certifications: form.certifications
            ? form.certifications
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
            : undefined,
          bio: form.bio || undefined,
          shifts:
            finalShifts.length > 0
              ? finalShifts.map(({ label, startTime, endTime, days }) => ({
                  label,
                  startTime,
                  endTime,
                  days,
                }))
              : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? 'Failed to create trainer');
        return;
      }

      const { data } = await res.json();
      router.push(`/admin/trainers/${data.id}`);
    } catch {
      setError('Failed to create trainer');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push('/admin/trainers')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Add Trainer</h1>
          <p className="mt-1 text-sm text-muted-foreground">Create a new trainer account</p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Account Details */}
      <div className="rounded-2xl bg-card ring-1 ring-border/50">
        <div className="flex items-center gap-3 border-b border-border/50 px-5 py-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500">
            <UserPlus className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">Account Details</h2>
            <p className="text-xs text-muted-foreground">Login credentials and contact info</p>
          </div>
        </div>
        <div className="space-y-4 px-5 py-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="firstName">First Name *</Label>
              <Input
                id="firstName"
                value={form.firstName}
                onChange={(e) => updateForm('firstName', e.target.value)}
                placeholder="John"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lastName">Last Name *</Label>
              <Input
                id="lastName"
                value={form.lastName}
                onChange={(e) => updateForm('lastName', e.target.value)}
                placeholder="Doe"
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => updateForm('email', e.target.value)}
                placeholder="john@example.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password *</Label>
              <Input
                id="password"
                type="password"
                value={form.password}
                onChange={(e) => updateForm('password', e.target.value)}
                placeholder="Min 6 characters"
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={form.phone}
                onChange={(e) => updateForm('phone', e.target.value)}
                placeholder="+91-9000000000"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">Roles *</Label>
              <div className="flex flex-wrap gap-2">
                {ROLES.map((role) => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => toggleRole(role)}
                    className={cn(
                      'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ring-1',
                      form.roles.includes(role)
                        ? 'bg-blue-600 text-white ring-blue-600'
                        : 'bg-muted/40 text-muted-foreground ring-border/50 hover:text-foreground',
                    )}
                  >
                    {ROLE_LABELS[role]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Professional Details */}
      <div className="rounded-2xl bg-card ring-1 ring-border/50">
        <div className="flex items-center gap-3 border-b border-border/50 px-5 py-4">
          <h2 className="text-sm font-semibold">Professional Details</h2>
        </div>
        <div className="space-y-4 px-5 py-4">
          <div className="space-y-1.5">
            <Label htmlFor="specialties">Specialties</Label>
            <Input
              id="specialties"
              value={form.specialties}
              onChange={(e) => updateForm('specialties', e.target.value)}
              placeholder="Strength training, HIIT, Yoga (comma-separated)"
            />
            <p className="text-xs text-muted-foreground">Comma-separated list</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="certifications">Certifications</Label>
            <Input
              id="certifications"
              value={form.certifications}
              onChange={(e) => updateForm('certifications', e.target.value)}
              placeholder="ACE CPT, NASM (comma-separated)"
            />
            <p className="text-xs text-muted-foreground">Comma-separated list</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bio">Bio</Label>
            <Textarea
              id="bio"
              value={form.bio}
              onChange={(e) => updateForm('bio', e.target.value)}
              placeholder="Brief professional bio..."
            />
          </div>
        </div>
      </div>

      {/* Shifts */}
      <div className="rounded-2xl bg-card ring-1 ring-border/50">
        <div className="flex items-center gap-3 border-b border-border/50 px-5 py-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500">
            <Clock className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">Shifts</h2>
            <p className="text-xs text-muted-foreground">
              Optional — add if trainer has fixed shift windows
            </p>
          </div>
        </div>
        <div className="space-y-4 px-5 py-4">
          {/* Added shifts list */}
          {shifts.length > 0 && (
            <div className="space-y-2">
              {shifts.map((shift) => (
                <div
                  key={shift._key}
                  className="flex items-start justify-between gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-medium">{shift.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {fmtTime(shift.startTime)} – {fmtTime(shift.endTime)}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {DAYS_ORDER.filter((d) => shift.days.includes(d)).map((d) => (
                        <span
                          key={d}
                          className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
                        >
                          {DAY_LABELS[d]}
                        </span>
                      ))}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeShift(shift._key)}
                    className="shrink-0 rounded p-1 text-muted-foreground hover:bg-red-500/10 hover:text-red-500 transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add shift form */}
          <Tabs
            value={shiftTab}
            onValueChange={(v) => {
              setShiftTab(v as typeof shiftTab);
              setSelectedPreset(null);
            }}
          >
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="morning">Morning</TabsTrigger>
              <TabsTrigger value="evening">Evening</TabsTrigger>
              <TabsTrigger value="custom">Custom</TabsTrigger>
            </TabsList>

            {(['morning', 'evening'] as const).map((t) => (
              <TabsContent key={t} value={t} className="mt-3">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {(t === 'morning' ? MORNING_PRESETS : EVENING_PRESETS).map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => setSelectedPreset(preset)}
                      className={cn(
                        'rounded-md border px-2 py-2 text-left text-xs transition-colors',
                        selectedPreset?.label === preset.label
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border hover:border-primary/50 hover:bg-muted',
                      )}
                    >
                      <div className="font-medium">{fmtTime(preset.startTime)}</div>
                      <div className="text-muted-foreground">to {fmtTime(preset.endTime)}</div>
                    </button>
                  ))}
                </div>
              </TabsContent>
            ))}

            <TabsContent value="custom" className="mt-3 space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Label</Label>
                <Input
                  placeholder="e.g. Mid-Day Shift"
                  value={customLabel}
                  onChange={(e) => setCustomLabel(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Start Time</Label>
                  <Input
                    type="time"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">End Time</Label>
                  <Input
                    type="time"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="h-9"
                  />
                </div>
              </div>
            </TabsContent>
          </Tabs>

          {/* Day picker */}
          <div className="space-y-1.5">
            <Label className="text-xs">Days for this shift</Label>
            <div className="flex flex-wrap gap-2">
              {DAYS_ORDER.map((day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDraftDay(day)}
                  className={cn(
                    'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ring-1',
                    draftDays.includes(day)
                      ? 'bg-blue-600 text-white ring-blue-600'
                      : 'bg-muted/40 text-muted-foreground ring-border/50 hover:text-foreground',
                  )}
                >
                  {DAY_LABELS[day]}
                </button>
              ))}
            </div>
          </div>

          {shiftError && <p className="text-xs text-destructive">{shiftError}</p>}

          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={addShift}>
            <Plus className="h-3.5 w-3.5" />
            Add Shift
          </Button>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => router.push('/admin/trainers')}>
          Cancel
        </Button>
        <Button
          onClick={handleCreate}
          disabled={saving}
          className="gap-1.5 bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700"
        >
          {saving ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Creating...
            </>
          ) : (
            <>
              <UserPlus className="h-3.5 w-3.5" />
              Create Trainer
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
