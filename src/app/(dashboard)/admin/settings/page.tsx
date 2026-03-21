'use client';

import { useCallback, useEffect, useState } from 'react';
import { Settings, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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

export default function SettingsPage() {
  const [settings, setSettings] = useState<BranchSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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
    setSaved(false);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        const { data } = await res.json();
        setSettings(data);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
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
      <div className="space-y-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  if (!settings) {
    return <div className="py-12 text-center text-muted-foreground">Failed to load settings.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Branch Settings</h1>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          <Save className="mr-2 h-4 w-4" />
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Changes'}
        </Button>
      </div>

      {/* Session Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Session Settings</CardTitle>
          <CardDescription>Configure default session duration and attendance rules</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Default Session Duration (minutes)</Label>
              <Input
                type="number"
                min={15}
                max={180}
                value={settings.defaultSessionDurationMin}
                onChange={(e) => updateField('defaultSessionDurationMin', Number(e.target.value))}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Used when no client-specific override is set
              </p>
            </div>
            <div>
              <Label>No-Show Threshold (minutes late)</Label>
              <Input
                type="number"
                min={5}
                max={60}
                value={settings.noShowThresholdMin}
                onChange={(e) => updateField('noShowThresholdMin', Number(e.target.value))}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Minutes after session start to auto-suggest no-show
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Carry-Forward Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Carry-Forward</CardTitle>
          <CardDescription>Control how unused sessions roll over to the next month</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-w-xs">
            <Label>Max Carry-Forward Sessions</Label>
            <Input
              type="number"
              min={0}
              max={20}
              value={settings.carryForwardLimit}
              onChange={(e) => updateField('carryForwardLimit', Number(e.target.value))}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Set to 0 to disable carry-forward entirely
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Cancellation Policy */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Cancellation Policy</CardTitle>
          <CardDescription>
            Toggle cancellation rules and configure the cancellation window
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Switch
              checked={settings.cancellationPolicyEnabled}
              onCheckedChange={(checked) => updateField('cancellationPolicyEnabled', checked)}
            />
            <div>
              <Label>Enable Cancellation Policy</Label>
              <p className="text-xs text-muted-foreground">
                When enabled, late cancellations count as used sessions
              </p>
            </div>
          </div>
          {settings.cancellationPolicyEnabled && (
            <div className="max-w-xs">
              <Label>Cancellation Window (minutes before session)</Label>
              <Input
                type="number"
                min={30}
                max={1440}
                value={settings.cancellationWindowMin}
                onChange={(e) => updateField('cancellationWindowMin', Number(e.target.value))}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Cancellations within this window count as used
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notification Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Notifications</CardTitle>
          <CardDescription>Configure notification timing</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-w-xs">
            <Label>Reminder Timing (minutes before session)</Label>
            <Input
              type="number"
              min={15}
              max={1440}
              value={settings.reminderTimingMin}
              onChange={(e) => updateField('reminderTimingMin', Number(e.target.value))}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              How far in advance to send session reminders
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Kickboxing Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Kickboxing</CardTitle>
          <CardDescription>Default limits for kickboxing classes</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-w-xs">
            <Label>Default Class Size Limit</Label>
            <Input
              type="number"
              min={1}
              max={100}
              value={settings.kickboxingClassSizeLimit}
              onChange={(e) => updateField('kickboxingClassSizeLimit', Number(e.target.value))}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Maximum enrollments per kickboxing class
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
