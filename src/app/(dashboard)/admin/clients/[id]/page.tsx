'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  KeyRound,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
  TrendingUp,
  Scale,
  Flame,
  Dumbbell,
  Ruler,
  Heart,
  Zap,
  MoveHorizontal,
  MoveVertical,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useConfirm } from '@/hooks/use-confirm';
import { Input } from '@/components/ui/input';
import { DatePickerModal } from '@/components/ui/date-picker-modal';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { BadgeGrid, type EarnedBadge, type LockedBadge } from '@/components/badges/BadgeGrid';
import ProgressLineChart from '@/components/charts/ProgressLineChart';
import WorkoutProgressionPanel, {
  type ExerciseSummary,
} from '@/components/charts/WorkoutProgressionPanel';

// ─── Progress Types ───────────────────────────────────────────────────────────

interface ProgressEntry {
  id: string;
  recordedAt: string;
  weightKg: number | null;
  bodyFatPercent: number | null;
  muscleMass: number | null;
  chest: number | null;
  waist: number | null;
  hips: number | null;
  bicepLeft: number | null;
  bicepRight: number | null;
  thighLeft: number | null;
  thighRight: number | null;
  photoUrls: string[];
  notes: string | null;
}

interface ChartPoint {
  date: string;
  value: number | null;
  label?: string;
}

function fmtVal(val: number | null | undefined, decimals = 1): string {
  if (val == null) return '—';
  return val.toFixed(decimals);
}

function getDelta(a: number | null | undefined, b: number | null | undefined) {
  if (a == null || b == null) return null;
  return a - b;
}

function DeltaChip({
  diff,
  unit = '',
  lowerIsBetter = false,
}: {
  diff: number | null;
  unit?: string;
  lowerIsBetter?: boolean;
}) {
  if (diff == null || Math.abs(diff) < 0.01)
    return <span className="text-xs text-muted-foreground">No change</span>;
  const positive = lowerIsBetter ? diff < 0 : diff > 0;
  const Icon = diff < 0 ? ArrowDownRight : ArrowUpRight;
  return (
    <span
      className={`flex items-center gap-0.5 text-xs font-medium ${positive ? 'text-emerald-500' : 'text-red-500'}`}
    >
      <Icon className="h-3 w-3" />
      {diff > 0 ? '+' : ''}
      {diff.toFixed(1)}
      {unit}
    </span>
  );
}

// ─── Client Types ─────────────────────────────────────────────────────────────

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
  planId: string | null;
  sessionsPerMonth: number;
  totalSessions: number;
  onboardingUsedSessions: number;
  onboardingNotes: string | null;
  sessionChargeAmount: number | null;
  isActive: boolean;
  startDate: string;
  endDate: string | null;
  trainer: {
    id: string;
    user: { firstName: string; lastName: string; email: string };
  };
  plan: { id: string; name: string } | null;
}

interface TrainerOption {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  trainerProfile: { id: string } | null;
}

interface PlanOption {
  id: string;
  name: string;
  sessionsPerMonth: number;
  pricePerCycle: number;
  sessionChargeAmount: number | null;
  durationDays: number;
  isActive: boolean;
}

