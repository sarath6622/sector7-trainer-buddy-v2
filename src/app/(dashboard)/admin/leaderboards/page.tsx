'use client';

// Admin desktop view of every leaderboard the TV cycles through, shown all at
// once with operator controls (month, gender, top-N, search, auto-refresh).
// Reuses the TV dashboard endpoint — `/api/admin/tv/dashboard` accepts an admin
// session via assertTvOrAdmin, so no new API surface is needed.

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  BarChart3,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  ExternalLink,
  Flame,
  Loader2,
  Medal,
  Monitor,
  RefreshCw,
  Search,
  Sparkles,
  Trophy,
  Zap,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { TvDashboardPayload } from '@/components/tv/TvDashboard';

type Gender = 'all' | 'male' | 'female';

// One normalized row for any leaderboard card. `sortVal` drives ranking; the
// display strings are pre-formatted so the card component stays dumb.
interface RankedRow {
  id: string;
  name: string;
  img: string | null;
  sortVal: number;
  primary: string;
  secondary?: string;
  gender?: 'male' | 'female';
  emoji?: string;
}

const REFRESH_MS = 30_000;

export default function AdminLeaderboardsPage() {
  const [month, setMonth] = useState(() => currentYm());
  const [data, setData] = useState<TvDashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  const [gender, setGender] = useState<Gender>('all');
  const [topN, setTopN] = useState<number>(10);
  const [rawQuery, setRawQuery] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(false);

  const query = rawQuery.trim().toLowerCase();

  const fetchData = useCallback(async (m: string, opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const res = await fetch(`/api/admin/tv/dashboard?month=${m}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { data: TvDashboardPayload };
      setData(json.data);
      setError(null);
      setUpdatedAt(Date.now());
    } catch {
      setError('Failed to load leaderboards. Try refreshing.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData(month);
  }, [month, fetchData]);

  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => void fetchData(month, { silent: true }), REFRESH_MS);
    return () => clearInterval(t);
  }, [autoRefresh, month, fetchData]);

  const atCurrentMonth = month >= currentYm();
  const panels = data?.panels;

  // ── Build normalized rows per card ─────────────────────────────────────────
  const compound = useMemo(() => {
    if (!panels) return null;
    const lift = (slot: { male: LeaderRowLike[]; female: LeaderRowLike[] }) =>
      genderedRows(slot, gender, (r, g) => ({
        id: r.clientProfileId,
        name: r.clientName,
        img: r.profileImageUrl,
        sortVal: r.weightKg,
        primary: `${formatKg(r.weightKg)} kg`,
        secondary: r.reps != null ? `× ${r.reps} reps` : undefined,
        gender: g,
      }));
    return {
      bench: lift(panels.compoundLeaderboards.bench),
      squat: lift(panels.compoundLeaderboards.squat),
      deadlift: lift(panels.compoundLeaderboards.deadlift),
      ohp: lift(panels.compoundLeaderboards.ohp),
    };
  }, [panels, gender]);

  const volume = useMemo(() => {
    if (!panels) return [];
    return genderedRows(panels.volumeKings, gender, (r, g) => ({
      id: `${g}-${r.clientName}`,
      name: r.clientName,
      img: r.profileImageUrl,
      sortVal: r.totalVolumeKg,
      primary: `${formatNum(r.totalVolumeKg)} kg`,
      secondary: 'total volume',
      gender: g,
    }));
  }, [panels, gender]);

  const streaks = useMemo<RankedRow[]>(() => {
    if (!panels) return [];
    return panels.streaks
      .map((r) => ({
        id: r.clientName,
        name: r.clientName,
        img: r.profileImageUrl,
        sortVal: r.streakDays,
        primary: `${r.streakDays}`,
      }))
      .sort((a, b) => b.sortVal - a.sortVal);
  }, [panels]);

  const attendance = useMemo<RankedRow[]>(() => {
    if (!panels) return [];
    return panels.perfectAttendance
      .map((r) => ({
        id: r.clientName,
        name: r.clientName,
        img: r.profileImageUrl,
        sortVal: r.completedCount,
        primary: `${r.completedCount}`,
      }))
      .sort((a, b) => b.sortVal - a.sortVal);
  }, [panels]);

  const latestPRs = useMemo<RankedRow[]>(() => {
    if (!panels) return [];
    return panels.latestPRs.map((r, i) => ({
      id: `${r.clientName}-${r.achievedAt}-${i}`,
      name: r.clientName,
      img: r.profileImageUrl,
      sortVal: new Date(r.achievedAt).getTime(),
      primary: `${formatKg(r.weightKg)} kg`,
      secondary: `${r.exerciseName}${r.reps != null ? ` · ×${r.reps}` : ''}`,
    }));
  }, [panels]);

  const badges = useMemo<RankedRow[]>(() => {
    if (!panels) return [];
    return panels.badgesThisMonth.map((r, i) => ({
      id: `${r.clientName}-${r.badgeName}-${i}`,
      name: r.clientName,
      img: r.profileImageUrl,
      sortVal: new Date(r.awardedAt).getTime(),
      primary: r.badgeName,
      secondary: formatDate(r.awardedAt),
      emoji: r.badgeIcon,
    }));
  }, [panels]);

  const liveCount = panels?.liveNow.count ?? 0;

  return (
    <div className="space-y-5 pb-10">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Trophy className="h-6 w-6 text-orange-400" />
            Leaderboards
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {data?.branchName ? `${data.branchName} · ` : ''}
            {monthLabel(month)}
            {updatedAt && (
              <span className="ml-2 text-muted-foreground/70">
                · updated {formatClock(updatedAt)}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {liveCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-500">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
              {liveCount} live now
            </span>
          )}
          <Link
            href="/tv"
            target="_blank"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-muted-foreground transition hover:text-foreground"
          >
            <Monitor className="h-4 w-4" />
            TV view
            <ExternalLink className="h-3.5 w-3.5 opacity-60" />
          </Link>
          <Link
            href="/admin/tv-control"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-muted-foreground transition hover:text-foreground"
          >
            TV Control
          </Link>
        </div>
      </div>

      {/* ── Controls toolbar ───────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 -mx-1 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border border-border bg-card/80 px-3 py-2.5 backdrop-blur">
        {/* Month stepper */}
        <div className="flex items-center gap-1">
          <ToolbarButton
            onClick={() => setMonth((m) => shiftYm(m, -1))}
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </ToolbarButton>
          <span className="min-w-[7.5rem] text-center text-sm font-semibold tabular-nums">
            {monthLabel(month)}
          </span>
          <ToolbarButton
            onClick={() => setMonth((m) => shiftYm(m, 1))}
            disabled={atCurrentMonth}
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </ToolbarButton>
          {!atCurrentMonth && (
            <button
              onClick={() => setMonth(currentYm())}
              className="ml-1 text-xs font-medium text-primary hover:underline"
            >
              This month
            </button>
          )}
        </div>

        <Divider />

        {/* Gender — applies to lifts + volume */}
        <Segmented
          value={gender}
          onChange={setGender}
          options={[
            { value: 'all', label: 'All' },
            { value: 'male', label: 'Men' },
            { value: 'female', label: 'Women' },
          ]}
        />

        <Divider />

        {/* Top N */}
        <Segmented
          value={topN}
          onChange={setTopN}
          options={[
            { value: 5, label: 'Top 5' },
            { value: 10, label: 'Top 10' },
            { value: 25, label: 'Top 25' },
            { value: Infinity, label: 'All' },
          ]}
        />

        <Divider />

        {/* Search */}
        <div className="relative min-w-[10rem] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={rawQuery}
            onChange={(e) => setRawQuery(e.target.value)}
            placeholder="Filter by name…"
            className="h-9 pl-8"
          />
        </div>

        {/* Refresh + auto */}
        <div className="ml-auto flex items-center gap-2">
          <label className="flex cursor-pointer select-none items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="h-3.5 w-3.5 accent-primary"
            />
            Auto 30s
          </label>
          <ToolbarButton onClick={() => void fetchData(month)} aria-label="Refresh">
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </ToolbarButton>
        </div>
      </div>

      {/* ── States ─────────────────────────────────────────────────────────── */}
      {error && !data ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border py-20 text-center">
          <p className="text-sm text-red-400">{error}</p>
          <button
            onClick={() => void fetchData(month)}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Retry
          </button>
        </div>
      ) : loading && !data ? (
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading leaderboards…
        </div>
      ) : (
        // ── Grid of cards ────────────────────────────────────────────────────
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          <LeaderCard
            title="Bench Press"
            subtitle="Heaviest this month"
            icon={<Dumbbell className="h-5 w-5 text-orange-400" />}
            rows={compound?.bench ?? []}
            query={query}
            topN={topN}
            showGenderChip={gender === 'all'}
          />
          <LeaderCard
            title="Squat"
            subtitle="Heaviest this month"
            icon={<Dumbbell className="h-5 w-5 text-orange-400" />}
            rows={compound?.squat ?? []}
            query={query}
            topN={topN}
            showGenderChip={gender === 'all'}
          />
          <LeaderCard
            title="Deadlift"
            subtitle="Heaviest this month"
            icon={<Dumbbell className="h-5 w-5 text-orange-400" />}
            rows={compound?.deadlift ?? []}
            query={query}
            topN={topN}
            showGenderChip={gender === 'all'}
          />
          <LeaderCard
            title="Overhead Press"
            subtitle="Heaviest this month"
            icon={<Dumbbell className="h-5 w-5 text-orange-400" />}
            rows={compound?.ohp ?? []}
            query={query}
            topN={topN}
            showGenderChip={gender === 'all'}
          />
          <LeaderCard
            title="Volume Kings"
            subtitle="Most total volume lifted"
            icon={<BarChart3 className="h-5 w-5 text-violet-400" />}
            rows={volume}
            query={query}
            topN={topN}
            showGenderChip={gender === 'all'}
          />
          <LeaderCard
            title="Streaks"
            subtitle="Longest active streaks"
            icon={<Flame className="h-5 w-5 text-red-400" />}
            rows={streaks}
            query={query}
            topN={topN}
            unit="days"
          />
          <LeaderCard
            title="Perfect Attendance"
            subtitle="Sessions completed this month"
            icon={<CalendarCheck className="h-5 w-5 text-emerald-400" />}
            rows={attendance}
            query={query}
            topN={topN}
            unit="sessions"
          />
          <LeaderCard
            title="Latest PRs"
            subtitle="Most recent personal records"
            icon={<Zap className="h-5 w-5 text-yellow-300" />}
            rows={latestPRs}
            query={query}
            topN={topN}
            ranked={false}
          />
          <LeaderCard
            title="Badges This Month"
            subtitle="Newly unlocked achievements"
            icon={<Sparkles className="h-5 w-5 text-sky-400" />}
            rows={badges}
            query={query}
            topN={topN}
            ranked={false}
          />
        </div>
      )}
    </div>
  );
}

// ─── Leaderboard card ────────────────────────────────────────────────────────

interface LeaderCardProps {
  title: string;
  subtitle?: string;
  icon: ReactNode;
  rows: RankedRow[];
  query: string;
  topN: number;
  /** Show 1/2/3 medals + rank numbers. Off for feed-style lists (PRs, badges). */
  ranked?: boolean;
  /** Show a small M/F chip per row (compound + volume in "All" mode). */
  showGenderChip?: boolean;
  /** Small label rendered after the primary value (e.g. "days", "sessions"). */
  unit?: string;
}

function LeaderCard({
  title,
  subtitle,
  icon,
  rows,
  query,
  topN,
  ranked = true,
  showGenderChip = false,
  unit,
}: LeaderCardProps) {
  const visible = rows
    .filter((r) => (query ? r.name.toLowerCase().includes(query) : true))
    .slice(0, topN === Infinity ? undefined : topN);

  return (
    <Card className="flex flex-col gap-0 overflow-hidden py-0">
      <CardHeader className="flex flex-row items-center gap-2 border-b border-border/50 px-4 py-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/40">
          {icon}
        </span>
        <div className="min-w-0">
          <CardTitle className="text-base leading-tight">{title}</CardTitle>
          {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        <span className="ml-auto shrink-0 rounded-full bg-muted/50 px-2 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">
          {visible.length}
        </span>
      </CardHeader>
      <CardContent className="px-2 py-1.5">
        {visible.length === 0 ? (
          <p className="px-2 py-8 text-center text-sm text-muted-foreground/70">
            {query ? 'No matching names.' : 'No data yet.'}
          </p>
        ) : (
          <ol className="divide-y divide-border/40">
            {visible.map((r, i) => (
              <li key={r.id} className="flex items-center gap-3 px-2 py-2">
                {ranked && <RankBadge rank={i + 1} />}
                <Avatar className="h-9 w-9 shrink-0">
                  <AvatarImage src={r.img ?? undefined} />
                  <AvatarFallback className="bg-muted text-xs font-semibold">
                    {r.emoji ?? initials(r.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium">{r.name}</span>
                    {showGenderChip && r.gender && (
                      <span
                        className={cn(
                          'shrink-0 rounded px-1 text-[10px] font-bold uppercase',
                          r.gender === 'male'
                            ? 'bg-blue-500/15 text-blue-400'
                            : 'bg-pink-500/15 text-pink-400',
                        )}
                      >
                        {r.gender === 'male' ? 'M' : 'F'}
                      </span>
                    )}
                  </div>
                  {r.secondary && (
                    <p className="truncate text-xs text-muted-foreground">{r.secondary}</p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <span className="text-sm font-bold tabular-nums">{r.primary}</span>
                  {unit && <span className="ml-1 text-xs text-muted-foreground">{unit}</span>}
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function RankBadge({ rank }: { rank: number }) {
  const medal =
    rank === 1
      ? 'bg-yellow-400/20 text-yellow-400'
      : rank === 2
        ? 'bg-zinc-300/20 text-zinc-300'
        : rank === 3
          ? 'bg-amber-600/20 text-amber-500'
          : 'text-muted-foreground/60';
  return (
    <span
      className={cn(
        'flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-bold tabular-nums',
        medal,
      )}
    >
      {rank <= 3 ? <Medal className="h-3.5 w-3.5" /> : rank}
    </span>
  );
}

// ─── Toolbar primitives ──────────────────────────────────────────────────────

function ToolbarButton({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={cn(
        'flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40',
        className,
      )}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="hidden h-6 w-px bg-border sm:block" />;
}

function Segmented<T extends string | number>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-muted/30 p-0.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-md px-2.5 py-1.5 text-xs font-medium transition sm:text-sm',
            value === o.value
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Minimal shape we read off a compound-lift row; mirrors LeaderRow in the TV payload.
interface LeaderRowLike {
  clientProfileId: string;
  clientName: string;
  profileImageUrl: string | null;
  weightKg: number;
  reps: number | null;
}

/**
 * Flatten a `{ male, female }` slot into one ranked list. In "all" mode both
 * genders merge and re-sort by value; otherwise only the chosen side is kept.
 */
function genderedRows<T>(
  slot: { male: T[]; female: T[] },
  gender: Gender,
  toRow: (r: T, g: 'male' | 'female') => RankedRow,
): RankedRow[] {
  const out: RankedRow[] =
    gender === 'male'
      ? slot.male.map((r) => toRow(r, 'male'))
      : gender === 'female'
        ? slot.female.map((r) => toRow(r, 'female'))
        : [
            ...slot.male.map((r) => toRow(r, 'male')),
            ...slot.female.map((r) => toRow(r, 'female')),
          ];
  return out.sort((a, b) => b.sortVal - a.sortVal);
}

function currentYm(): string {
  return ymOf(new Date());
}

function ymOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function shiftYm(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  return ymOf(new Date(y!, m! - 1 + delta, 1));
}

function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return month;
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

function formatKg(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function formatNum(n: number): string {
  return Math.round(n).toLocaleString('en-IN');
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}
