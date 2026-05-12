'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Maximize, Megaphone, Minimize } from 'lucide-react';
import { TvPanel } from '@/components/tv/TvPanel';
import { PrTakeover, type TakeoverPr } from '@/components/tv/PrTakeover';

// ─── Types matching tv-dashboard.service.ts ────────────────────────────────

interface LeaderRow {
  clientName: string;
  profileImageUrl: string | null;
  weightKg: number;
  reps: number | null;
  achievedAt: string;
}
interface VolumeRow {
  clientName: string;
  profileImageUrl: string | null;
  totalVolumeKg: number;
}
interface StreakRow {
  clientName: string;
  profileImageUrl: string | null;
  streakDays: number;
}
interface BadgeUnlockRow {
  clientName: string;
  profileImageUrl: string | null;
  badgeName: string;
  badgeIcon: string;
  awardedAt: string;
}
interface PrFeedRow {
  clientName: string;
  profileImageUrl: string | null;
  exerciseName: string;
  weightKg: number;
  reps: number | null;
  achievedAt: string;
}
interface AttendanceRow {
  clientName: string;
  profileImageUrl: string | null;
  completedCount: number;
}
interface LiveSessionRow {
  trainerName: string;
  clientName: string;
  startedAt: string;
}

interface CompoundSlot {
  male: LeaderRow[];
  female: LeaderRow[];
}

export interface TvDashboardPayload {
  generatedAt: string;
  month: string;
  branchId: string;
  branchName: string;
  panels: {
    compoundLeaderboards: {
      bench: CompoundSlot;
      squat: CompoundSlot;
      deadlift: CompoundSlot;
      ohp: CompoundSlot;
    };
    volumeKings: { male: VolumeRow[]; female: VolumeRow[] };
    streaks: StreakRow[];
    badgesThisMonth: BadgeUnlockRow[];
    latestPRs: PrFeedRow[];
    perfectAttendance: AttendanceRow[];
    liveNow: { count: number; sessions: LiveSessionRow[] };
  };
  control: {
    pinnedPanel: string | null;
    shoutout: { message: string; expiresAt: string } | null;
  };
}

// ─── Panel deck (rotation order) ───────────────────────────────────────────

type PanelKey =
  | 'liveNow'
  | 'bench'
  | 'squat'
  | 'deadlift'
  | 'ohp'
  | 'volume'
  | 'streaks'
  | 'latestPRs'
  | 'badges'
  | 'perfect';

const PANEL_ORDER: PanelKey[] = [
  'liveNow',
  'bench',
  'squat',
  'deadlift',
  'ohp',
  'volume',
  'streaks',
  'latestPRs',
  'badges',
  'perfect',
];

const ROTATION_MS = 15_000;
const DASHBOARD_REFRESH_MS = 60_000;
const LIVE_REFRESH_MS = 10_000;
const PR_TAKEOVER_MS = 10_000;

// ─── Component ─────────────────────────────────────────────────────────────

