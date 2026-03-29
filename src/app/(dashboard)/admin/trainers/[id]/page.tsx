'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Save, Trash2 } from 'lucide-react';
import { useConfirm } from '@/hooks/use-confirm';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';

const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

interface TrainerData {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  isActive: boolean;
  trainerProfile: {
    id: string;
    specialties: string[];
    certifications: string[];
    bio: string | null;
    workingHoursStart: string | null;
    workingHoursEnd: string | null;
    workingDays: string[];
  } | null;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {title}
      </p>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

export default function TrainerProfilePage() {
  const { confirm, ConfirmDialog } = useConfirm();
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [trainer, setTrainer] = useState<TrainerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    specialties: '',
    certifications: '',
    bio: '',
    workingHoursStart: '',
    workingHoursEnd: '',
    workingDays: [] as string[],
  });

  const fetchTrainer = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/users/${id}`);
      if (!res.ok) {
        setError('Trainer not found');
        return;
      }
      const { data } = await res.json();
      setTrainer(data);
      setForm({
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone ?? '',
        specialties: data.trainerProfile?.specialties.join(', ') ?? '',
        certifications: data.trainerProfile?.certifications.join(', ') ?? '',
        bio: data.trainerProfile?.bio ?? '',
        workingHoursStart: data.trainerProfile?.workingHoursStart ?? '',
        workingHoursEnd: data.trainerProfile?.workingHoursEnd ?? '',
        workingDays: data.trainerProfile?.workingDays ?? [],
      });
    } catch {
      setError('Failed to load trainer');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchTrainer();
  }, [fetchTrainer]);

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: form.firstName,
          lastName: form.lastName,
          phone: form.phone || undefined,
          specialties: form.specialties
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          certifications: form.certifications
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          bio: form.bio || undefined,
          workingHoursStart: form.workingHoursStart || undefined,
          workingHoursEnd: form.workingHoursEnd || undefined,
          workingDays: form.workingDays,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? 'Failed to save');
      } else {
        await fetchTrainer();
      }
    } catch {
      setError('Failed to save changes');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    const ok = await confirm({
      title: 'Deactivate Trainer',
      description: 'Are you sure you want to deactivate this trainer?',
      confirmText: 'Deactivate',
      variant: 'destructive',
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
      if (res.ok) router.push('/admin/trainers');
    } catch {
      setError('Failed to delete trainer');
    }
  }

  function toggleDay(day: string) {
    setForm((prev) => ({
      ...prev,
      workingDays: prev.workingDays.includes(day)
        ? prev.workingDays.filter((d) => d !== day)
        : [...prev.workingDays, day],
    }));
  }

  if (loading) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-14 w-full rounded-2xl" />
        <Skeleton className="h-48 w-full rounded-2xl" />
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
    );
  }

  if (!trainer) {
    return <p className="p-4 text-muted-foreground">{error || 'Trainer not found'}</p>;
  }

  const initials = `${trainer.firstName[0]}${trainer.lastName[0]}`.toUpperCase();

  return (
    <div className="flex min-h-screen flex-col pb-24">
      {/* Header */}
      <div className="flex h-14 items-center gap-3 px-4">
        <button
          onClick={() => router.push('/admin/trainers')}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-muted"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex flex-1 items-center gap-2.5 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-none">
              {trainer.firstName} {trainer.lastName}
            </p>
            <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{trainer.email}</p>
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
            trainer.isActive
              ? 'bg-emerald-500/15 text-emerald-400'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          {trainer.isActive ? 'Active' : 'Inactive'}
        </span>
      </div>

      {error && (
        <p className="mx-4 mb-2 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {/* Form sections */}
      <div className="flex-1 space-y-3 px-4 pt-2">
        <Section title="Personal Information">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="firstName" className="text-xs">
                First Name
              </Label>
              <Input
                id="firstName"
                value={form.firstName}
                onChange={(e) => setForm((p) => ({ ...p, firstName: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lastName" className="text-xs">
                Last Name
              </Label>
              <Input
                id="lastName"
                value={form.lastName}
                onChange={(e) => setForm((p) => ({ ...p, lastName: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone" className="text-xs">
              Phone
            </Label>
            <Input
              id="phone"
              value={form.phone}
              onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bio" className="text-xs">
              Bio
            </Label>
            <Textarea
              id="bio"
              value={form.bio}
              rows={3}
              onChange={(e) => setForm((p) => ({ ...p, bio: e.target.value }))}
            />
          </div>
        </Section>

        <Section title="Professional Details">
          <div className="space-y-1.5">
            <Label htmlFor="specialties" className="text-xs">
              Specialties (comma-separated)
            </Label>
            <Input
              id="specialties"
              value={form.specialties}
              onChange={(e) => setForm((p) => ({ ...p, specialties: e.target.value }))}
              placeholder="strength, cardio, rehabilitation"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="certifications" className="text-xs">
              Certifications (comma-separated)
            </Label>
            <Input
              id="certifications"
              value={form.certifications}
              onChange={(e) => setForm((p) => ({ ...p, certifications: e.target.value }))}
              placeholder="ACE-CPT, NASM"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="startTime" className="text-xs">
                Hours Start
              </Label>
              <Input
                id="startTime"
                type="time"
                value={form.workingHoursStart}
                onChange={(e) => setForm((p) => ({ ...p, workingHoursStart: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="endTime" className="text-xs">
                Hours End
              </Label>
              <Input
                id="endTime"
                type="time"
                value={form.workingHoursEnd}
                onChange={(e) => setForm((p) => ({ ...p, workingHoursEnd: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Working Days</Label>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(day)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    form.workingDays.includes(day)
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  {day.slice(0, 3)}
                </button>
              ))}
            </div>
          </div>
        </Section>
      </div>

      {/* Sticky footer actions */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-border bg-background/95 px-4 py-3 backdrop-blur-sm">
        <div className="flex gap-2 max-w-2xl mx-auto">
          <button
            onClick={handleDelete}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-red-500/10 py-2.5 text-sm font-medium text-red-400 ring-1 ring-red-500/20 active:scale-95"
          >
            <Trash2 className="h-4 w-4" />
            Deactivate
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60 active:scale-95"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>

      {ConfirmDialog}
    </div>
  );
}
