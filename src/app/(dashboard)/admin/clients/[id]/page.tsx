'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, KeyRound, Plus, Save, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useConfirm } from '@/hooks/use-confirm';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { BadgeGrid, type EarnedBadge, type LockedBadge } from '@/components/badges/BadgeGrid';

interface ClientData {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  isActive: boolean;
  role: string;
  clientProfile: {
    id: string;
    gender: string | null;
    dateOfBirth: string | null;
    emergencyContactName: string | null;
    emergencyContactPhone: string | null;
    height: number | null;
    currentWeight: number | null;
    bodyFatPercentage: number | null;
    medicalConditions: string | null;
    fitnessGoals: string | null;
    sessionDurationOverrideMin: number | null;
  } | null;
}

interface PtPackage {
  id: string;
  trainerProfileId: string;
  sessionsPerMonth: number;
  sessionChargeAmount: number | null;
  isActive: boolean;
  startDate: string;
  endDate: string | null;
  trainer: {
    id: string;
    user: { firstName: string; lastName: string; email: string };
  };
}

interface TrainerOption {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  trainerProfile: { id: string } | null;
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

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-3">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
          {title}
        </p>
        {action}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

export default function ClientProfilePage() {
  const { confirm, ConfirmDialog } = useConfirm();
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [client, setClient] = useState<ClientData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [resetPassword, setResetPassword] = useState('');
  const [resetSaving, setResetSaving] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetSuccess, setResetSuccess] = useState(false);

  const [earnedBadges, setEarnedBadges] = useState<EarnedBadge[]>([]);
  const [lockedBadges, setLockedBadges] = useState<LockedBadge[]>([]);
  const [badgesLoading, setBadgesLoading] = useState(true);