export function TvDashboard({ token }: { token: string }) {
  const [data, setData] = useState<TvDashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [panelIndex, setPanelIndex] = useState(0);
  const [prQueue, setPrQueue] = useState<TakeoverPr[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const sync = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', sync);
    sync();
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void document.documentElement.requestFullscreen().catch(() => {});
    }
  }, []);

  // Tracks the newest `achievedAt` we've already shown confetti for. On first
  // load we set this to the most-recent PR in the seed payload so we don't
  // replay history when the TV reboots.
  const lastSeenPrAt = useRef<number | null>(null);

  // Tick once a second so shoutout countdowns/clocks render live
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  /**
   * Diff a freshly-fetched `latestPRs` against `lastSeenPrAt` and queue any
   * newer entries for the confetti takeover. Oldest first so a flurry of PRs
   * celebrates in chronological order.
   */
  const ingestLatestPRs = useCallback((latest: PrFeedRow[]) => {
    if (latest.length === 0) return;
    // First load: seed the watermark, skip celebration for history.
    if (lastSeenPrAt.current === null) {
      lastSeenPrAt.current = Math.max(...latest.map((p) => new Date(p.achievedAt).getTime()));
      return;
    }
    const watermark = lastSeenPrAt.current;
    const fresh = latest
      .filter((p) => new Date(p.achievedAt).getTime() > watermark)
      .sort((a, b) => new Date(a.achievedAt).getTime() - new Date(b.achievedAt).getTime());
    if (fresh.length === 0) return;
    lastSeenPrAt.current = new Date(fresh[fresh.length - 1]!.achievedAt).getTime();
    setPrQueue((q) => [...q, ...fresh]);
  }, []);

  // ── Fetch full dashboard ─────────────────────────────────────────────────
  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/tv/dashboard', {
        headers: { authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (!res.ok) {
        setError(`Dashboard fetch failed: ${res.status}`);
        return;
      }
      const json = (await res.json()) as { data: TvDashboardPayload };
      setData(json.data);
      setError(null);
      ingestLatestPRs(json.data.panels.latestPRs);
    } catch (err) {
      console.error('[tv] dashboard fetch error', err);
      setError('Network error');
    }
  }, [token, ingestLatestPRs]);

  // ── Fetch live (lighter, faster cadence) ─────────────────────────────────
  const fetchLive = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/tv/live', {
        headers: { authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (!res.ok) return;
      const json = (await res.json()) as {
        data: {
          liveNow: { count: number; sessions: LiveSessionRow[] };
          latestPRs: PrFeedRow[];
          control: TvDashboardPayload['control'];
        };
      };
      setData((prev) =>
        prev
          ? {
              ...prev,
              panels: {
                ...prev.panels,
                liveNow: json.data.liveNow,
                latestPRs: json.data.latestPRs,
              },
              control: json.data.control,
            }
          : prev,
      );
      ingestLatestPRs(json.data.latestPRs);
    } catch {
      // tolerate transient failures — next dashboard refresh fills in
    }
  }, [token, ingestLatestPRs]);

  // ── Initial + recurring fetches ──────────────────────────────────────────
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchDashboard();
    const t = setInterval(fetchDashboard, DASHBOARD_REFRESH_MS);
    return () => clearInterval(t);
  }, [fetchDashboard]);

  useEffect(() => {
    const t = setInterval(fetchLive, LIVE_REFRESH_MS);
    return () => clearInterval(t);
  }, [fetchLive]);

  // ── Panel rotation (paused while pinned, paused during PR takeover) ──────
  const pinnedPanel = data?.control.pinnedPanel ?? null;
  const isPinned = pinnedPanel != null && PANEL_ORDER.includes(pinnedPanel as PanelKey);
  const hasTakeover = prQueue.length > 0;

  useEffect(() => {
    if (isPinned || hasTakeover) return;
    const t = setInterval(() => {
      setPanelIndex((i) => (i + 1) % PANEL_ORDER.length);
    }, ROTATION_MS);
    return () => clearInterval(t);
  }, [isPinned, hasTakeover]);

  // When a pin lands, snap to it immediately
  useEffect(() => {
    if (isPinned && pinnedPanel) {
      const idx = PANEL_ORDER.indexOf(pinnedPanel as PanelKey);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (idx >= 0) setPanelIndex(idx);
    }
  }, [isPinned, pinnedPanel]);

  // ── PR takeover queue: show one for 10s, then move on ────────────────────
  useEffect(() => {
    if (prQueue.length === 0) return;
    const t = setTimeout(() => {
      setPrQueue((q) => q.slice(1));
    }, PR_TAKEOVER_MS);
    return () => clearTimeout(t);
  }, [prQueue]);

  // ── Render ───────────────────────────────────────────────────────────────
  if (error && !data) {
    return (
      <div className="flex h-full items-center justify-center text-center px-12">
        <div className="space-y-4">
          <div className="text-6xl font-bold text-red-400">{error}</div>
          <div className="text-2xl text-zinc-400">Retrying every 60s…</div>
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-5xl font-semibold text-zinc-400">Loading dashboard…</div>
      </div>
    );
  }

  const currentPanel = PANEL_ORDER[panelIndex] ?? PANEL_ORDER[0]!;
  const shoutoutLive =
    data.control.shoutout && new Date(data.control.shoutout.expiresAt).getTime() > now;

  return (
    <div className="relative flex h-full w-full flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-10 pt-8 pb-4">
        <div className="flex items-center gap-4">
          <img src="/sector7-logo-full.png" alt="Sector 7" className="h-40 w-auto object-contain" />
        </div>
        <div className="flex items-center gap-6 text-zinc-400">
          <span className="text-2xl">{formatMonth(data.month)}</span>
          <span className="text-2xl tabular-nums">{formatClock(now)}</span>
          <button
            type="button"
            onClick={toggleFullscreen}
            className="rounded-lg p-2 text-zinc-500 transition hover:bg-white/5 hover:text-zinc-200"
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          >
            {isFullscreen ? <Minimize className="h-7 w-7" /> : <Maximize className="h-7 w-7" />}
          </button>
        </div>
      </header>

      {/* Shoutout banner */}
      {shoutoutLive && data.control.shoutout && (
        <div className="mx-10 mb-2 rounded-2xl bg-orange-500/15 px-8 py-4 ring-2 ring-orange-500/40">
          <div className="flex items-center gap-4 text-3xl font-semibold text-orange-300 animate-pulse">
            <Megaphone className="h-9 w-9 shrink-0" />
            <span>{data.control.shoutout.message}</span>
          </div>
        </div>
      )}

      {/* Panel area */}
      <main className="relative flex flex-1 min-h-0 px-10 pb-10">
        <TvPanel panelKey={currentPanel} data={data} now={now} />
      </main>

      {/* Footer pip indicator */}
      <footer className="absolute bottom-3 left-0 right-0 flex justify-center gap-2">
        {PANEL_ORDER.map((p, i) => (
          <span
            key={p}
            className={`h-2 rounded-full transition-all ${
              i === panelIndex ? 'w-8 bg-orange-500' : 'w-2 bg-zinc-700'
            }`}
          />
        ))}
      </footer>

      {/* PR takeover */}
      {prQueue[0] && <PrTakeover pr={prQueue[0]} />}
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function formatMonth(yyyymm: string): string {
  const [y, m] = yyyymm.split('-').map(Number);
  if (!y || !m) return yyyymm;
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

function formatClock(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
}
