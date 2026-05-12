'use client';

import { useCallback, useEffect, useState } from 'react';
import { Monitor, Settings as SettingsIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';

export default function ClientSettingsPage() {
  const [showOnTv, setShowOnTv] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/client/profile/tv-opt-in', { cache: 'no-store' });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const json = (await res.json()) as { data: { showOnTv: boolean } };
      setShowOnTv(json.data.showOnTv);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load settings');
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleToggle(next: boolean) {
    if (saving) return;
    setSaving(true);
    const prev = showOnTv;
    setShowOnTv(next); // optimistic
    try {
      const res = await fetch('/api/client/profile/tv-opt-in', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ showOnTv: next }),
      });
      if (!res.ok) {
        const json = await res.json();
        toast.error(json.error ?? 'Failed to update');
        setShowOnTv(prev);
        return;
      }
      toast.success(next ? "You'll appear on the gym TV" : "You're hidden from the gym TV");
    } catch (err) {
      console.error(err);
      toast.error('Network error');
      setShowOnTv(prev);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <SettingsIcon className="size-6 text-orange-500" />
          Settings
        </h1>
        <p className="text-sm text-muted-foreground">Control how you appear around the gym.</p>
      </div>

      {/* TV opt-in card */}
      <div className="rounded-2xl bg-card p-5 ring-1 ring-border/50">
        <div className="flex items-start gap-4">
          <div className="rounded-xl bg-orange-500/15 p-3">
            <Monitor className="size-6 text-orange-400" />
          </div>
          <div className="flex-1 space-y-1">
            <div className="flex items-center justify-between gap-3">
              <div className="font-semibold">Show me on the gym TV</div>
              {showOnTv === null ? (
                <Skeleton className="h-6 w-11" />
              ) : (
                <Switch
                  checked={showOnTv}
                  onCheckedChange={handleToggle}
                  disabled={saving}
                  aria-label="Show on gym TV"
                />
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              When on, your name, photo, and PRs can appear on the leaderboard TV in the gym (top
              lifters, streaks, badges, latest PRs, perfect attendance, live training).
            </p>
            <p className="text-xs text-muted-foreground">
              When off, you&apos;re excluded from named panels but still count toward anonymous
              totals (overall sessions logged, total volume lifted, etc.).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
