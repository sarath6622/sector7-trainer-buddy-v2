'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { CalendarDays, Clock, Dumbbell, Maximize, Megaphone, Minimize, Zap } from 'lucide-react';
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

export interface AnnouncementSlide {
  id: string;
  title: string;
  body: string;
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
  expiresAt: string | null;
}

export interface UpcomingEvent {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  icon: string | null;
  eventAt: string;
  sortOrder: number;
  isActive: boolean;
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
    announcements: AnnouncementSlide[];
    upcomingEvents: UpcomingEvent[];
  };
  control: {
    pinnedPanels: string[];
    shoutout: { message: string; expiresAt: string } | null;
  };
}

// ─── Panel deck (rotation order) ───────────────────────────────────────────
//
// TV only shows compound leaderboards + latest PRs + announcements. Announcements
// expand into one slot per live slide so each gets its own equal share of screen
// time in the rotation.

type LeaderboardPanelKey = 'bench' | 'squat' | 'deadlift' | 'ohp' | 'latestPRs' | 'events';

const LEADERBOARD_ORDER: LeaderboardPanelKey[] = [
  'bench',
  'squat',
  'deadlift',
  'latestPRs',
  'events',
];

// Effective deck slot — either a fixed leaderboard panel or an announcement slide.
type DeckSlot =
  | { kind: 'panel'; key: LeaderboardPanelKey }
  | { kind: 'announcement'; slide: AnnouncementSlide };

const ROTATION_MS = 15_000;
const DASHBOARD_REFRESH_MS = 60_000;
const LIVE_REFRESH_MS = 10_000;
const PR_TAKEOVER_MS = 10_000;

// Per-panel title/subtitle/icon shown in the dashboard header. Keeping these here
// (rather than inside each TvPanel) lets the header own the title slot and the
// panels render the data grid only — matches the mockup layout.
interface PanelMeta {
  title: string;
  subtitle: string;
  icon: ReactNode;
}

const PANEL_META: Record<LeaderboardPanelKey, PanelMeta> = {
  bench: {
    title: 'Bench Press',
    subtitle: 'Top lifters this month',
    icon: <Dumbbell className="h-12 w-12 text-orange-400" />,
  },
  squat: {
    title: 'Squat',
    subtitle: 'Top lifters this month',
    icon: <Dumbbell className="h-12 w-12 text-orange-400" />,
  },
  deadlift: {
    title: 'Deadlift',
    subtitle: 'Top lifters this month',
    icon: <Dumbbell className="h-12 w-12 text-orange-400" />,
  },
  ohp: {
    title: 'Overhead Press',
    subtitle: 'Top lifters this month',
    icon: <Dumbbell className="h-12 w-12 text-orange-400" />,
  },
  latestPRs: {
    title: 'Latest PRs',
    subtitle: 'Last 7 days',
    icon: <Zap className="h-12 w-12 text-yellow-300" />,
  },
  events: {
    title: 'Coming Up',
    subtitle: 'Upcoming gym events',
    icon: <CalendarDays className="h-12 w-12 text-sky-400" />,
  },
};

