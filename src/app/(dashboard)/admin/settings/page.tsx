'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bell, Check, Clock, Loader2, RefreshCw, Shield, Users, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';

interface BranchSettings {
  defaultSessionDurationMin: number;
  carryForwardLimit: number;
  cancellationPolicyEnabled: boolean;
  cancellationWindowMin: number;
  reminderTimingMin: number;
  noShowThresholdMin: number;
  kickboxingClassSizeLimit: number;
}

function SettingField({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">{label}</label>
      {children}
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function SectionCard({
  icon: Icon,
  iconColor,
  title,
  description,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-card ring-1 ring-border/50">
      <div className="flex items-center gap-3 border-b border-border/50 px-5 py-4">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${iconColor}`}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<BranchSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/settings');
      if (res.ok) {
        const { data } = await res.json();
        setSettings(data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  async function handleSave() {
    if (!settings) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        const { data } = await res.json();
        setSettings(data);
        toast.success('Settings saved successfully');
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to save settings');
      }
    } finally {
      setSaving(false);
    }
  }

  function updateField<K extends keyof BranchSettings>(key: K, value: BranchSettings[K]) {
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 pb-8">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-9 w-32 rounded-lg" />
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-40 w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="mx-auto max-w-3xl pb-8">
        <div className="flex flex-col items-center justify-center rounded-2xl bg-card py-16 ring-1 ring-border/50">
          <XCircle className="mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">Failed to load settings</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4 gap-1.5"
            onClick={() => {
              setLoading(true);
              fetchSettings();
            }}
          >
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure branch-wide rules and policies
          </p>
        </div>
        <Button
          onClick={handleSave}
          disabled={saving}
          size="sm"
          className="gap-1.5 bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700"
        >
          {saving ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Check className="h-3.5 w-3.5" />
              Save Changes
            </>
          )}
        </Button>
      </div>

      {/* Session Settings */}
      <SectionCard
        icon={Clock}
        iconColor="bg-blue-500/10 text-blue-500"
        title="Session Defaults"
        description="Default duration and attendance thresholds"
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <SettingField
            label="Default Duration"
            description="Used when no client-specific override is set"
          >
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={15}
                max={180}
                value={settings.defaultSessionDurationMin}
                onChange={(e) => updateField('defaultSessionDurationMin', Number(e.target.value))}
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">minutes</span>
            </div>
          </SettingField>
          <SettingField
            label="No-Show Threshold"
            description="Auto-suggest no-show after this delay"
          >
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={5}
                max={60}
                value={settings.noShowThresholdMin}
                onChange={(e) => updateField('noShowThresholdMin', Number(e.target.value))}
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">min late</span>
            </div>
          </SettingField>
        </div>
      </SectionCard>

      {/* Carry-Forward */}
      <SectionCard
        icon={RefreshCw}
        iconColor="bg-violet-500/10 text-violet-500"
        title="Carry-Forward"
        description="How unused sessions roll over monthly"
      >
        <SettingField
          label="Max Carry-Forward"
          description="Set to 0 to disable carry-forward entirely"
        >
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={0}
              max={20}
              value={settings.carryForwardLimit}
              onChange={(e) => updateField('carryForwardLimit', Number(e.target.value))}
              className="w-24"
            />
            <span className="text-sm text-muted-foreground">sessions</span>
          </div>
        </SettingField>
      </SectionCard>

      {/* Cancellation Policy */}
      <SectionCard
        icon={Shield}
        iconColor="bg-amber-500/10 text-amber-500"
        title="Cancellation Policy"
        description="Late cancellation rules and windows"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-xl bg-muted/40 px-4 py-3">
            <div>
              <p className="text-sm font-medium">Enable Cancellation Policy</p>
              <p className="text-xs text-muted-foreground">
                Late cancellations count as used sessions
              </p>
            </div>
            <Switch
              checked={settings.cancellationPolicyEnabled}
              onCheckedChange={(checked) => updateField('cancellationPolicyEnabled', checked)}
            />
          </div>
          {settings.cancellationPolicyEnabled && (
            <SettingField
              label="Cancellation Window"
              description="Cancellations within this window count as used"
            >
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={30}
                  max={1440}
                  value={settings.cancellationWindowMin}
                  onChange={(e) => updateField('cancellationWindowMin', Number(e.target.value))}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">min before session</span>
              </div>
            </SettingField>
          )}
        </div>
      </SectionCard>

      {/* Notifications */}
      <SectionCard
        icon={Bell}
        iconColor="bg-emerald-500/10 text-emerald-500"
        title="Notifications"
        description="Session reminder timing"
      >
        <SettingField
          label="Reminder Timing"
          description="How far in advance to send session reminders"
        >
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={15}
              max={1440}
              value={settings.reminderTimingMin}
              onChange={(e) => updateField('reminderTimingMin', Number(e.target.value))}
              className="w-24"
            />
            <span className="text-sm text-muted-foreground">min before session</span>
          </div>
        </SettingField>
      </SectionCard>

      {/* Kickboxing */}
      <SectionCard
        icon={Users}
        iconColor="bg-rose-500/10 text-rose-500"
        title="Kickboxing Classes"
        description="Default limits for group classes"
      >
        <SettingField
          label="Default Class Size"
          description="Maximum enrollments per kickboxing class"
        >
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              max={100}
              value={settings.kickboxingClassSizeLimit}
              onChange={(e) => updateField('kickboxingClassSizeLimit', Number(e.target.value))}
              className="w-24"
            />
            <span className="text-sm text-muted-foreground">members</span>
          </div>
        </SettingField>
      </SectionCard>
    </div>
  );
}
