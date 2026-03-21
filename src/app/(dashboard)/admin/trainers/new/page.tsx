'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { ArrowLeft, Loader2, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
const DAY_LABELS: Record<string, string> = {
  MONDAY: 'Mon',
  TUESDAY: 'Tue',
  WEDNESDAY: 'Wed',
  THURSDAY: 'Thu',
  FRIDAY: 'Fri',
  SATURDAY: 'Sat',
  SUNDAY: 'Sun',
};

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
    specialties: '',
    certifications: '',
    bio: '',
    workingHoursStart: '06:00',
    workingHoursEnd: '22:00',
    workingDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'] as string[],
  });

  function updateForm(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function toggleDay(day: string) {
    setForm((prev) => ({
      ...prev,
      workingDays: prev.workingDays.includes(day)
        ? prev.workingDays.filter((d) => d !== day)
        : [...prev.workingDays, day],
    }));
  }

  async function handleCreate() {
    if (!form.firstName || !form.lastName || !form.email || !form.password) {
      setError('First name, last name, email, and password are required');
      return;
    }
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
          role: 'TRAINER',
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
          workingHoursStart: form.workingHoursStart || undefined,
          workingHoursEnd: form.workingHoursEnd || undefined,
          workingDays: form.workingDays.length > 0 ? form.workingDays : undefined,
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

      {/* Working Schedule */}
      <div className="rounded-2xl bg-card ring-1 ring-border/50">
        <div className="flex items-center gap-3 border-b border-border/50 px-5 py-4">
          <h2 className="text-sm font-semibold">Working Schedule</h2>
        </div>
        <div className="space-y-4 px-5 py-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="workStart">Working Hours Start</Label>
              <Input
                id="workStart"
                type="time"
                value={form.workingHoursStart}
                onChange={(e) => updateForm('workingHoursStart', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="workEnd">Working Hours End</Label>
              <Input
                id="workEnd"
                type="time"
                value={form.workingHoursEnd}
                onChange={(e) => updateForm('workingHoursEnd', e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Working Days</Label>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(day)}
                  className={cn(
                    'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ring-1',
                    form.workingDays.includes(day)
                      ? 'bg-blue-600 text-white ring-blue-600'
                      : 'bg-muted/40 text-muted-foreground ring-border/50 hover:text-foreground',
                  )}
                >
                  {DAY_LABELS[day]}
                </button>
              ))}
            </div>
          </div>
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
