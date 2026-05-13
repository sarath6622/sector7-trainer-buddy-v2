'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Camera, Monitor, Settings as SettingsIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { ProfileImageUploader } from '@/components/forms/ProfileImageUploader';

export default function ClientSettingsPage() {
  const { data: session } = useSession();
  const [showOnTv, setShowOnTv] = useState<boolean | null>(null);
  const [profileImageUrl, setProfileImageUrl] = useState<string | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [tvRes, imgRes] = await Promise.all([
        fetch('/api/client/profile/tv-opt-in', { cache: 'no-store' }),
        fetch('/api/client/profile/image', { cache: 'no-store' }),
      ]);
      if (!tvRes.ok) throw new Error(`TV opt-in status ${tvRes.status}`);
      if (!imgRes.ok) throw new Error(`Image status ${imgRes.status}`);
      const tvJson = (await tvRes.json()) as { data: { showOnTv: boolean } };
      const imgJson = (await imgRes.json()) as { data: { profileImageUrl: string | null } };
      setShowOnTv(tvJson.data.showOnTv);
      setProfileImageUrl(imgJson.data.profileImageUrl);
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

  const firstName = session?.user?.firstName ?? '';
  const lastName = session?.user?.lastName ?? '';
  const initials = `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase() || '?';

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <SettingsIcon className="size-6 text-orange-500" />
          Settings
        </h1>
        <p className="text-sm text-muted-foreground">Control how you appear around the gym.</p>
      </div>

      {/* Photo card */}
      <div className="rounded-2xl bg-card p-5 ring-1 ring-border/50">
        <div className="flex items-start gap-4">
          <div className="rounded-xl bg-orange-500/15 p-3">
            <Camera className="size-6 text-orange-400" />
          </div>
          <div className="flex-1 space-y-3">
            <div>
              <div className="font-semibold">Your photo</div>
              <p className="text-sm text-muted-foreground">
                Used on the gym TV leaderboard, community feed, and your profile.
              </p>
            </div>
            {profileImageUrl === undefined ? (
              <Skeleton className="h-28 w-28 rounded-full" />
            ) : (
              <ProfileImageUploader
                currentUrl={profileImageUrl}
                initials={initials}
                endpoint="/api/client/profile/image"
                size="lg"
                onChange={(url) => setProfileImageUrl(url)}
              />
            )}
          </div>
        </div>
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
