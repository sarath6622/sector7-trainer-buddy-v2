'use client';

import { useEffect, useState } from 'react';
import { Trophy } from 'lucide-react';
import { BadgeGrid, type EarnedBadge, type LockedBadge } from '@/components/badges/BadgeGrid';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';

export default function ClientBadgesPage() {
  const [earned, setEarned] = useState<EarnedBadge[]>([]);
  const [locked, setLocked] = useState<LockedBadge[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/client/badges')
      .then((r) => r.json())
      .then(({ data }) => {
        setEarned(data?.earned ?? []);
        setLocked(data?.locked ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleToggleDisplay(badgeId: string, display: boolean) {
    const res = await fetch(`/api/client/badges/${badgeId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayOnProfile: display }),
    });
    if (res.ok) {
      setEarned((prev) =>
        prev.map((b) => (b.id === badgeId ? { ...b, displayOnProfile: display } : b)),
      );
    } else {
      toast.error('Failed to update badge');
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Trophy className="h-6 w-6 text-amber-500" />
        <div>
          <h1 className="text-xl font-bold">My Badges</h1>
          <p className="text-sm text-muted-foreground">
            Achievements earned through your fitness journey
          </p>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : (
        <BadgeGrid
          earned={earned}
          locked={locked}
          showToggle
          onToggleDisplay={handleToggleDisplay}
        />
      )}
    </div>
  );
}
