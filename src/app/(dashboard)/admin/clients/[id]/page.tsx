'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Save, Trash2, X } from 'lucide-react';
import { useConfirm } from '@/hooks/use-confirm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';

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

export default function ClientProfilePage() {
  const { confirm, ConfirmDialog } = useConfirm();
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [client, setClient] = useState<ClientData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // PT Packages state
  const [packages, setPackages] = useState<PtPackage[]>([]);
  const [packagesLoading, setPackagesLoading] = useState(true);
  const [trainers, setTrainers] = useState<TrainerOption[]>([]);
  const [showAddMapping, setShowAddMapping] = useState(false);
  const [mappingForm, setMappingForm] = useState({
    trainerProfileId: '',
    sessionsPerMonth: '12',
    sessionCharge: '',
    startDate: new Date().toISOString().split('T')[0],
  });
  const [mappingSaving, setMappingSaving] = useState(false);
  const [mappingError, setMappingError] = useState('');

  // Form state
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    phone: '',
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
      // silently fail — packages section will show empty
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
      // silently fail
    }
  }, []);

  useEffect(() => {
    fetchClient();
    fetchTrainers();
  }, [fetchClient, fetchTrainers]);

  useEffect(() => {
    if (client?.clientProfile?.id) {
      fetchPackages(client.clientProfile.id);
    }
  }, [client?.clientProfile?.id, fetchPackages]);

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
        const data = await res.json();
        setError(data.error ?? 'Failed to save');
      } else {
        await fetchClient();
      }
    } catch {
      setError('Failed to save changes');
    } finally {
      setSaving(false);
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
      if (res.ok) {
        router.push('/admin/clients');
      }
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
        const data = await res.json();
        setMappingError(data.error ?? 'Failed to create mapping');
      } else {
        setShowAddMapping(false);
        setMappingForm({
          trainerProfileId: '',
          sessionsPerMonth: '12',
          sessionCharge: '',
          startDate: new Date().toISOString().split('T')[0],
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
    if (!ok) return;
    if (!client?.clientProfile?.id) return;
    try {
      const res = await fetch(`/api/admin/mappings/${pkgId}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchPackages(client.clientProfile.id);
      }
    } catch {
      // silently fail
    }
  }

  function updateForm(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!client) {
    return <p className="text-muted-foreground">{error || 'Client not found'}</p>;
  }

  const activePackages = packages.filter((p) => p.isActive);
  const inactivePackages = packages.filter((p) => !p.isActive);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push('/admin/clients')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">
              {client.firstName} {client.lastName}
            </h1>
            <p className="text-sm text-muted-foreground">{client.email}</p>
          </div>
          <Badge variant={client.isActive ? 'default' : 'secondary'}>
            {client.isActive ? 'Active' : 'Inactive'}
          </Badge>
        </div>
        <div className="flex gap-2">
          <Button variant="destructive" size="sm" onClick={handleDelete}>
            <Trash2 className="mr-1 h-4 w-4" />
            <span className="hidden sm:inline">Deactivate</span>
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            <Save className="mr-1 h-4 w-4" />
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid gap-6 md:grid-cols-2">
        {/* Personal Info */}
        <Card>
          <CardHeader>
            <CardTitle>Personal Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name</Label>
                <Input
                  id="firstName"
                  value={form.firstName}
                  onChange={(e) => updateForm('firstName', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  value={form.lastName}
                  onChange={(e) => updateForm('lastName', e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={form.phone}
                onChange={(e) => updateForm('phone', e.target.value)}
              />
            </div>
            <Separator />
            <div className="space-y-2">
              <Label htmlFor="emergencyName">Emergency Contact</Label>
              <Input
                id="emergencyName"
                placeholder="Name"
                value={form.emergencyContactName}
                onChange={(e) => updateForm('emergencyContactName', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="emergencyPhone">Emergency Phone</Label>
              <Input
                id="emergencyPhone"
                value={form.emergencyContactPhone}
                onChange={(e) => updateForm('emergencyContactPhone', e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Health Metrics */}
        <Card>
          <CardHeader>
            <CardTitle>Health Metrics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="height">Height (cm)</Label>
                <Input
                  id="height"
                  type="number"
                  value={form.height}
                  onChange={(e) => updateForm('height', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="weight">Weight (kg)</Label>
                <Input
                  id="weight"
                  type="number"
                  value={form.currentWeight}
                  onChange={(e) => updateForm('currentWeight', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bodyFat">Body Fat %</Label>
                <Input
                  id="bodyFat"
                  type="number"
                  value={form.bodyFatPercentage}
                  onChange={(e) => updateForm('bodyFatPercentage', e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="medical">Medical Conditions</Label>
              <Textarea
                id="medical"
                value={form.medicalConditions}
                onChange={(e) => updateForm('medicalConditions', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="goals">Fitness Goals</Label>
              <Textarea
                id="goals"
                value={form.fitnessGoals}
                onChange={(e) => updateForm('fitnessGoals', e.target.value)}
              />
            </div>
            <Separator />
            <div className="space-y-2">
              <Label htmlFor="sessionDuration">Session Duration Override (min)</Label>
              <Input
                id="sessionDuration"
                type="number"
                placeholder="Use branch default"
                value={form.sessionDurationOverrideMin}
                onChange={(e) => updateForm('sessionDurationOverrideMin', e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Leave blank to use branch default</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Trainer Mapping / PT Packages */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Trainer Mappings</CardTitle>
          <Button
            size="sm"
            onClick={() => setShowAddMapping(!showAddMapping)}
            disabled={!client.clientProfile}
          >
            {showAddMapping ? <X className="mr-1 h-4 w-4" /> : <Plus className="mr-1 h-4 w-4" />}
            {showAddMapping ? 'Cancel' : 'Assign Trainer'}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add Mapping Form */}
          {showAddMapping && (
            <div className="rounded-lg border p-4 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="trainerSelect">Trainer</Label>
                  <select
                    id="trainerSelect"
                    className="flex h-10 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm"
                    value={mappingForm.trainerProfileId}
                    onChange={(e) =>
                      setMappingForm((prev) => ({ ...prev, trainerProfileId: e.target.value }))
                    }
                  >
                    <option value="">Select a trainer</option>
                    {trainers
                      .filter((t) => t.trainerProfile)
                      .map((t) => (
                        <option key={t.trainerProfile!.id} value={t.trainerProfile!.id}>
                          {t.firstName} {t.lastName}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sessionsPerMonth">Sessions / Month</Label>
                  <Input
                    id="sessionsPerMonth"
                    type="number"
                    min="1"
                    value={mappingForm.sessionsPerMonth}
                    onChange={(e) =>
                      setMappingForm((prev) => ({ ...prev, sessionsPerMonth: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sessionCharge">Session Charge</Label>
                  <Input
                    id="sessionCharge"
                    type="number"
                    min="0"
                    placeholder="Optional"
                    value={mappingForm.sessionCharge}
                    onChange={(e) =>
                      setMappingForm((prev) => ({ ...prev, sessionCharge: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="startDate">Start Date</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={mappingForm.startDate}
                    onChange={(e) =>
                      setMappingForm((prev) => ({ ...prev, startDate: e.target.value }))
                    }
                  />
                </div>
              </div>
              {mappingError && <p className="text-sm text-destructive">{mappingError}</p>}
              <Button
                size="sm"
                onClick={handleAddMapping}
                disabled={mappingSaving || !mappingForm.trainerProfileId}
              >
                {mappingSaving ? 'Creating...' : 'Create Mapping'}
              </Button>
            </div>
          )}

          {/* Active Packages */}
          {packagesLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : activePackages.length === 0 && inactivePackages.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No trainer mappings yet. Click &quot;Assign Trainer&quot; to create one.
            </p>
          ) : (
            <div className="space-y-3">
              {activePackages.map((pkg) => (
                <div
                  key={pkg.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {pkg.trainer.user.firstName} {pkg.trainer.user.lastName}
                      </span>
                      <Badge
                        variant="secondary"
                        className="bg-emerald-500/15 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400"
                      >
                        Active
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      <span>{pkg.sessionsPerMonth} sessions/month</span>
                      {pkg.sessionChargeAmount != null && (
                        <span>&#8377;{pkg.sessionChargeAmount}/session</span>
                      )}
                      <span>Since {new Date(pkg.startDate).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => handleDeactivateMapping(pkg.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}

              {/* Inactive Packages */}
              {inactivePackages.length > 0 && (
                <>
                  <Separator />
                  <p className="text-xs font-medium text-muted-foreground">Past Mappings</p>
                  {inactivePackages.map((pkg) => (
                    <div
                      key={pkg.id}
                      className="flex items-center justify-between rounded-lg border border-dashed p-3 opacity-60"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {pkg.trainer.user.firstName} {pkg.trainer.user.lastName}
                          </span>
                          <Badge variant="secondary">Inactive</Badge>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                          <span>{pkg.sessionsPerMonth} sessions/month</span>
                          <span>
                            {new Date(pkg.startDate).toLocaleDateString()}
                            {pkg.endDate && ` — ${new Date(pkg.endDate).toLocaleDateString()}`}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {ConfirmDialog}
    </div>
  );
}
