'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Megaphone, Monitor, Pin, PinOff, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Link from 'next/link';

interface ControlState {
  pinnedPanel: string | null;
  shoutout: { message: string; expiresAt: string } | null;
}

const PANEL_OPTIONS: { key: string; label: string }[] = [
  { key: 'liveNow', label: '⏱️ Live Now' },
  { key: 'bench', label: '🏋️ Bench Press' },
  { key: 'squat', label: '🦵 Squat' },
  { key: 'deadlift', label: '💪 Deadlift' },
  { key: 'ohp', label: '⛹️ Overhead Press' },
  { key: 'volume', label: '🔥 Volume Kings' },
  { key: 'streaks', label: '🔥 Streaks' },
  { key: 'latestPRs', label: '⚡ Latest PRs' },
  { key: 'badges', label: '🏅 Badges' },
  { key: 'perfect', label: '💯 Perfect Attendance' },
];

const SHOUTOUT_TTL_OPTIONS: { sec: number; label: string }[] = [
  { sec: 30, label: '30s' },
  { sec: 60, label: '1 min' },
  { sec: 180, label: '3 min' },
  { sec: 600, label: '10 min' },
];

export default function TvControlPage() {
  const [state, setState] = useState<ControlState | null>(null);
  const [loading, setLoading] = useState(false);
  const [shoutoutText, setShoutoutText] = useState('');
  const [shoutoutTtl, setShoutoutTtl] = useState(60);
  const [submitting, setSubmitting] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/tv-control', { cache: 'no-store' });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const json = (await res.json()) as { data: ControlState };
      setState(json.data);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load TV control state');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function setPin(panel: string | null) {
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/tv-control', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pinnedPanel: panel }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? 'Failed to update');
        return;
      }
      setState((s) => (s ? { ...s, pinnedPanel: panel } : s));
      toast.success(
        panel ? `Pinned ${PANEL_OPTIONS.find((p) => p.key === panel)?.label}` : 'Pin cleared',
      );
    } catch (err) {
      console.error(err);
      toast.error('Network error');
    } finally {
      setSubmitting(false);
    }
  }

  async function sendShoutout() {
    const msg = shoutoutText.trim();
    if (!msg) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/tv-control', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ shoutout: msg, shoutoutTtlSec: shoutoutTtl }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? 'Failed to broadcast');
        return;
      }
      toast.success(`Shoutout broadcast for ${shoutoutTtl}s`);
      setShoutoutText('');
      refresh();
    } catch (err) {
      console.error(err);
      toast.error('Network error');
    } finally {
      setSubmitting(false);
    }
  }

  async function clearShoutout() {
    setSubmitting(true);
    try {
      await fetch('/api/admin/tv-control', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ shoutout: null }),
      });
      refresh();
    } finally {
      setSubmitting(false);
    }
  }

  const pinnedPanelLabel = state?.pinnedPanel
    ? (PANEL_OPTIONS.find((p) => p.key === state.pinnedPanel)?.label ?? state.pinnedPanel)
    : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Monitor className="size-6 text-orange-500" />
            TV Control
          </h1>
          <p className="text-sm text-muted-foreground">
            Pin a panel or broadcast a shoutout to the gym TV.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/settings/tv-devices">
            <Button variant="outline" size="sm">
              Manage Devices
            </Button>
          </Link>
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
            <RefreshCw className={loading ? 'animate-spin' : ''} />
          </Button>
        </div>
      </div>

      {/* Pin panel */}
      <div className="rounded-2xl bg-card p-5 ring-1 ring-border/50 space-y-4">
        <div className="flex items-center gap-2">
          <Pin className="size-5 text-orange-400" />
          <div className="font-semibold">Pin a panel</div>
        </div>
        <p className="text-sm text-muted-foreground">
          When pinned, the TV stops rotating and stays on the chosen panel until you clear it.
        </p>
        {pinnedPanelLabel && (
          <div className="rounded-xl bg-orange-500/10 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-orange-300">
              <Pin className="size-4" />
              <span className="font-medium">Currently pinned:</span>
              <span>{pinnedPanelLabel}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setPin(null)} disabled={submitting}>
              <PinOff /> Clear
            </Button>
          </div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {PANEL_OPTIONS.map((p) => {
            const isActive = state?.pinnedPanel === p.key;
            return (
              <Button
                key={p.key}
                variant={isActive ? 'default' : 'outline'}
                onClick={() => setPin(isActive ? null : p.key)}
                disabled={submitting}
                className="justify-start"
              >
                {p.label}
              </Button>
            );
          })}
        </div>
      </div>

      {/* Shoutout */}
      <div className="rounded-2xl bg-card p-5 ring-1 ring-border/50 space-y-4">
        <div className="flex items-center gap-2">
          <Megaphone className="size-5 text-orange-400" />
          <div className="font-semibold">Broadcast a shoutout</div>
        </div>
        <p className="text-sm text-muted-foreground">
          A banner shown across the top of the TV for the chosen duration.
        </p>
        {state?.shoutout && (
          <div className="rounded-xl bg-orange-500/10 px-4 py-3 flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-xs uppercase tracking-wider text-orange-300">
                Currently broadcasting
              </div>
              <div className="font-semibold truncate">📣 {state.shoutout.message}</div>
              <div className="text-xs text-muted-foreground">
                Expires {new Date(state.shoutout.expiresAt).toLocaleTimeString()}
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={clearShoutout} disabled={submitting}>
              Clear
            </Button>
          </div>
        )}
        <Input
          placeholder='e.g. "Welcome to leg day, Priya! 🦵"'
          value={shoutoutText}
          onChange={(e) => setShoutoutText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') sendShoutout();
          }}
          maxLength={500}
        />
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground mr-2">Show for:</span>
            {SHOUTOUT_TTL_OPTIONS.map((opt) => (
              <Button
                key={opt.sec}
                variant={shoutoutTtl === opt.sec ? 'default' : 'outline'}
                size="sm"
                onClick={() => setShoutoutTtl(opt.sec)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
          <Button onClick={sendShoutout} disabled={submitting || !shoutoutText.trim()}>
            {submitting ? <Loader2 className="animate-spin" /> : <Megaphone />}
            Broadcast
          </Button>
        </div>
      </div>
    </div>
  );
}
