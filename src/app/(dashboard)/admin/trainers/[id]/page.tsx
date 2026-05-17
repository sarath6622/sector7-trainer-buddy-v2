'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Calendar, Clock, ExternalLink, KeyRound, Phone, Save, Trash2, Users } from 'lucide-react';
import { useConfirm } from '@/hooks/use-confirm';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const ROLES = ['TRAINER', 'KICKBOXING_TRAINER', 'CROSSFIT_TRAINER'];
const ROLE_LABELS: Record<string, string> = {
  TRAINER: 'General Trainer',
  KICKBOXING_TRAINER: 'Kickboxing Trainer',
  CROSSFIT_TRAINER: 'CrossFit Trainer',
};

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

function fmtTime(t: string) {
  const [h = '0', m = '00'] = t.split(':');
  const hour = parseInt(h, 10);
  return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`;
}

function fmtSessionDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

interface TrainerShift {
  id: string;
  label: string;
  startTime: string;
  endTime: string;
  days: string[];
}

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
  } | null;
}

interface TrainerClient {
  clientProfile: {
    id: string;
    paymentStatus: 'PENDING' | 'PAID' | 'PARTIAL' | 'WAIVED';
    user: {
      firstName: string;
      lastName: string;
      email: string;
      phone: string | null;
      profileImageUrl: string | null;
    };
  };
  package: {
    id: string;
    planName: string | null;
    sessionsPerMonth: number;
    totalSessions: number;
    used: number;
    startDate: string;
    endDate: string | null;
  };
  nextSession: {
    id: string;
    scheduledDate: string;
    scheduledTime: string;
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
  const [activeTab, setActiveTab] = useState<'profile' | 'clients'>('profile');

  const [resetPassword, setResetPassword] = useState('');
  const [resetSaving, setResetSaving] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetSuccess, setResetSuccess] = useState(false);

  const [shifts, setShifts] = useState<TrainerShift[]>([]);
  const [clients, setClients] = useState<TrainerClient[]>([]);
  const [clientsLoading, setClientsLoading] = useState(true);

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    roles: [] as string[],
    specialties: '',
    certifications: '',
    bio: '',
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
      });

      if (data.trainerProfile?.id) {
        const shiftsRes = await fetch(`/api/admin/shifts?trainerId=${data.trainerProfile.id}`);
        if (shiftsRes.ok) {
          const shiftsData = await shiftsRes.json();
          setShifts(shiftsData.data ?? []);
        }
      }
    } catch {
      setError('Failed to load trainer');
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchClients = useCallback(async () => {
    setClientsLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${id}/clients`);
      if (res.ok) {
        const { data } = await res.json();
        setClients(data ?? []);
      }
    } finally {
      setClientsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchTrainer();
    fetchClients();
  }, [fetchTrainer, fetchClients]);

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
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? 'Failed to save');
      } else {
        await fetchTrainer();
        toast.success('Trainer profile saved successfully');
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

  if (loading) {
    return (
      <div className="-m-4 md:-m-6 flex h-full flex-col overflow-hidden bg-background">
        <div className="flex h-12 items-center px-4">
          <Skeleton className="h-4 w-40 rounded-lg" />
        </div>
        <div className="flex h-14 items-center gap-3 border-b px-4">
          <Skeleton className="h-8 w-8 rounded-full" />
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
      <div className="-m-4 md:-m-6 flex h-full flex-col overflow-hidden bg-background">
        <div className="border-b border-white/[0.06] px-4 py-3">
          <Breadcrumb
            items={[{ label: 'Trainers', href: '/admin/trainers' }, { label: 'Not found' }]}
          />
        </div>
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-muted-foreground">{error || 'Trainer not found'}</p>
        </div>
      </div>
    );
  }

  const initials = `${trainer.firstName[0]}${trainer.lastName[0]}`.toUpperCase();
  const fullName = `${trainer.firstName} ${trainer.lastName}`;

  return (
    <div className="-m-4 md:-m-6 flex h-full flex-col overflow-hidden bg-background">
      {/* Sticky header */}
      <div className="sticky top-0 z-20 border-b border-white/[0.06] bg-background/95 backdrop-blur">
        <div className="px-4 pt-2.5 pb-2">
          <Breadcrumb
            items={[{ label: 'Trainers', href: '/admin/trainers' }, { label: fullName }]}
          />
        </div>
        <div className="flex h-12 items-center gap-3 px-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold leading-none">{fullName}</p>
            <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{trainer.email}</p>
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

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as 'profile' | 'clients')}
        className="flex flex-1 min-h-0 flex-col"
      >
        <div className="border-b border-white/[0.06] bg-background/95 px-4 py-2">
          <TabsList className="w-full">
            <TabsTrigger value="profile" className="flex-1">
              Profile
            </TabsTrigger>
            <TabsTrigger value="clients" className="flex-1 gap-1.5">
              Clients
              <span className="rounded-full bg-white/[0.08] px-1.5 text-[10px] font-semibold text-muted-foreground">
                {clients.length}
              </span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="profile" className="flex-1 min-h-0 overflow-y-auto">
          <div className="space-y-2.5 px-4 py-3 pb-28">
            {error && (
              <p className="rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </p>
            )}

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
            </Section>

            <Section title="Shifts">
              {shifts.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">
                  No shifts assigned — trainer is all-day available
                </p>
              ) : (
                <div className="space-y-2">
                  {shifts
                    .slice()
                    .sort((a, b) => a.startTime.localeCompare(b.startTime))
                    .map((shift) => (
                      <div
                        key={shift.id}
                        className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium">{shift.label}</span>
                          <span className="text-[11px] text-muted-foreground">
                            {fmtTime(shift.startTime)} – {fmtTime(shift.endTime)}
                          </span>
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {DAYS_ORDER.filter((d) => shift.days.includes(d)).map((d) => (
                            <span
                              key={d}
                              className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
                            >
                              {DAY_LABEL[d]}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              )}
              <Link
                href="/admin/shifts"
                className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Clock className="h-3.5 w-3.5" />
                Manage shifts
                <ExternalLink className="h-3 w-3" />
              </Link>
            </Section>

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
        </TabsContent>

        <TabsContent value="clients" className="flex-1 min-h-0 overflow-y-auto">
          <div className="space-y-2.5 px-4 py-3 pb-8">
            {clientsLoading ? (
              <>
                <Skeleton className="h-24 w-full rounded-2xl" />
                <Skeleton className="h-24 w-full rounded-2xl" />
                <Skeleton className="h-24 w-full rounded-2xl" />
              </>
            ) : clients.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] py-12 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/60">
                  <Users className="h-6 w-6 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium">No active clients</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    This trainer has no active PT packages right now.
                  </p>
                </div>
              </div>
            ) : (
              clients.map((item) => {
                const c = item.clientProfile;
                const name = `${c.user.firstName} ${c.user.lastName}`;
                const clientInitials = `${c.user.firstName[0]}${c.user.lastName[0]}`.toUpperCase();
                const total = item.package.totalSessions;
                const used = item.package.used;
                const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;

                return (
                  <Link
                    key={c.id}
                    href={`/admin/clients/${c.id}`}
                    className="group block rounded-2xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-3 transition-colors hover:border-primary/40 hover:bg-white/[0.05]"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/15 text-xs font-bold text-primary">
                        {c.user.profileImageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={c.user.profileImageUrl}
                            alt={name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span>{clientInitials}</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-semibold transition-colors group-hover:text-primary">
                            {name}
                          </p>
                          {c.paymentStatus === 'PENDING' && (
                            <span className="shrink-0 rounded-md bg-destructive/15 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                              Unpaid
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                          {item.package.planName ?? `${item.package.sessionsPerMonth} / month`}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3">
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>Sessions used</span>
                        <span className="font-medium text-foreground">
                          {used}/{total || '—'}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all',
                            pct >= 90
                              ? 'bg-amber-500'
                              : pct >= 70
                                ? 'bg-primary'
                                : 'bg-emerald-500',
                          )}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                      {item.nextSession ? (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          Next {fmtSessionDate(item.nextSession.scheduledDate)} ·{' '}
                          {fmtTime(item.nextSession.scheduledTime)}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 italic">
                          <Calendar className="h-3 w-3" />
                          No upcoming session
                        </span>
                      )}
                      {c.user.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {c.user.phone}
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Sticky footer — only on Profile tab */}
      {activeTab === 'profile' && (
        <div className="sticky bottom-0 z-20 border-t border-white/[0.06] bg-background/95 px-4 py-3 backdrop-blur">
          <div className="flex gap-2">
            <button
              onClick={handleDelete}
              className="hidden sm:flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-red-500/10 py-2.5 text-sm font-medium text-red-400 ring-1 ring-red-500/20 transition-colors hover:bg-red-500/15 active:scale-95"
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
      )}

      {ConfirmDialog}
    </div>
  );
}
