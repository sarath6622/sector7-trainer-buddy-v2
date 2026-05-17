'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function NewClientPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
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

  function updateForm(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
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
          roles: ['CLIENT'],
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
        const data = await res.json();
        setError(data.error ?? 'Failed to create client');
        return;
      }

      const { data } = await res.json();
      router.push(`/admin/clients/${data.id}`);
    } catch {
      setError('Failed to create client');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-8">
      {/* Header */}
      <div className="space-y-2">
        <Breadcrumb items={[{ label: 'Clients', href: '/admin/clients' }, { label: 'New' }]} />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Add Client</h1>
          <p className="mt-1 text-sm text-muted-foreground">Create a new client account</p>
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
            <div className="space-y-1.5">
              <Label htmlFor="gender">Gender</Label>
              <Select
                value={form.gender || 'unset'}
                onValueChange={(v) => updateForm('gender', v === 'unset' ? '' : (v ?? ''))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Not set" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unset">Not set</SelectItem>
                  <SelectItem value="MALE">Male</SelectItem>
                  <SelectItem value="FEMALE">Female</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      {/* Emergency Contact */}
      <div className="rounded-2xl bg-card ring-1 ring-border/50">
        <div className="flex items-center gap-3 border-b border-border/50 px-5 py-4">
          <h2 className="text-sm font-semibold">Emergency Contact</h2>
        </div>
        <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="emergencyName">Contact Name</Label>
            <Input
              id="emergencyName"
              value={form.emergencyContactName}
              onChange={(e) => updateForm('emergencyContactName', e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="emergencyPhone">Contact Phone</Label>
            <Input
              id="emergencyPhone"
              value={form.emergencyContactPhone}
              onChange={(e) => updateForm('emergencyContactPhone', e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Health & Fitness */}
      <div className="rounded-2xl bg-card ring-1 ring-border/50">
        <div className="flex items-center gap-3 border-b border-border/50 px-5 py-4">
          <h2 className="text-sm font-semibold">Health & Fitness</h2>
        </div>
        <div className="space-y-4 px-5 py-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="height">Height (cm)</Label>
              <Input
                id="height"
                type="number"
                value={form.height}
                onChange={(e) => updateForm('height', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="weight">Weight (kg)</Label>
              <Input
                id="weight"
                type="number"
                value={form.currentWeight}
                onChange={(e) => updateForm('currentWeight', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bodyFat">Body Fat %</Label>
              <Input
                id="bodyFat"
                type="number"
                value={form.bodyFatPercentage}
                onChange={(e) => updateForm('bodyFatPercentage', e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="medical">Medical Conditions</Label>
            <Textarea
              id="medical"
              value={form.medicalConditions}
              onChange={(e) => updateForm('medicalConditions', e.target.value)}
              placeholder="Any relevant medical conditions..."
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="goals">Fitness Goals</Label>
            <Textarea
              id="goals"
              value={form.fitnessGoals}
              onChange={(e) => updateForm('fitnessGoals', e.target.value)}
              placeholder="Weight loss, muscle building, etc..."
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sessionDuration">Session Duration Override (min)</Label>
            <Input
              id="sessionDuration"
              type="number"
              value={form.sessionDurationOverrideMin}
              onChange={(e) => updateForm('sessionDurationOverrideMin', e.target.value)}
              placeholder="Leave blank to use branch default"
              className="w-48"
            />
            <p className="text-xs text-muted-foreground">
              Leave blank to use the branch default duration
            </p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => router.push('/admin/clients')}>
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
              Create Client
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