const ANNOUNCEMENT_META: PanelMeta = {
  title: 'Announcement',
  subtitle: 'From the gym',
  icon: <Megaphone className="h-12 w-12 text-yellow-300" />,
};

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
          announcements: AnnouncementSlide[];
          upcomingEvents: UpcomingEvent[];
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
                announcements: json.data.announcements,
                upcomingEvents: json.data.upcomingEvents,
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

  // ── Build the effective panel deck ──────────────────────────────────────
  // Leaderboards always render; announcements expand into one slot per slide.
  // The 'events' slot is hidden when no upcoming events are configured so we
  // don't show an empty "Coming Up" board.
  const deck: DeckSlot[] = (() => {
    const hasEvents = (data?.panels.upcomingEvents ?? []).length > 0;
    const base: DeckSlot[] = LEADERBOARD_ORDER.filter((key) =>
      key === 'events' ? hasEvents : true,
    ).map((key) => ({ kind: 'panel', key }));
    const slides = data?.panels.announcements ?? [];
    const slots: DeckSlot[] = slides.map((slide) => ({ kind: 'announcement', slide }));
    return [...base, ...slots];
  })();

  // ── Pinned-panel filter ─────────────────────────────────────────────────
  // `pinnedPanels` (admin TV control) restricts rotation to a chosen subset.
  // Empty = rotate everything. If the pinned set matches nothing currently in
  // the deck (e.g. all pinned panels are hidden), fall back to the full deck
  // so the TV never goes blank.
  const pinnedPanels = data?.control.pinnedPanels ?? [];
  const pinnedDeck = deck.filter((s) => s.kind === 'panel' && pinnedPanels.includes(s.key));
  const activeDeck: DeckSlot[] =
    pinnedPanels.length > 0 && pinnedDeck.length > 0 ? pinnedDeck : deck;
  const pinKey = pinnedPanels.slice().sort().join(',');

  // ── Panel rotation (paused during PR takeover) ──────────────────────────
  const hasTakeover = prQueue.length > 0;

  // Keep panelIndex in range when the active deck shrinks (announcements
  // added/removed, or the pinned subset changed).
  useEffect(() => {
    if (activeDeck.length === 0) return;
    if (panelIndex >= activeDeck.length) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPanelIndex(0);
    }
  }, [activeDeck.length, panelIndex]);

  // When the pinned set changes, restart from the first pinned panel.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPanelIndex(0);
  }, [pinKey]);

  // Re-run on panelIndex change so a manual click (pip) resets the dwell timer —
  // whoever just navigated gets a full ROTATION_MS to read the slide they picked.
  useEffect(() => {
    if (hasTakeover || activeDeck.length <= 1) return;
    const t = setInterval(() => {
      setPanelIndex((i) => (i + 1) % activeDeck.length);
    }, ROTATION_MS);
    return () => clearInterval(t);
  }, [hasTakeover, activeDeck.length, panelIndex]);

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

  const safeIndex = activeDeck.length > 0 ? Math.min(panelIndex, activeDeck.length - 1) : 0;
  const currentSlot: DeckSlot = activeDeck[safeIndex] ?? {
    kind: 'panel',
    key: LEADERBOARD_ORDER[0]!,
  };
  const meta: PanelMeta =
    currentSlot.kind === 'panel' ? PANEL_META[currentSlot.key] : ANNOUNCEMENT_META;
  const shoutoutLive =
    data.control.shoutout && new Date(data.control.shoutout.expiresAt).getTime() > now;

  return (
    <div className="relative flex h-full w-full flex-col">
      {/* Header: logo · centered panel title · clock card */}
      <header className="grid grid-cols-3 items-center gap-6 px-10 pt-6 pb-4">
        <div className="flex items-center justify-start">
          <img src="/sector7-logo-full.png" alt="Sector 7" className="h-24 w-auto object-contain" />
        </div>
        <div className="flex flex-col items-center">
          <div className="flex items-center gap-4">
            {meta.icon}
            <h1 className="text-6xl font-extrabold uppercase tracking-tight text-white">
              {meta.title}
            </h1>
          </div>
          <div className="mt-2 text-2xl font-semibold uppercase tracking-[0.25em] text-zinc-300">
            {meta.subtitle}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2">
          <div className="flex items-center gap-3 rounded-2xl bg-zinc-900/70 px-5 py-3 ring-1 ring-white/5">
            <Clock className="h-7 w-7 text-zinc-400" />
            <div className="flex flex-col leading-tight">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                {formatMonthShort(data.month)}
              </span>
              <span className="text-2xl font-bold tabular-nums text-zinc-100">
                {formatClock(now)}
              </span>
            </div>
          </div>
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
        {currentSlot.kind === 'panel' ? (
          <TvPanel panelKey={currentSlot.key} data={data} now={now} />
        ) : (
          <TvPanel panelKey="announcement" data={data} now={now} announcement={currentSlot.slide} />
        )}
      </main>

      {/* Rotation progress bar — fills over ROTATION_MS so viewers can see
          when the slide is about to change. Keyed on panelIndex so it
          restarts on every change; hidden when rotation is paused. */}
      {activeDeck.length > 1 && !hasTakeover && (
        <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-white/[0.06]">
          <div
            key={safeIndex}
            className="tv-rotation-progress h-full bg-orange-500/80"
            style={{ animationDuration: `${ROTATION_MS}ms` }}
          />
        </div>
      )}

      {/* Footer pip indicator — click to jump to that slide */}
      <footer className="absolute bottom-3 left-0 right-0 flex justify-center gap-2">
        {activeDeck.map((slot, i) => {
          const key = slot.kind === 'panel' ? `p-${slot.key}` : `a-${slot.slide.id}`;
          const isAnnouncement = slot.kind === 'announcement';
          const active = i === safeIndex;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setPanelIndex(i)}
              aria-label={`Go to slide ${i + 1}`}
              aria-current={active ? 'true' : undefined}
              className={`h-2 cursor-pointer rounded-full transition-all hover:opacity-80 ${
                active
                  ? isAnnouncement
                    ? 'w-8 bg-yellow-400'
                    : 'w-8 bg-orange-500'
                  : 'w-2 bg-zinc-700 hover:bg-zinc-500'
              }`}
            />
          );
        })}
      </footer>

      {/* PR takeover */}
      {prQueue[0] && <PrTakeover pr={prQueue[0]} />}

      <style jsx global>{`
        @keyframes tvRotationProgress {
          from {
            width: 0%;
          }
          to {
            width: 100%;
          }
        }
        .tv-rotation-progress {
          animation: tvRotationProgress linear forwards;
        }
      `}</style>
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function formatMonthShort(yyyymm: string): string {
  const [y, m] = yyyymm.split('-').map(Number);
  if (!y || !m) return yyyymm;
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }).toUpperCase();
}

function formatClock(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
}