  const [packages, setPackages] = useState<PtPackage[]>([]);
  const [packagesLoading, setPackagesLoading] = useState(true);
  const [trainers, setTrainers] = useState<TrainerOption[]>([]);
  const [showAddMapping, setShowAddMapping] = useState(false);
  const [mappingForm, setMappingForm] = useState({
    trainerProfileId: '',
    sessionsPerMonth: '12',
    sessionCharge: '',
    startDate: new Date().toISOString().split('T')[0] ?? '',
  });
  const [mappingSaving, setMappingSaving] = useState(false);
  const [mappingError, setMappingError] = useState('');

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    gender: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    height: '',
    currentWeight: '',
    bodyFatPercentage: '',
    medicalConditions: '',
    fitnessGoals: '',
    sessionDurationOverrideMin: '',
  });

  const fetchClient = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/users/${id}`);
      if (!res.ok) {
        setError('Client not found');
        return;
      }
      const { data } = await res.json();
      setClient(data);
      setForm({
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone ?? '',
        gender: data.clientProfile?.gender ?? '',
        emergencyContactName: data.clientProfile?.emergencyContactName ?? '',
        emergencyContactPhone: data.clientProfile?.emergencyContactPhone ?? '',
        height: data.clientProfile?.height?.toString() ?? '',
        currentWeight: data.clientProfile?.currentWeight?.toString() ?? '',
        bodyFatPercentage: data.clientProfile?.bodyFatPercentage?.toString() ?? '',
        medicalConditions: data.clientProfile?.medicalConditions ?? '',
        fitnessGoals: data.clientProfile?.fitnessGoals ?? '',
        sessionDurationOverrideMin:
          data.clientProfile?.sessionDurationOverrideMin?.toString() ?? '',
      });
    } catch {
      setError('Failed to load client');
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchPackages = useCallback(async (clientProfileId: string) => {
    try {
      const res = await fetch(`/api/admin/mappings?clientId=${clientProfileId}`);
      if (res.ok) {
        const { data } = await res.json();
        setPackages(data);
      }
    } catch {
      /* silent */
    } finally {
      setPackagesLoading(false);
    }
  }, []);

  const fetchTrainers = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/users?role=TRAINER&pageSize=100');
      if (res.ok) {
        const { data } = await res.json();
        setTrainers(data);
      }
    } catch {
      /* silent */
    }
  }, []);

  useEffect(() => {
    fetchClient();
    fetchTrainers();
  }, [fetchClient, fetchTrainers]);
  useEffect(() => {
    if (client?.clientProfile?.id) fetchPackages(client.clientProfile.id);
  }, [client?.clientProfile?.id, fetchPackages]);
  useEffect(() => {
    if (!id) return;
    setBadgesLoading(true);
    fetch(`/api/admin/users/${id}/badges`)
      .then((r) => r.json())
      .then(({ data }) => {
        if (data) {
          setEarnedBadges(data.earned ?? []);
          setLockedBadges(data.locked ?? []);
        }
      })
      .catch(() => {})
      .finally(() => setBadgesLoading(false));
  }, [id]);

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
          gender: form.gender || undefined,
          emergencyContactName: form.emergencyContactName || undefined,
          emergencyContactPhone: form.emergencyContactPhone || undefined,
          height: form.height ? parseFloat(form.height) : undefined,
          currentWeight: form.currentWeight ? parseFloat(form.currentWeight) : undefined,
          bodyFatPercentage: form.bodyFatPercentage
            ? parseFloat(form.bodyFatPercentage)
            : undefined,
          medicalConditions: form.medicalConditions || undefined,
          fitnessGoals: form.fitnessGoals || undefined,
          sessionDurationOverrideMin: form.sessionDurationOverrideMin
            ? parseInt(form.sessionDurationOverrideMin, 10)
            : undefined,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? 'Failed to save');
      } else await fetchClient();
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
        const d = await res.json();
        setResetError(d.error ?? 'Failed to reset password');
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
      title: 'Deactivate Client',
      description: 'Are you sure you want to deactivate this client?',
      confirmText: 'Deactivate',
      variant: 'destructive',
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
      if (res.ok) router.push('/admin/clients');
    } catch {
      setError('Failed to delete client');
    }
  }

  async function handleAddMapping() {
    if (!client?.clientProfile?.id || !mappingForm.trainerProfileId) return;
    setMappingSaving(true);
    setMappingError('');
    try {
      const res = await fetch('/api/admin/mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientProfileId: client.clientProfile.id,
          trainerProfileId: mappingForm.trainerProfileId,
          sessionsPerMonth: parseInt(mappingForm.sessionsPerMonth, 10),
          sessionCharge: mappingForm.sessionCharge
            ? parseFloat(mappingForm.sessionCharge)
            : undefined,
          startDate: mappingForm.startDate,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setMappingError(d.error ?? 'Failed to create mapping');
      } else {
        setShowAddMapping(false);
        setMappingForm({
          trainerProfileId: '',
          sessionsPerMonth: '12',
          sessionCharge: '',
          startDate: new Date().toISOString().split('T')[0] ?? '',
        });
        await fetchPackages(client.clientProfile.id);
      }
    } catch {
      setMappingError('Failed to create mapping');
    } finally {
      setMappingSaving(false);
    }
  }

  async function handleDeactivateMapping(pkgId: string) {
    const ok = await confirm({
      title: 'Deactivate Mapping',
      description: 'Deactivate this trainer mapping?',
      confirmText: 'Deactivate',
      variant: 'destructive',
    });
    if (!ok || !client?.clientProfile?.id) return;
    try {
      const res = await fetch(`/api/admin/mappings/${pkgId}`, { method: 'DELETE' });
      if (res.ok) await fetchPackages(client.clientProfile.id);
    } catch {
      /* silent */
    }
  }

  function f(field: string, value: string) {
    setForm((p) => ({ ...p, [field]: value }));
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="-m-4 md:-m-6 flex h-full flex-col overflow-hidden bg-background">
        <div className="flex h-14 items-center gap-3 border-b px-4">
          <Skeleton className="h-8 w-8 rounded-xl" />
          <Skeleton className="h-4 w-40 rounded-lg" />
        </div>
        <div className="flex-1 space-y-2.5 overflow-y-auto px-4 py-3">
          <Skeleton className="h-40 w-full rounded-2xl" />
          <Skeleton className="h-48 w-full rounded-2xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="-m-4 md:-m-6 flex h-full items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">{error || 'Client not found'}</p>
      </div>
    );
  }

  const initials = `${client.firstName[0]}${client.lastName[0]}`.toUpperCase();
  const activePackages = packages.filter((p) => p.isActive);
  const inactivePackages = packages.filter((p) => !p.isActive);

  return (
    <div className="-m-4 md:-m-6 flex h-full flex-col overflow-hidden bg-background">
      {/* Sticky header */}
      <div className="sticky top-0 z-20 border-b border-white/[0.06] bg-background/95 backdrop-blur">
        <div className="flex h-14 items-center gap-3 px-4">
          <button
            onClick={() => router.push('/admin/clients')}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex flex-1 items-center gap-2.5 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-none">
                {client.firstName} {client.lastName}
              </p>
              <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{client.email}</p>
            </div>
            <span
              className={cn(
                'shrink-0 rounded-full px-2 py-px text-[10px] font-semibold',
                client.isActive
                  ? 'bg-emerald-500/15 text-emerald-400'
                  : 'bg-muted text-muted-foreground',
              )}
            >
              {client.isActive ? 'Active' : 'Inactive'}
            </span>
          </div>
          {/* Actions */}
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              onClick={handleDelete}
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-red-500/10 text-red-400 transition-colors hover:bg-red-500/20"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              <Save className="h-3.5 w-3.5" />
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>

      {/* Scrollable form */}
      <div className="flex-1 overflow-y-auto">
        <div className="space-y-2.5 px-4 py-3 pb-10">
          {error && (
            <p className="rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          )}

          {/* Personal Information */}
          <Section title="Personal Information">
            <div className="grid grid-cols-2 gap-2">
              <Field label="First Name">
                <Input
                  value={form.firstName}
                  onChange={(e) => f('firstName', e.target.value)}
                  className="h-9 text-xs border-white/[0.08]"
                />
              </Field>
              <Field label="Last Name">
                <Input
                  value={form.lastName}
                  onChange={(e) => f('lastName', e.target.value)}
                  className="h-9 text-xs border-white/[0.08]"
                />
              </Field>
            </div>
            <Field label="Phone">
              <Input
                value={form.phone}
                onChange={(e) => f('phone', e.target.value)}
                className="h-9 text-xs border-white/[0.08]"
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Emergency Contact">
                <Input
                  value={form.emergencyContactName}
                  onChange={(e) => f('emergencyContactName', e.target.value)}
                  placeholder="Name"
                  className="h-9 text-xs border-white/[0.08]"
                />
              </Field>
              <Field label="Emergency Phone">
                <Input
                  value={form.emergencyContactPhone}
                  onChange={(e) => f('emergencyContactPhone', e.target.value)}
                  className="h-9 text-xs border-white/[0.08]"
                />
              </Field>
            </div>
          </Section>

          {/* Health Metrics */}
          <Section title="Health Metrics">
            <div className="grid grid-cols-3 gap-2">
              <Field label="Gender">
                <Select
                  value={form.gender || 'unset'}
                  onValueChange={(v) => f('gender', v === 'unset' ? '' : (v ?? ''))}
                >
                  <SelectTrigger className="h-9 text-xs border-white/[0.08]">
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unset">Not set</SelectItem>
                    <SelectItem value="MALE">Male</SelectItem>
                    <SelectItem value="FEMALE">Female</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Height (cm)">
                <Input
                  type="number"
                  value={form.height}
                  onChange={(e) => f('height', e.target.value)}
                  className="h-9 text-xs border-white/[0.08]"
                />
              </Field>
              <Field label="Weight (kg)">
                <Input
                  type="number"
                  value={form.currentWeight}
                  onChange={(e) => f('currentWeight', e.target.value)}
                  className="h-9 text-xs border-white/[0.08]"
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Body Fat %">
                <Input
                  type="number"
                  value={form.bodyFatPercentage}
                  onChange={(e) => f('bodyFatPercentage', e.target.value)}
                  className="h-9 text-xs border-white/[0.08]"
                />
              </Field>
              <Field label="Session Duration (min)">
                <Input
                  type="number"
                  placeholder="Branch default"
                  value={form.sessionDurationOverrideMin}
                  onChange={(e) => f('sessionDurationOverrideMin', e.target.value)}
                  className="h-9 text-xs border-white/[0.08]"
                />
              </Field>
            </div>
            <Field label="Medical Conditions">
              <Textarea
                value={form.medicalConditions}
                rows={2}
                onChange={(e) => f('medicalConditions', e.target.value)}
                className="resize-none text-xs border-white/[0.08]"
              />
            </Field>
            <Field label="Fitness Goals">
              <Textarea
                value={form.fitnessGoals}
                rows={2}
                onChange={(e) => f('fitnessGoals', e.target.value)}
                className="resize-none text-xs border-white/[0.08]"
              />
            </Field>
          </Section>

          {/* Trainer Mappings */}
          <Section
            title="Trainer Mappings"
            action={
              <button
                onClick={() => setShowAddMapping((v) => !v)}
                disabled={!client.clientProfile}
                className="flex items-center gap-1 rounded-lg bg-white/[0.06] px-2 py-1 text-[10px] font-semibold text-muted-foreground transition-colors hover:bg-white/10 disabled:opacity-40"
              >
                {showAddMapping ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                {showAddMapping ? 'Cancel' : 'Assign Trainer'}
              </button>
            }
          >
            {/* Add form */}
            {showAddMapping && (
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 space-y-2.5">
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Trainer">
                    <select
                      className="flex h-9 w-full rounded-lg border border-white/[0.08] bg-transparent px-3 text-xs text-foreground focus:outline-none focus:border-primary"
                      value={mappingForm.trainerProfileId}
                      onChange={(e) =>
                        setMappingForm((p) => ({ ...p, trainerProfileId: e.target.value }))
                      }
                    >
                      <option value="">Select trainer</option>
                      {trainers
                        .filter((t) => t.trainerProfile)
                        .map((t) => (
                          <option key={t.trainerProfile!.id} value={t.trainerProfile!.id}>
                            {t.firstName} {t.lastName}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <Field label="Sessions / Month">
                    <Input
                      type="number"
                      min="1"
                      value={mappingForm.sessionsPerMonth}
                      onChange={(e) =>
                        setMappingForm((p) => ({ ...p, sessionsPerMonth: e.target.value }))
                      }
                      className="h-9 text-xs border-white/[0.08]"
                    />
                  </Field>
                  <Field label="Start Date">
                    <Input
                      type="date"
                      value={mappingForm.startDate}
                      onChange={(e) => setMappingForm((p) => ({ ...p, startDate: e.target.value }))}
                      className="h-9 text-xs border-white/[0.08]"
                    />
                  </Field>
                  <Field label="Session Charge (optional)">
                    <Input
                      type="number"
                      min="0"
                      placeholder="—"
                      value={mappingForm.sessionCharge}
                      onChange={(e) =>
                        setMappingForm((p) => ({ ...p, sessionCharge: e.target.value }))
                      }
                      className="h-9 text-xs border-white/[0.08]"
                    />
                  </Field>
                </div>
                {mappingError && <p className="text-xs text-destructive">{mappingError}</p>}
                <button
                  onClick={handleAddMapping}
                  disabled={mappingSaving || !mappingForm.trainerProfileId}
                  className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
                >
                  {mappingSaving ? 'Creating…' : 'Create Mapping'}
                </button>
              </div>
            )}

            {/* Package list */}
            {packagesLoading ? (
              <Skeleton className="h-12 w-full rounded-xl" />
            ) : activePackages.length === 0 && inactivePackages.length === 0 ? (
              <p className="text-xs text-muted-foreground">No trainer mappings yet.</p>
            ) : (
              <div className="space-y-1.5">
                {activePackages.map((pkg) => (
                  <div
                    key={pkg.id}
                    className="flex items-center gap-3 rounded-xl bg-white/[0.04] px-3 py-2"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-semibold truncate">
                          {pkg.trainer.user.firstName} {pkg.trainer.user.lastName}
                        </p>
                        <span className="shrink-0 rounded-full bg-emerald-500/15 px-1.5 py-px text-[9px] font-semibold text-emerald-400">
                          Active
                        </span>
                      </div>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        {pkg.sessionsPerMonth} sessions/mo
                        {pkg.sessionChargeAmount != null &&
                          ` · ₹${pkg.sessionChargeAmount}/session`}
                        {' · '}since {new Date(pkg.startDate).toLocaleDateString()}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDeactivateMapping(pkg.id)}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-red-500/10 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                {inactivePackages.length > 0 && (
                  <>
                    <p className="pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/50">
                      Past
                    </p>
                    {inactivePackages.map((pkg) => (
                      <div
                        key={pkg.id}
                        className="flex items-center gap-3 rounded-xl bg-white/[0.02] px-3 py-2 opacity-50"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold truncate">
                            {pkg.trainer.user.firstName} {pkg.trainer.user.lastName}
                          </p>
                          <p className="mt-0.5 text-[10px] text-muted-foreground">
                            {pkg.sessionsPerMonth} sessions/mo
                            {' · '}
                            {new Date(pkg.startDate).toLocaleDateString()}
                            {pkg.endDate && ` — ${new Date(pkg.endDate).toLocaleDateString()}`}
                          </p>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
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

          {/* Badges */}
          <Section title="Achievement Badges">
            {badgesLoading ? (
              <Skeleton className="h-20 w-full rounded-xl" />
            ) : (
              <BadgeGrid earned={earnedBadges} locked={lockedBadges} />
            )}
          </Section>
        </div>
      </div>

      {ConfirmDialog}
    </div>
  );
}