function addDaysISO(startDate: string, days: number): string {
  if (!startDate) return '';
  const d = new Date(startDate);
  if (Number.isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0]!;
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

  // Progress tab state
  const [activeTab, setActiveTab] = useState('profile');
  const [progressEntries, setProgressEntries] = useState<ProgressEntry[]>([]);
  const [weightChart, setWeightChart] = useState<ChartPoint[]>([]);
  const [bodyFatChart, setBodyFatChart] = useState<ChartPoint[]>([]);
  const [muscleChart, setMuscleChart] = useState<ChartPoint[]>([]);
  const [progressLoading, setProgressLoading] = useState(false);
  const [progressLoaded, setProgressLoaded] = useState(false);
  const [progressExercises, setProgressExercises] = useState<ExerciseSummary[]>([]);
  const [exercisesLoaded, setExercisesLoaded] = useState(false);
  const [workoutTabActive, setWorkoutTabActive] = useState(false);

  const [packages, setPackages] = useState<PtPackage[]>([]);
  const [packagesLoading, setPackagesLoading] = useState(true);
  const [trainers, setTrainers] = useState<TrainerOption[]>([]);
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [showAddMapping, setShowAddMapping] = useState(false);
  const [mappingForm, setMappingForm] = useState({
    trainerProfileId: '',
    planId: '',
    sessionsPerMonth: '12',
    totalSessions: '',
    onboardingUsedSessions: '',
    onboardingNotes: '',
    sessionCharge: '',
    startDate: new Date().toISOString().split('T')[0] ?? '',
    endDate: '',
  });
  const [mappingSaving, setMappingSaving] = useState(false);
  const [mappingError, setMappingError] = useState('');

  const [editingPkgId, setEditingPkgId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    planId: '',
    sessionsPerMonth: '',
    totalSessions: '',
    onboardingUsedSessions: '',
    onboardingNotes: '',
    sessionCharge: '',
    endDate: '',
  });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

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

  const fetchPlans = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/package-plans?activeOnly=true&pageSize=100');
      if (res.ok) {
        const { data } = await res.json();
        setPlans(data);
      }
    } catch {
      /* silent */
    }
  }, []);

  const fetchProgress = useCallback(async () => {
    if (!id) return;
    setProgressLoading(true);
    try {
      const base = `/api/admin/users/${id}/progress`;
      const [eRes, wRes, bRes, mRes] = await Promise.all([
        fetch(base),
        fetch(`${base}/charts?metric=weight`),
        fetch(`${base}/charts?metric=bodyFat`),
        fetch(`${base}/charts?metric=muscleMass`).catch(() => null),
      ]);
      if (eRes.ok) {
        const { data } = await eRes.json();
        setProgressEntries(data);
      }
      if (wRes.ok) {
        const { data } = await wRes.json();
        setWeightChart(data);
      }
      if (bRes.ok) {
        const { data } = await bRes.json();
        setBodyFatChart(data);
      }
      if (mRes?.ok) {
        const { data } = await mRes.json();
        setMuscleChart(data);
      }
      setProgressLoaded(true);
    } finally {
      setProgressLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchClient();
    fetchTrainers();
    fetchPlans();
  }, [fetchClient, fetchTrainers, fetchPlans]);
  useEffect(() => {
    if (client?.clientProfile?.id) fetchPackages(client.clientProfile.id);
  }, [client?.clientProfile?.id, fetchPackages]);
  useEffect(() => {
    if (activeTab === 'progress' && !progressLoaded && !progressLoading) {
      fetchProgress();
    }
  }, [activeTab, progressLoaded, progressLoading, fetchProgress]);

  useEffect(() => {
    if (workoutTabActive && !exercisesLoaded && id) {
      fetch(`/api/admin/users/${id}/progress/exercises`)
        .then((r) => r.json())
        .then(({ data }) => {
          setProgressExercises(data ?? []);
          setExercisesLoaded(true);
        })
        .catch(() => setExercisesLoaded(true));
    }
  }, [workoutTabActive, exercisesLoaded, id]);

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
          planId: mappingForm.planId || undefined,
          sessionsPerMonth: parseInt(mappingForm.sessionsPerMonth, 10),
          totalSessions: mappingForm.totalSessions
            ? parseInt(mappingForm.totalSessions, 10)
            : undefined,
          onboardingUsedSessions: mappingForm.onboardingUsedSessions
            ? parseInt(mappingForm.onboardingUsedSessions, 10)
            : undefined,
          onboardingNotes: mappingForm.onboardingNotes.trim() || undefined,
          sessionCharge: mappingForm.sessionCharge
            ? parseFloat(mappingForm.sessionCharge)
            : undefined,
          startDate: mappingForm.startDate,
          endDate: mappingForm.endDate || undefined,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setMappingError(d.error ?? 'Failed to create mapping');
      } else {
        setShowAddMapping(false);
        setMappingForm({
          trainerProfileId: '',
          planId: '',
          sessionsPerMonth: '12',
          totalSessions: '',
          onboardingUsedSessions: '',
          onboardingNotes: '',
          sessionCharge: '',
          startDate: new Date().toISOString().split('T')[0] ?? '',
          endDate: '',
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

  function startEditing(pkg: PtPackage) {
    setEditingPkgId(pkg.id);
    setEditForm({
      planId: pkg.planId ?? '',
      sessionsPerMonth: pkg.sessionsPerMonth.toString(),
      totalSessions: pkg.totalSessions.toString(),
      onboardingUsedSessions: pkg.onboardingUsedSessions
        ? pkg.onboardingUsedSessions.toString()
        : '',
      onboardingNotes: pkg.onboardingNotes ?? '',
      sessionCharge: pkg.sessionChargeAmount?.toString() ?? '',
      endDate: pkg.endDate ? pkg.endDate.split('T')[0]! : '',
    });
    setEditError('');
  }

  async function handleEditMapping() {
    if (!editingPkgId || !client?.clientProfile?.id) return;
    setEditSaving(true);
    setEditError('');
    try {
      const res = await fetch(`/api/admin/mappings/${editingPkgId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: editForm.planId || null,
          sessionsPerMonth: parseInt(editForm.sessionsPerMonth, 10),
          totalSessions: editForm.totalSessions ? parseInt(editForm.totalSessions, 10) : undefined,
          onboardingUsedSessions: editForm.onboardingUsedSessions
            ? parseInt(editForm.onboardingUsedSessions, 10)
            : 0,
          onboardingNotes: editForm.onboardingNotes.trim() || null,
          sessionCharge: editForm.sessionCharge ? parseFloat(editForm.sessionCharge) : undefined,
          endDate: editForm.endDate || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setEditError(d.error ?? 'Failed to update mapping');
      } else {
        setEditingPkgId(null);
        await fetchPackages(client.clientProfile.id);
      }
    } catch {
      setEditError('Failed to update mapping');
    } finally {
      setEditSaving(false);
    }
  }

  function f(field: string, value: string) {
    setForm((p) => ({ ...p, [field]: value }));
  }

  function applyPlanToForm(planId: string, target: 'add' | 'edit') {
    if (target === 'add') {
      setMappingForm((prev) => {
        if (planId === '') return { ...prev, planId: '' };
        const plan = plans.find((p) => p.id === planId);
        if (!plan) return { ...prev, planId };
        const computedTotal = Math.round((plan.sessionsPerMonth * plan.durationDays) / 30);
        return {
          ...prev,
          planId,
          sessionsPerMonth: plan.sessionsPerMonth.toString(),
          totalSessions: computedTotal.toString(),
          sessionCharge: plan.sessionChargeAmount?.toString() ?? '',
          endDate: addDaysISO(prev.startDate, plan.durationDays),
        };
      });
    } else {
      setEditForm((prev) => {
        if (planId === '') return { ...prev, planId: '' };
        const plan = plans.find((p) => p.id === planId);
        if (!plan) return { ...prev, planId };
        const computedTotal = Math.round((plan.sessionsPerMonth * plan.durationDays) / 30);
        return {
          ...prev,
          planId,
          sessionsPerMonth: plan.sessionsPerMonth.toString(),
          totalSessions: computedTotal.toString(),
          sessionCharge: plan.sessionChargeAmount?.toString() ?? '',
        };
      });
    }
  }

  function isPlanEdited(planId: string, sessionsPerMonth: string, sessionCharge: string) {
    if (!planId) return false;
    const plan = plans.find((p) => p.id === planId);
    if (!plan) return false;
    const sessionsDiffer = parseInt(sessionsPerMonth, 10) !== plan.sessionsPerMonth;
    const chargeDiffer = (plan.sessionChargeAmount?.toString() ?? '') !== sessionCharge;
    return sessionsDiffer || chargeDiffer;
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

      {/* Tab bar */}
      <div className="border-b border-white/[0.06] px-4">
        <div className="flex gap-1">
          {(['profile', 'progress'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'px-3 py-2.5 text-xs font-semibold capitalize transition-colors border-b-2 -mb-px',
                activeTab === tab
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {tab === 'progress' ? (
                <span className="flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5" />
                  Progress
                </span>
              ) : (
                'Profile'
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {/* ── Profile tab ── */}
        {activeTab === 'profile' && (
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
                  <Field label="Plan">
                    <select
                      className="flex h-9 w-full rounded-lg border border-white/[0.08] bg-transparent px-3 text-xs text-foreground focus:outline-none focus:border-primary"
                      value={mappingForm.planId}
                      onChange={(e) => applyPlanToForm(e.target.value, 'add')}
                    >
                      <option value="">Custom (enter manually)</option>
                      {plans.map((pl) => (
                        <option key={pl.id} value={pl.id}>
                          {pl.name} · {pl.sessionsPerMonth} sessions · ₹
                          {pl.pricePerCycle.toLocaleString()}
                        </option>
                      ))}
                    </select>
                  </Field>
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
                      <DatePickerModal
                        value={mappingForm.startDate}
                        onChange={(v) =>
                          setMappingForm((p) => {
                            const plan = p.planId ? plans.find((pl) => pl.id === p.planId) : null;
                            return {
                              ...p,
                              startDate: v,
                              endDate: plan ? addDaysISO(v, plan.durationDays) : p.endDate,
                            };
                          })
                        }
                        className="h-9 text-xs"
                      />
                    </Field>
                    <Field label="End Date (optional)">
                      <DatePickerModal
                        value={mappingForm.endDate}
                        onChange={(v) => setMappingForm((p) => ({ ...p, endDate: v }))}
                        minDate={mappingForm.startDate}
                        className="h-9 text-xs"
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
                    <Field label="Total Sessions in Package">
                      <Input
                        type="number"
                        min="1"
                        placeholder="Auto from plan"
                        value={mappingForm.totalSessions}
                        onChange={(e) =>
                          setMappingForm((p) => ({ ...p, totalSessions: e.target.value }))
                        }
                        className="h-9 text-xs border-white/[0.08]"
                      />
                    </Field>
                  </div>
                  <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5 space-y-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-400/80">
                      Onboarding adjustment (optional)
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Sessions Already Used">
                        <Input
                          type="number"
                          min="0"
                          placeholder="0"
                          value={mappingForm.onboardingUsedSessions}
                          onChange={(e) =>
                            setMappingForm((p) => ({
                              ...p,
                              onboardingUsedSessions: e.target.value,
                            }))
                          }
                          className="h-9 text-xs border-white/[0.08]"
                        />
                      </Field>
                      <Field label="Notes">
                        <Input
                          placeholder="e.g. confirmed by manager"
                          value={mappingForm.onboardingNotes}
                          onChange={(e) =>
                            setMappingForm((p) => ({
                              ...p,
                              onboardingNotes: e.target.value,
                            }))
                          }
                          className="h-9 text-xs border-white/[0.08]"
                        />
                      </Field>
                    </div>
                    <p className="text-[10px] text-muted-foreground/70">
                      Use only when onboarding clients who started before the app went live. These
                      sessions count as already-used in the package window.
                    </p>
                  </div>
                  {isPlanEdited(
                    mappingForm.planId,
                    mappingForm.sessionsPerMonth,
                    mappingForm.sessionCharge,
                  ) && (
                    <p className="rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-[10px] text-amber-500">
                      Edited from plan default — saved values will override the plan.
                    </p>
                  )}
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
                  {activePackages.map((pkg) =>
                    editingPkgId === pkg.id ? (
                      <div
                        key={pkg.id}
                        className="rounded-xl border border-primary/30 bg-white/[0.04] p-3 space-y-2.5"
                      >
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">
                          Editing — {pkg.trainer.user.firstName} {pkg.trainer.user.lastName}
                        </p>
                        <Field label="Plan">
                          <select
                            className="flex h-9 w-full rounded-lg border border-white/[0.08] bg-transparent px-3 text-xs text-foreground focus:outline-none focus:border-primary"
                            value={editForm.planId}
                            onChange={(e) => applyPlanToForm(e.target.value, 'edit')}
                          >
                            <option value="">Custom (enter manually)</option>
                            {plans.map((pl) => (
                              <option key={pl.id} value={pl.id}>
                                {pl.name} · {pl.sessionsPerMonth} sessions · ₹
                                {pl.pricePerCycle.toLocaleString()}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <div className="grid grid-cols-3 gap-2">
                          <Field label="Sessions / Month">
                            <Input
                              type="number"
                              min="1"
                              value={editForm.sessionsPerMonth}
                              onChange={(e) =>
                                setEditForm((p) => ({ ...p, sessionsPerMonth: e.target.value }))
                              }
                              className="h-9 text-xs border-white/[0.08]"
                            />
                          </Field>
                          <Field label="Session Charge (optional)">
                            <Input
                              type="number"
                              min="0"
                              placeholder="—"
                              value={editForm.sessionCharge}
                              onChange={(e) =>
                                setEditForm((p) => ({ ...p, sessionCharge: e.target.value }))
                              }
                              className="h-9 text-xs border-white/[0.08]"
                            />
                          </Field>
                          <Field label="End Date (optional)">
                            <DatePickerModal
                              value={editForm.endDate}
                              onChange={(v) => setEditForm((p) => ({ ...p, endDate: v }))}
                              className="h-9 text-xs"
                            />
                          </Field>
                        </div>
                        <Field label="Total Sessions in Package">
                          <Input
                            type="number"
                            min="1"
                            value={editForm.totalSessions}
                            onChange={(e) =>
                              setEditForm((p) => ({ ...p, totalSessions: e.target.value }))
                            }
                            className="h-9 text-xs border-white/[0.08]"
                          />
                        </Field>
                        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5 space-y-2">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-400/80">
                            Onboarding adjustment
                          </p>
                          <div className="grid grid-cols-2 gap-2">
                            <Field label="Sessions Already Used">
                              <Input
                                type="number"
                                min="0"
                                placeholder="0"
                                value={editForm.onboardingUsedSessions}
                                onChange={(e) =>
                                  setEditForm((p) => ({
                                    ...p,
                                    onboardingUsedSessions: e.target.value,
                                  }))
                                }
                                className="h-9 text-xs border-white/[0.08]"
                              />
                            </Field>
                            <Field label="Notes">
                              <Input
                                placeholder="e.g. confirmed by manager"
                                value={editForm.onboardingNotes}
                                onChange={(e) =>
                                  setEditForm((p) => ({ ...p, onboardingNotes: e.target.value }))
                                }
                                className="h-9 text-xs border-white/[0.08]"
                              />
                            </Field>
                          </div>
                        </div>
                        {isPlanEdited(
                          editForm.planId,
                          editForm.sessionsPerMonth,
                          editForm.sessionCharge,
                        ) && (
                          <p className="rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-[10px] text-amber-500">
                            Edited from plan default — saved values will override the plan.
                          </p>
                        )}
                        {editError && <p className="text-xs text-destructive">{editError}</p>}
                        <div className="flex items-center gap-2">
                          <button
                            onClick={handleEditMapping}
                            disabled={editSaving}
                            className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
                          >
                            <Save className="h-3 w-3" />
                            {editSaving ? 'Saving…' : 'Save Changes'}
                          </button>
                          <button
                            onClick={() => setEditingPkgId(null)}
                            className="rounded-xl px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        key={pkg.id}
                        className="flex items-center gap-3 rounded-xl bg-white/[0.04] px-3 py-2"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="text-xs font-semibold truncate">
                              {pkg.trainer.user.firstName} {pkg.trainer.user.lastName}
                            </p>
                            <span className="shrink-0 rounded-full bg-emerald-500/15 px-1.5 py-px text-[9px] font-semibold text-emerald-400">
                              Active
                            </span>
                            {pkg.plan && (
                              <span className="shrink-0 rounded-full bg-blue-500/15 px-1.5 py-px text-[9px] font-semibold text-blue-400">
                                {pkg.plan.name}
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-[10px] text-muted-foreground">
                            {pkg.sessionsPerMonth} sessions/mo
                            {pkg.sessionChargeAmount != null &&
                              ` · ₹${pkg.sessionChargeAmount}/session`}
                            {' · '}since {new Date(pkg.startDate).toLocaleDateString()}
                            {pkg.endDate && ` · ends ${new Date(pkg.endDate).toLocaleDateString()}`}
                          </p>
                        </div>
                        <button
                          onClick={() => startEditing(pkg)}
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-white/10 hover:text-foreground transition-colors"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeactivateMapping(pkg.id)}
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-red-500/10 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ),
                  )}
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
        )}

        {/* ── Progress tab ── */}
        {activeTab === 'progress' && (
          <AdminProgressView
            userId={id}
            entries={progressEntries}
            weightChart={weightChart}
            bodyFatChart={bodyFatChart}
            muscleChart={muscleChart}
            loading={progressLoading}
            exercises={progressExercises}
            exercisesLoaded={exercisesLoaded}
            onWorkoutTabActive={() => setWorkoutTabActive(true)}
          />
        )}
      </div>

      {ConfirmDialog}
    </div>
  );
}

// ─── AdminProgressView ────────────────────────────────────────────────────────

function AdminProgressView({
  userId,
  entries,
  weightChart,
  bodyFatChart,
  muscleChart,
  loading,
  exercises,
  exercisesLoaded,
  onWorkoutTabActive,
}: {
  userId: string;
  entries: ProgressEntry[];
  weightChart: ChartPoint[];
  bodyFatChart: ChartPoint[];
  muscleChart: ChartPoint[];
  loading: boolean;
  exercises: ExerciseSummary[];
  exercisesLoaded: boolean;
  onWorkoutTabActive: () => void;
}) {
  const [innerTab, setInnerTab] = useState('body');

  useEffect(() => {
    if (innerTab === 'workout') onWorkoutTabActive();
  }, [innerTab, onWorkoutTabActive]);

  type NumericKey =
    | 'weightKg'
    | 'bodyFatPercent'
    | 'muscleMass'
    | 'chest'
    | 'waist'
    | 'hips'
    | 'bicepLeft'
    | 'bicepRight'
    | 'thighLeft'
    | 'thighRight';

  function latestOf(key: NumericKey): number | null {
    return entries.find((e) => e[key] != null)?.[key] ?? null;
  }
  function previousOf(key: NumericKey): number | null {
    const firstIdx = entries.findIndex((e) => e[key] != null);
    if (firstIdx < 0) return null;
    return entries.slice(firstIdx + 1).find((e) => e[key] != null)?.[key] ?? null;
  }

  const latest = entries[0];
  const oldest = entries[entries.length - 1];

  if (loading) {
    return (
      <div className="space-y-3 px-4 py-4">
        <div className="flex gap-2 overflow-hidden">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 w-32 shrink-0 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-2xl bg-muted" />
      </div>
    );
  }

  if (entries.length === 0 && weightChart.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 px-4 py-20 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <TrendingUp className="h-7 w-7 text-muted-foreground" />
        </div>
        <div>
          <p className="font-medium">No progress data yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Trainers log progress from the client&apos;s profile.
          </p>
        </div>
      </div>
    );
  }

  const metricTiles = [
    {
      key: 'weight',
      icon: <Scale className="h-3.5 w-3.5 text-blue-500" />,
      iconBg: 'bg-blue-500/10',
      label: 'Weight',
      metricKey: 'weightKg' as NumericKey,
      unit: 'kg',
      lowerIsBetter: true,
    },
    {
      key: 'bodyFat',
      icon: <Flame className="h-3.5 w-3.5 text-orange-500" />,
      iconBg: 'bg-orange-500/10',
      label: 'Body Fat',
      metricKey: 'bodyFatPercent' as NumericKey,
      unit: '%',
      lowerIsBetter: true,
    },
    {
      key: 'muscleMass',
      icon: <Dumbbell className="h-3.5 w-3.5 text-emerald-500" />,
      iconBg: 'bg-emerald-500/10',
      label: 'Muscle',
      metricKey: 'muscleMass' as NumericKey,
      unit: 'kg',
      lowerIsBetter: false,
    },
    {
      key: 'waist',
      icon: <Ruler className="h-3.5 w-3.5 text-violet-500" />,
      iconBg: 'bg-violet-500/10',
      label: 'Waist',
      metricKey: 'waist' as NumericKey,
      unit: 'cm',
      lowerIsBetter: true,
    },
    {
      key: 'chest',
      icon: <Heart className="h-3.5 w-3.5 text-pink-500" />,
      iconBg: 'bg-pink-500/10',
      label: 'Chest',
      metricKey: 'chest' as NumericKey,
      unit: 'cm',
      lowerIsBetter: false,
    },
    {
      key: 'hips',
      icon: <MoveHorizontal className="h-3.5 w-3.5 text-amber-500" />,
      iconBg: 'bg-amber-500/10',
      label: 'Hips',
      metricKey: 'hips' as NumericKey,
      unit: 'cm',
      lowerIsBetter: false,
    },
    {
      key: 'bicep',
      icon: <Zap className="h-3.5 w-3.5 text-cyan-500" />,
      iconBg: 'bg-cyan-500/10',
      label: 'Bicep',
      metricKey: 'bicepLeft' as NumericKey,
      unit: 'cm',
      lowerIsBetter: false,
      paired: 'bicepRight' as NumericKey,
    },
    {
      key: 'thigh',
      icon: <MoveVertical className="h-3.5 w-3.5 text-indigo-500" />,
      iconBg: 'bg-indigo-500/10',
      label: 'Thigh',
      metricKey: 'thighLeft' as NumericKey,
      unit: 'cm',
      lowerIsBetter: false,
      paired: 'thighRight' as NumericKey,
    },
  ];

  return (
    <div className="space-y-4 pb-10">
      {/* Metric chips — horizontal scroll */}
      <div className="-mx-0 overflow-x-auto px-4 pt-4" style={{ scrollbarWidth: 'none' }}>
        <div className="flex gap-2 pb-1">
          {metricTiles.map((tile) => {
            const val = latestOf(tile.metricKey);
            const paired = tile.paired ? latestOf(tile.paired) : null;
            const displayValue =
              val != null ? (tile.paired ? `${fmtVal(val)}/${fmtVal(paired)}` : fmtVal(val)) : '—';
            const delta = getDelta(val, previousOf(tile.metricKey));
            return (
              <div
                key={tile.key}
                className="w-[128px] shrink-0 rounded-2xl bg-card p-3 ring-1 ring-border/50"
              >
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-xl ${tile.iconBg}`}
                >
                  {tile.icon}
                </div>
                <p className="mt-2 text-[10px] text-muted-foreground">{tile.label}</p>
                <p
                  className={`mt-0.5 font-bold leading-none ${displayValue.includes('/') ? 'text-sm' : 'text-lg'}`}
                >
                  {displayValue}
                  {displayValue !== '—' && (
                    <span className="ml-0.5 text-[10px] font-normal text-muted-foreground">
                      {tile.unit}
                    </span>
                  )}
                </p>
                <div className="mt-1">
                  {val == null ? (
                    <span className="text-[9px] text-muted-foreground">No data</span>
                  ) : (
                    <DeltaChip diff={delta} unit={tile.unit} lowerIsBetter={tile.lowerIsBetter} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="px-4">
        <Tabs value={innerTab} onValueChange={setInnerTab}>
          <TabsList className="w-full">
            <TabsTrigger
              value="body"
              className="flex-1 text-xs focus-visible:ring-0 focus-visible:outline-none"
            >
              Body Metrics
            </TabsTrigger>
            <TabsTrigger
              value="workout"
              className="flex-1 text-xs focus-visible:ring-0 focus-visible:outline-none"
            >
              <Dumbbell className="mr-1 h-3 w-3" />
              Workouts
            </TabsTrigger>
            <TabsTrigger
              value="history"
              className="flex-1 text-xs focus-visible:ring-0 focus-visible:outline-none"
            >
              History
            </TabsTrigger>
          </TabsList>

          {/* Body Metrics */}
          <TabsContent value="body" className="mt-4 space-y-3">
            {weightChart.length > 0 && (
              <div className="rounded-2xl bg-card p-4 ring-1 ring-border/50">
                <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  WEIGHT
                </p>
                <ProgressLineChart
                  data={weightChart}
                  unit="kg"
                  color="hsl(217 91% 60%)"
                  height={160}
                  gradientId="admin-grad-w"
                />
              </div>
            )}
            {bodyFatChart.length > 0 && (
              <div className="rounded-2xl bg-card p-4 ring-1 ring-border/50">
                <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  BODY FAT %
                </p>
                <ProgressLineChart
                  data={bodyFatChart}
                  unit="%"
                  color="hsl(22 100% 55%)"
                  height={160}
                  gradientId="admin-grad-bf"
                />
              </div>
            )}
            {muscleChart.length > 0 && (
              <div className="rounded-2xl bg-card p-4 ring-1 ring-border/50">
                <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  MUSCLE MASS
                </p>
                <ProgressLineChart
                  data={muscleChart}
                  unit="kg"
                  color="hsl(142 71% 45%)"
                  height={160}
                  gradientId="admin-grad-mm"
                />
              </div>
            )}

            {/* Circumference measurements */}
            {entries.length >= 2 && (
              <div className="space-y-2 pt-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Circumference Measurements
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {(['chest', 'waist', 'hips'] as const).map((field) => {
                    const cur = latest?.[field];
                    const old = oldest?.[field];
                    if (cur == null) return null;
                    return (
                      <div key={field} className="rounded-2xl bg-card p-3 ring-1 ring-border/50">
                        <p className="text-xs text-muted-foreground capitalize">{field}</p>
                        <p className="mt-1 text-base font-bold">
                          {fmtVal(cur)}
                          <span className="ml-0.5 text-xs font-normal text-muted-foreground">
                            {' '}
                            cm
                          </span>
                        </p>
                        <DeltaChip diff={getDelta(cur, old)} unit="cm" lowerIsBetter />
                      </div>
                    );
                  })}
                  {latest?.bicepLeft != null && (
                    <div className="rounded-2xl bg-card p-3 ring-1 ring-border/50">
                      <p className="text-xs text-muted-foreground">Bicep L/R</p>
                      <p className="mt-1 text-base font-bold">
                        {fmtVal(latest.bicepLeft)}/{fmtVal(latest.bicepRight)}
                        <span className="ml-0.5 text-xs font-normal text-muted-foreground">
                          {' '}
                          cm
                        </span>
                      </p>
                    </div>
                  )}
                  {latest?.thighLeft != null && (
                    <div className="rounded-2xl bg-card p-3 ring-1 ring-border/50">
                      <p className="text-xs text-muted-foreground">Thigh L/R</p>
                      <p className="mt-1 text-base font-bold">
                        {fmtVal(latest.thighLeft)}/{fmtVal(latest.thighRight)}
                        <span className="ml-0.5 text-xs font-normal text-muted-foreground">
                          {' '}
                          cm
                        </span>
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {weightChart.length === 0 && bodyFatChart.length === 0 && (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border/50 py-12 text-center">
                <TrendingUp className="h-7 w-7 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No body metric data recorded yet</p>
              </div>
            )}
          </TabsContent>

          {/* Workout Progression */}
          <TabsContent value="workout" className="mt-4">
            {!exercisesLoaded ? (
              <div className="space-y-3">
                <div className="h-11 w-3/4 animate-pulse rounded-xl bg-muted" />
                <div className="h-56 animate-pulse rounded-2xl bg-muted" />
              </div>
            ) : (
              <WorkoutProgressionPanel
                exercises={exercises}
                chartEndpoint={`/api/admin/users/${userId}/progress/charts`}
              />
            )}
          </TabsContent>

          {/* History */}
          <TabsContent value="history" className="mt-4 space-y-2">
            {entries.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border/50 py-12 text-center">
                <TrendingUp className="h-7 w-7 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No progress entries yet</p>
              </div>
            ) : (
              entries.map((entry) => {
                const date = new Date(entry.recordedAt);
                const day = date.getDate();
                const month = date.toLocaleDateString('en-IN', { month: 'short' });
                const year = date.getFullYear();
                const metrics: { label: string; value: string }[] = [];
                if (entry.weightKg != null)
                  metrics.push({ label: 'Weight', value: `${fmtVal(entry.weightKg)} kg` });
                if (entry.bodyFatPercent != null)
                  metrics.push({ label: 'Body Fat', value: `${fmtVal(entry.bodyFatPercent)}%` });
                if (entry.muscleMass != null)
                  metrics.push({ label: 'Muscle', value: `${fmtVal(entry.muscleMass)} kg` });
                if (entry.chest != null)
                  metrics.push({ label: 'Chest', value: `${fmtVal(entry.chest)} cm` });
                if (entry.waist != null)
                  metrics.push({ label: 'Waist', value: `${fmtVal(entry.waist)} cm` });
                if (entry.hips != null)
                  metrics.push({ label: 'Hips', value: `${fmtVal(entry.hips)} cm` });
                if (entry.bicepLeft != null)
                  metrics.push({
                    label: 'Bicep L/R',
                    value: `${fmtVal(entry.bicepLeft)}/${fmtVal(entry.bicepRight)} cm`,
                  });
                if (entry.thighLeft != null)
                  metrics.push({
                    label: 'Thigh L/R',
                    value: `${fmtVal(entry.thighLeft)}/${fmtVal(entry.thighRight)} cm`,
                  });
                return (
                  <div key={entry.id} className="rounded-2xl bg-card p-4 ring-1 ring-border/50">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-primary/10">
                        <span className="text-base font-bold leading-none text-primary">{day}</span>
                        <span className="text-[9px] font-medium uppercase text-primary/70">
                          {month}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">
                          {month} {day}, {year}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {metrics.length} measurements
                        </p>
                      </div>
                    </div>
                    {metrics.length > 0 && (
                      <div className="mt-3 grid grid-cols-3 gap-x-4 gap-y-2 border-t border-border/50 pt-3">
                        {metrics.map((m) => (
                          <div key={m.label}>
                            <p className="text-[10px] text-muted-foreground">{m.label}</p>
                            <p className="text-sm font-semibold">{m.value}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    {entry.notes && (
                      <p className="mt-2 text-xs italic text-muted-foreground">{entry.notes}</p>
                    )}
                  </div>
                );
              })
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
