'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Package, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useConfirm } from '@/hooks/use-confirm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface PackagePlan {
  id: string;
  name: string;
  sessionsPerMonth: number;
  pricePerCycle: number;
  sessionChargeAmount: number | null;
  durationDays: number;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count: { packages: number };
}

interface FormState {
  name: string;
  sessionsPerMonth: string;
  pricePerCycle: string;
  sessionChargeAmount: string;
  durationDays: string;
  description: string;
}

const EMPTY_FORM: FormState = {
  name: '',
  sessionsPerMonth: '12',
  pricePerCycle: '',
  sessionChargeAmount: '',
  durationDays: '30',
  description: '',
};

const DURATION_PRESETS = [
  { label: 'Monthly', days: 30 },
  { label: '60 days', days: 60 },
  { label: 'Quarterly', days: 90 },
  { label: '6 months', days: 180 },
  { label: 'Annual', days: 365 },
];

export default function PackagePlansPage() {
  const { confirm, ConfirmDialog } = useConfirm();

  const [plans, setPlans] = useState<PackagePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeOnly, setActiveOnly] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PackagePlan | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const fetchPlans = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (activeOnly) params.set('activeOnly', 'true');
      params.set('pageSize', '100');
      const res = await fetch(`/api/admin/package-plans?${params.toString()}`);
      if (res.ok) {
        const { data } = await res.json();
        setPlans(data);
      } else {
        toast.error('Failed to load plans');
      }
    } finally {
      setLoading(false);
    }
  }, [activeOnly]);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setDialogOpen(true);
  }

  function openEdit(plan: PackagePlan) {
    setEditing(plan);
    setForm({
      name: plan.name,
      sessionsPerMonth: plan.sessionsPerMonth.toString(),
      pricePerCycle: plan.pricePerCycle.toString(),
      sessionChargeAmount: plan.sessionChargeAmount?.toString() ?? '',
      durationDays: plan.durationDays.toString(),
      description: plan.description ?? '',
    });
    setFormError('');
    setDialogOpen(true);
  }

  async function handleSubmit() {
    setSaving(true);
    setFormError('');
    try {
      const payload = {
        name: form.name.trim(),
        sessionsPerMonth: parseInt(form.sessionsPerMonth, 10),
        pricePerCycle: parseFloat(form.pricePerCycle),
        sessionChargeAmount: form.sessionChargeAmount
          ? parseFloat(form.sessionChargeAmount)
          : undefined,
        durationDays: parseInt(form.durationDays, 10),
        description: form.description.trim() || undefined,
      };
      const url = editing ? `/api/admin/package-plans/${editing.id}` : '/api/admin/package-plans';
      const method = editing ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const { error } = await res.json();
        setFormError(error || 'Failed to save plan');
        return;
      }
      toast.success(editing ? 'Plan updated' : 'Plan created');
      setDialogOpen(false);
      await fetchPlans();
    } catch {
      setFormError('Failed to save plan');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(plan: PackagePlan) {
    const ok = await confirm({
      title: 'Deactivate plan',
      description:
        plan._count.packages > 0
          ? `This plan has ${plan._count.packages} active assignment${plan._count.packages === 1 ? '' : 's'}. Existing assignments will keep their plan reference; the plan will only be hidden from the dropdown for new assignments.`
          : 'This plan will be hidden from the dropdown for new assignments. You can reactivate it later by editing.',
      confirmText: 'Deactivate',
      variant: 'destructive',
    });
    if (!ok) return;

    const force = plan._count.packages > 0;
    const url = `/api/admin/package-plans/${plan.id}${force ? '?force=true' : ''}`;
    const res = await fetch(url, { method: 'DELETE' });
    if (res.ok) {
      toast.success('Plan deactivated');
      await fetchPlans();
    } else {
      const { error } = await res.json();
      toast.error(error || 'Failed to deactivate plan');
    }
  }

  async function handleReactivate(plan: PackagePlan) {
    const res = await fetch(`/api/admin/package-plans/${plan.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: true }),
    });
    if (res.ok) {
      toast.success('Plan reactivated');
      await fetchPlans();
    } else {
      const { error } = await res.json();
      toast.error(error || 'Failed to reactivate plan');
    }
  }

  const isFormValid =
    form.name.trim().length > 0 &&
    parseInt(form.sessionsPerMonth, 10) > 0 &&
    parseFloat(form.pricePerCycle) >= 0 &&
    parseInt(form.durationDays, 10) > 0 &&
    parseInt(form.durationDays, 10) <= 365;

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Package Plans</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pre-defined PT packages that admins pick from when assigning a trainer to a client.
          </p>
        </div>
        <Button
          onClick={openCreate}
          size="sm"
          className="gap-1.5 bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700"
        >
          <Plus className="h-3.5 w-3.5" />
          Create Plan
        </Button>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2 rounded-xl bg-muted/40 px-4 py-2.5">
        <Switch checked={activeOnly} onCheckedChange={setActiveOnly} id="active-only" />
        <Label htmlFor="active-only" className="cursor-pointer text-sm">
          Show active plans only
        </Label>
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-2xl" />
          ))}
        </div>
      ) : plans.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl bg-card py-16 ring-1 ring-border/50">
          <Package className="mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm font-medium">No package plans yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Create one to start picking from a dropdown when assigning trainers.
          </p>
          <Button onClick={openCreate} size="sm" variant="outline" className="mt-4 gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Create your first plan
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={cn(
                'flex flex-col gap-3 rounded-2xl bg-card p-4 ring-1 ring-border/50 sm:flex-row sm:items-center sm:gap-4',
                !plan.isActive && 'opacity-60',
              )}
            >
              {/* Icon */}
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500">
                <Package className="h-5 w-5" />
              </div>

              {/* Main */}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{plan.name}</p>
                  <Badge
                    variant="secondary"
                    className={cn(
                      'shrink-0',
                      plan.isActive
                        ? 'bg-emerald-500/15 text-emerald-600'
                        : 'bg-zinc-500/15 text-zinc-500',
                    )}
                  >
                    {plan.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {plan.sessionsPerMonth} sessions over {plan.durationDays} day
                  {plan.durationDays === 1 ? '' : 's'}
                  {' · '}₹{plan.pricePerCycle.toLocaleString()}/cycle
                  {plan.sessionChargeAmount != null && <> · ₹{plan.sessionChargeAmount}/session</>}
                  {' · '}
                  {plan._count.packages} active assignment{plan._count.packages === 1 ? '' : 's'}
                </p>
                {plan.description && (
                  <p className="mt-1 text-xs text-muted-foreground/80">{plan.description}</p>
                )}
              </div>

              {/* Actions */}
              <div className="flex shrink-0 items-center gap-1.5">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => openEdit(plan)}
                  className="h-8 gap-1"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Edit</span>
                </Button>
                {plan.isActive ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDeactivate(plan)}
                    className="h-8 gap-1 text-red-500 hover:bg-red-500/10 hover:text-red-500"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Deactivate</span>
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleReactivate(plan)}
                    className="h-8 text-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-500"
                  >
                    Reactivate
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Plan' : 'Create Plan'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="name">Plan name</Label>
              <Input
                id="name"
                placeholder="e.g. Standard 12"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                maxLength={100}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="sessionsPerMonth">Sessions / cycle</Label>
                <Input
                  id="sessionsPerMonth"
                  type="number"
                  min="1"
                  value={form.sessionsPerMonth}
                  onChange={(e) => setForm((p) => ({ ...p, sessionsPerMonth: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pricePerCycle">Price per cycle (₹)</Label>
                <Input
                  id="pricePerCycle"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.pricePerCycle}
                  onChange={(e) => setForm((p) => ({ ...p, pricePerCycle: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="durationDays">Cycle duration (days)</Label>
              <Input
                id="durationDays"
                type="number"
                min="1"
                max="365"
                value={form.durationDays}
                onChange={(e) => setForm((p) => ({ ...p, durationDays: e.target.value }))}
              />
              <div className="flex flex-wrap gap-1.5">
                {DURATION_PRESETS.map((preset) => (
                  <button
                    key={preset.days}
                    type="button"
                    onClick={() => setForm((p) => ({ ...p, durationDays: preset.days.toString() }))}
                    className={cn(
                      'rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-colors',
                      parseInt(form.durationDays, 10) === preset.days
                        ? 'bg-blue-500/20 text-blue-500 ring-1 ring-blue-500/40'
                        : 'bg-muted/60 text-muted-foreground hover:bg-muted',
                    )}
                  >
                    {preset.label} · {preset.days}d
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                When a trainer is assigned this plan, the mapping&apos;s end date will auto-fill as
                start date + {form.durationDays || '?'} day
                {parseInt(form.durationDays, 10) === 1 ? '' : 's'}.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sessionChargeAmount">
                Per-session price <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="sessionChargeAmount"
                type="number"
                min="0"
                step="0.01"
                placeholder="—"
                value={form.sessionChargeAmount}
                onChange={(e) => setForm((p) => ({ ...p, sessionChargeAmount: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                Some gyms quote per-session pricing — leave blank if not applicable.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="description">
                Description <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Textarea
                id="description"
                rows={2}
                maxLength={500}
                placeholder="Internal notes about this plan…"
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                className="resize-none"
              />
            </div>

            {formError && (
              <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {formError}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!isFormValid || saving}
              className="gap-1.5 bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {editing ? 'Save Changes' : 'Create Plan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {ConfirmDialog}
    </div>
  );
}
