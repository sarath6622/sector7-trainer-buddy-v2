'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { ArrowLeft, KeyRound, Save, Trash2 } from 'lucide-react';
import { useConfirm } from '@/hooks/use-confirm';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';

const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
const ROLES = ['TRAINER', 'KICKBOXING_TRAINER', 'CROSSFIT_TRAINER'];
const ROLE_LABELS: Record<string, string> = {
  TRAINER: 'General Trainer',
  KICKBOXING_TRAINER: 'Kickboxing Trainer',
  CROSSFIT_TRAINER: 'CrossFit Trainer',
};

interface TrainerData {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  roles: string[];
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-3">
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
        {title}
      </p>
      <div className="space-y-3">{children}</div>
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

  const [resetPassword, setResetPassword] = useState('');
  const [resetSaving, setResetSaving] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetSuccess, setResetSuccess] = useState(false);

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    roles: [] as string[],
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
        roles: data.roles ?? [],
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
    if (form.roles.length === 0) {
      setError('At least one role must be selected');
      return;
    }
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
          roles: form.roles,
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

  async function handleResetPassword() {
    setResetSaving(true);
    setResetError('');
    setResetSuccess(false);
    try {
      const res = await fetch(`/api/admin/users/${id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: resetPassword }),
      });
      if (!res.ok) {
        const data = await res.json();
        setResetError(data.error ?? 'Failed to reset password');
      } else {
        setResetPassword('');
        setResetSuccess(true);
        setTimeout(() => setResetSuccess(false), 3000);
      }
    } catch {
      setResetError('Failed to reset password');
    } finally {
      setResetSaving(false);
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

  function toggleRole(role: string) {
    setForm((prev) => ({
      ...prev,
      roles: prev.roles.includes(role)
        ? prev.roles.filter((r) => r !== role)
        : [...prev.roles, role],
    }));
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
      <div className="-m-4 md:-m-6 flex h-full flex-col overflow-hidden bg-background">
        <div className="flex h-14 items-center gap-3 border-b px-4">
          <Skeleton className="h-8 w-8 rounded-xl" />
          <Skeleton className="h-4 w-36 rounded-lg" />
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          <Skeleton className="h-40 w-full rounded-2xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!trainer) {
    return (
      <div className="-m-4 md:-m-6 flex h-full items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">{error || 'Trainer not found'}</p>
      </div>
    );
  }

  const initials = `${trainer.firstName[0]}${trainer.lastName[0]}`.toUpperCase();

  return (
    <div className="-m-4 md:-m-6 flex h-full flex-col overflow-hidden bg-background">
      {/* Sticky header */}
      <div className="sticky top-0 z-20 border-b border-white/[0.06] bg-background/95 backdrop-blur">
        <div className="flex h-14 items-center gap-3 px-4">
          <button
            onClick={() => router.push('/admin/trainers')}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="h-5 w-5" />
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
            className={cn(
              'shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold',
              trainer.isActive
                ? 'bg-emerald-500/15 text-emerald-400'
                : 'bg-muted text-muted-foreground',
            )}
          >
            {trainer.isActive ? 'Active' : 'Inactive'}
          </span>
        </div>
      </div>

      {/* Scrollable form */}
      <div className="flex-1 overflow-y-auto">
        <div className="space-y-2.5 px-4 py-3 pb-28">
          {error && (
            <p className="rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          )}

          {/* Personal */}
          <Section title="Personal Information">
            <Field label="Email">
              <Input
                value={trainer.email}
                readOnly
                className="h-9 bg-white/[0.04] text-xs text-muted-foreground cursor-default border-white/[0.06]"
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="First Name">
                <Input
                  value={form.firstName}
                  onChange={(e) => setForm((p) => ({ ...p, firstName: e.target.value }))}
                  className="h-9 text-xs border-white/[0.08]"
                />
              </Field>
              <Field label="Last Name">
                <Input
                  value={form.lastName}
                  onChange={(e) => setForm((p) => ({ ...p, lastName: e.target.value }))}
                  className="h-9 text-xs border-white/[0.08]"
                />
              </Field>
            </div>
            <Field label="Phone">
              <Input
                value={form.phone}
                onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                className="h-9 text-xs border-white/[0.08]"
              />
            </Field>
            <Field label="Bio">
              <Textarea
                value={form.bio}
                rows={2}
                onChange={(e) => setForm((p) => ({ ...p, bio: e.target.value }))}
                className="resize-none text-xs border-white/[0.08]"
              />
            </Field>
          </Section>

          {/* Roles */}
          <Section title="Roles">
            <div className="flex flex-wrap gap-1.5">
              {ROLES.map((role) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => toggleRole(role)}
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                    form.roles.includes(role)
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-white/[0.06] text-muted-foreground hover:bg-white/10',
                  )}
                >
                  {ROLE_LABELS[role]}
                </button>
              ))}
            </div>
          </Section>

          {/* Professional */}
          <Section title="Professional Details">
            <Field label="Specialties (comma-separated)">
              <Input
                value={form.specialties}
                onChange={(e) => setForm((p) => ({ ...p, specialties: e.target.value }))}
                placeholder="strength, cardio, rehabilitation"
                className="h-9 text-xs border-white/[0.08]"
              />
            </Field>
            <Field label="Certifications (comma-separated)">
              <Input
                value={form.certifications}
                onChange={(e) => setForm((p) => ({ ...p, certifications: e.target.value }))}
                placeholder="ACE-CPT, NASM"
                className="h-9 text-xs border-white/[0.08]"
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Hours Start">
                <Input
                  type="time"
                  value={form.workingHoursStart}
                  onChange={(e) => setForm((p) => ({ ...p, workingHoursStart: e.target.value }))}
                  className="h-9 text-xs border-white/[0.08]"
                />
              </Field>
              <Field label="Hours End">
                <Input
                  type="time"
                  value={form.workingHoursEnd}
                  onChange={(e) => setForm((p) => ({ ...p, workingHoursEnd: e.target.value }))}
                  className="h-9 text-xs border-white/[0.08]"
                />
              </Field>
            </div>
            <Field label="Working Days">
              <div className="flex flex-wrap gap-1.5">
                {DAYS.map((day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(day)}
                    className={cn(
                      'rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
                      form.workingDays.includes(day)
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-white/[0.06] text-muted-foreground hover:bg-white/10',
                    )}
                  >
                    {day.slice(0, 3)}
                  </button>
                ))}
              </div>
            </Field>
          </Section>

          {/* Reset Password */}
          <Section title="Reset Password">
            <div className="flex gap-2">
              <Input
                type="password"
                placeholder="New password (min 6 chars)"
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                className="h-9 flex-1 text-xs border-white/[0.08]"
              />
              <button
                onClick={handleResetPassword}
                disabled={resetSaving || resetPassword.length < 6}
                className="flex shrink-0 items-center gap-1.5 rounded-xl bg-white/[0.06] px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <KeyRound className="h-3.5 w-3.5" />
                {resetSaving ? 'Resetting…' : 'Reset'}
              </button>
            </div>
            {resetError && <p className="text-xs text-destructive">{resetError}</p>}
            {resetSuccess && (
              <p className="text-xs text-emerald-400">Password reset successfully.</p>
            )}
          </Section>
        </div>
      </div>

      {/* Sticky footer */}
      <div className="sticky bottom-0 z-20 border-t border-white/[0.06] bg-background/95 px-4 py-3 backdrop-blur">
        <div className="flex gap-2">
          <button
            onClick={handleDelete}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-red-500/10 py-2.5 text-sm font-medium text-red-400 ring-1 ring-red-500/20 transition-colors hover:bg-red-500/15 active:scale-95"
          >
            <Trash2 className="h-4 w-4" />
            Deactivate
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60 active:scale-95"
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
