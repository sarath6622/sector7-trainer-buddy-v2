'use client';

import type { ReactNode } from 'react';
import { BadgeCheck, Dumbbell, Flame, Medal, Target, Timer, Zap } from 'lucide-react';
import type { TvDashboardPayload } from '@/components/tv/TvDashboard';

const HEADER_ICON_CLASS = 'h-16 w-16 shrink-0 text-orange-400';

interface Props {
  panelKey: string;
  data: TvDashboardPayload;
  now: number;
}

export function TvPanel({ panelKey, data, now }: Props) {
  const panels = data.panels;
  switch (panelKey) {
    case 'liveNow':
      return <LiveNowPanel data={panels.liveNow} now={now} />;
    case 'bench':
      return (
        <CompoundLiftPanel
          icon={<Dumbbell className={HEADER_ICON_CLASS} />}
          title="Bench Press"
          subtitle="Top lifters this month"
          slot={panels.compoundLeaderboards.bench}
        />
      );
    case 'squat':
      return (
        <CompoundLiftPanel
          icon={<Dumbbell className={HEADER_ICON_CLASS} />}
          title="Squat"
          subtitle="Top lifters this month"
          slot={panels.compoundLeaderboards.squat}
        />
      );
    case 'deadlift':
      return (
        <CompoundLiftPanel
          icon={<Dumbbell className={HEADER_ICON_CLASS} />}
          title="Deadlift"
          subtitle="Top lifters this month"
          slot={panels.compoundLeaderboards.deadlift}
        />
      );
    case 'ohp':
      return (
        <CompoundLiftPanel
          icon={<Dumbbell className={HEADER_ICON_CLASS} />}
          title="Overhead Press"
          subtitle="Top lifters this month"
          slot={panels.compoundLeaderboards.ohp}
        />
      );
    case 'volume':
      return <VolumePanel data={panels.volumeKings} />;
    case 'streaks':
      return <StreakPanel data={panels.streaks} />;
    case 'latestPRs':
      return <LatestPrPanel data={panels.latestPRs} />;
    case 'badges':
      return <BadgePanel data={panels.badgesThisMonth} />;
    case 'perfect':
      return <PerfectAttendancePanel data={panels.perfectAttendance} />;
    default:
      return null;
  }
}

// ─── Compound lift (gendered) ──────────────────────────────────────────────

interface LeaderRow {
  clientName: string;
  profileImageUrl: string | null;
  weightKg: number;
  reps: number | null;
  achievedAt: string;
}

function CompoundLiftPanel({
  icon,
  title,
  subtitle,
  slot,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  slot: { male: LeaderRow[]; female: LeaderRow[] };
}) {
  return (
    <div className="flex w-full flex-col">
      <PanelHeader icon={icon} title={title} subtitle={subtitle} />
      <div className="mt-6 grid flex-1 min-h-0 grid-cols-2 gap-8">
        <LeaderColumn header="MEN" rows={slot.male} accent="text-blue-300" />
        <LeaderColumn header="WOMEN" rows={slot.female} accent="text-pink-300" />
      </div>
    </div>
  );
}

function LeaderColumn({
  header,
  rows,
  accent,
}: {
  header: string;
  rows: LeaderRow[];
  accent: string;
}) {
  return (
    <div className="flex flex-col rounded-3xl bg-zinc-900/50 p-8 ring-1 ring-white/5">
      <div className={`mb-6 text-3xl font-bold tracking-widest ${accent}`}>{header}</div>
      {rows.length === 0 ? (
        <EmptyState text="No lifts logged yet this month" />
      ) : (
        <div className="space-y-4">
          {rows.map((r, i) => (
            <LeaderRowView key={`${r.clientName}-${i}`} rank={i + 1} row={r} />
          ))}
        </div>
      )}
    </div>
  );
}

function LeaderRowView({ rank, row }: { rank: number; row: LeaderRow }) {
  return (
    <div className="flex items-center gap-5">
      <RankPill rank={rank} />
      <Avatar src={row.profileImageUrl} name={row.clientName} size="md" />
      <div className="flex flex-1 items-baseline justify-between gap-4 min-w-0">
        <div className="truncate text-4xl font-semibold">{row.clientName}</div>
        <div className="text-5xl font-bold tabular-nums text-orange-400">
          {row.weightKg.toFixed(1)}
          <span className="text-2xl text-zinc-400"> kg</span>
        </div>
      </div>
    </div>
  );
}

// ─── Volume (gendered) ─────────────────────────────────────────────────────

interface VolumeRow {
  clientName: string;
  profileImageUrl: string | null;
  totalVolumeKg: number;
}

function VolumePanel({ data }: { data: { male: VolumeRow[]; female: VolumeRow[] } }) {
  return (
    <div className="flex w-full flex-col">
      <PanelHeader
        icon={<Flame className={`${HEADER_ICON_CLASS} text-orange-500`} />}
        title="Volume Kings"
        subtitle="Most total weight moved this month"
      />
      <div className="mt-6 grid flex-1 min-h-0 grid-cols-2 gap-8">
        <VolumeColumn header="MEN" rows={data.male} accent="text-blue-300" />
        <VolumeColumn header="WOMEN" rows={data.female} accent="text-pink-300" />
      </div>
    </div>
  );
}

function VolumeColumn({
  header,
  rows,
  accent,
}: {
  header: string;
  rows: VolumeRow[];
  accent: string;
}) {
  return (
    <div className="flex flex-col rounded-3xl bg-zinc-900/50 p-8 ring-1 ring-white/5">
      <div className={`mb-6 text-3xl font-bold tracking-widest ${accent}`}>{header}</div>
      {rows.length === 0 ? (
        <EmptyState text="No volume data yet this month" />
      ) : (
        <div className="space-y-4">
          {rows.map((r, i) => (
            <div key={`${r.clientName}-${i}`} className="flex items-center gap-5">
              <RankPill rank={i + 1} />
              <Avatar src={r.profileImageUrl} name={r.clientName} size="md" />
              <div className="flex flex-1 items-baseline justify-between gap-4 min-w-0">
                <div className="truncate text-4xl font-semibold">{r.clientName}</div>
                <div className="text-5xl font-bold tabular-nums text-orange-400">
                  {formatTons(r.totalVolumeKg)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatTons(kg: number): string {
  if (kg >= 1000) return `${(kg / 1000).toFixed(1)} t`;
  return `${Math.round(kg)} kg`;
}

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

// ─── Streaks ───────────────────────────────────────────────────────────────

interface StreakRow {
  clientName: string;
  profileImageUrl: string | null;
  streakDays: number;
}

function StreakPanel({ data }: { data: StreakRow[] }) {
  return (
    <div className="flex w-full flex-col">
      <PanelHeader
        icon={<Flame className={`${HEADER_ICON_CLASS} text-orange-500`} />}
        title="Hottest Streaks"
        subtitle="Consecutive sessions completed"
      />
      <div className="mt-8 flex-1 min-h-0 rounded-3xl bg-zinc-900/50 p-10 ring-1 ring-white/5">
        {data.length === 0 ? (
          <EmptyState text="No active streaks" />
        ) : (
          <div className="space-y-6">
            {data.map((r, i) => (
              <div key={`${r.clientName}-${i}`} className="flex items-center gap-8">
                <RankPill rank={i + 1} size="lg" />
                <Avatar src={r.profileImageUrl} name={r.clientName} size="lg" />
                <div className="flex flex-1 items-baseline justify-between gap-4 min-w-0">
                  <div className="truncate text-5xl font-semibold">{r.clientName}</div>
                  <div className="text-6xl font-bold tabular-nums text-orange-400">
                    {r.streakDays}
                    <span className="text-3xl text-zinc-400"> sessions</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Badges this month ─────────────────────────────────────────────────────

interface BadgeRow {
  clientName: string;
  profileImageUrl: string | null;
  badgeName: string;
  badgeIcon: string;
  awardedAt: string;
}

function BadgePanel({ data }: { data: BadgeRow[] }) {
  return (
    <div className="flex w-full flex-col">
      <PanelHeader
        icon={<Medal className={`${HEADER_ICON_CLASS} text-yellow-400`} />}
        title="Badges Unlocked"
        subtitle="Milestones hit this month"
      />
      <div className="mt-8 flex-1 min-h-0 rounded-3xl bg-zinc-900/50 p-10 ring-1 ring-white/5">
        {data.length === 0 ? (
          <EmptyState text="No new badges yet this month" />
        ) : (
          <div className="grid grid-cols-2 gap-6">
            {data.slice(0, 6).map((b, i) => (
              <div
                key={`${b.clientName}-${b.badgeName}-${i}`}
                className="flex items-center gap-5 rounded-2xl bg-black/30 p-5"
              >
                <div className="text-7xl">{b.badgeIcon}</div>
                <div className="flex-1 min-w-0">
                  <div className="truncate text-3xl font-bold">{b.clientName}</div>
                  <div className="truncate text-2xl text-orange-300">{b.badgeName}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Latest PRs ────────────────────────────────────────────────────────────

interface PrRow {
  clientName: string;
  profileImageUrl: string | null;
  exerciseName: string;
  weightKg: number;
  reps: number | null;
  achievedAt: string;
}

function LatestPrPanel({ data }: { data: PrRow[] }) {
  return (
    <div className="flex w-full flex-col">
      <PanelHeader
        icon={<Zap className={`${HEADER_ICON_CLASS} text-yellow-300`} />}
        title="Latest Personal Records"
        subtitle="Last 7 days"
      />
      <div className="mt-8 flex-1 min-h-0 rounded-3xl bg-zinc-900/50 p-10 ring-1 ring-white/5">
        {data.length === 0 ? (
          <EmptyState text="No recent PRs" />
        ) : (
          <div className="space-y-5">
            {data.slice(0, 6).map((r, i) => (
              <div key={`${r.clientName}-${i}`} className="flex items-center gap-6">
                <Avatar src={r.profileImageUrl} name={r.clientName} size="md" />
                <div className="flex-1 min-w-0">
                  <div className="truncate text-3xl font-semibold">{r.clientName}</div>
                  <div className="truncate text-2xl text-zinc-400">{r.exerciseName}</div>
                </div>
                <div className="text-5xl font-bold tabular-nums text-orange-400">
                  {r.weightKg.toFixed(1)}
                  <span className="text-2xl text-zinc-400"> kg</span>
                  {r.reps && <span className="text-2xl text-zinc-400"> × {r.reps}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Perfect attendance ────────────────────────────────────────────────────

interface AttendanceRow {
  clientName: string;
  profileImageUrl: string | null;
  completedCount: number;
}

function PerfectAttendancePanel({ data }: { data: AttendanceRow[] }) {
  return (
    <div className="flex w-full flex-col">
      <PanelHeader
        icon={<Target className={`${HEADER_ICON_CLASS} text-emerald-400`} />}
        title="Perfect Attendance"
        subtitle="100% this month — every session counted"
      />
      <div className="mt-8 flex-1 min-h-0 rounded-3xl bg-zinc-900/50 p-10 ring-1 ring-white/5">
        {data.length === 0 ? (
          <EmptyState text="No perfect attendance yet this month" />
        ) : (
          <div className="space-y-6">
            {data.map((r, i) => (
              <div key={`${r.clientName}-${i}`} className="flex items-center gap-8">
                <BadgeCheck className="h-14 w-14 shrink-0 text-emerald-400" />
                <Avatar src={r.profileImageUrl} name={r.clientName} size="lg" />
                <div className="flex flex-1 items-baseline justify-between gap-4 min-w-0">
                  <div className="truncate text-5xl font-semibold">{r.clientName}</div>
                  <div className="text-5xl font-bold tabular-nums text-emerald-400">
                    {r.completedCount}
                    <span className="text-2xl text-zinc-400"> sessions</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Live now ──────────────────────────────────────────────────────────────

interface LiveSessionRow {
  trainerName: string;
  clientName: string;
  startedAt: string;
}

function LiveNowPanel({
  data,
  now,
}: {
  data: { count: number; sessions: LiveSessionRow[] };
  now: number;
}) {
  return (
    <div className="flex w-full flex-col">
      <PanelHeader
        icon={<Timer className={`${HEADER_ICON_CLASS} text-red-400`} />}
        title="Training Right Now"
        subtitle={`${data.count} ${data.count === 1 ? 'session' : 'sessions'} in progress`}
      />
      <div className="mt-8 flex-1 min-h-0 rounded-3xl bg-zinc-900/50 p-10 ring-1 ring-white/5">
        {data.count === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-5xl text-zinc-500">No active sessions</div>
          </div>
        ) : data.sessions.length === 0 ? (
          // Sessions exist but none are showOnTv — show count only
          <div className="flex h-full items-center justify-center">
            <div className="text-center space-y-4">
              <div className="text-9xl font-bold text-orange-400 tabular-nums animate-pulse">
                {data.count}
              </div>
              <div className="text-3xl text-zinc-400">Sessions in progress</div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-6">
            {data.sessions.slice(0, 8).map((s, i) => (
              <div
                key={`${s.clientName}-${i}`}
                className="rounded-2xl bg-black/30 p-6 ring-1 ring-orange-500/20"
              >
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-3 w-3 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-sm font-bold text-red-400 tracking-widest">LIVE</span>
                  </div>
                  <span className="text-2xl font-semibold tabular-nums text-orange-300">
                    {formatElapsed(now - new Date(s.startedAt).getTime())}
                  </span>
                </div>
                <div className="text-3xl font-bold truncate">{s.clientName}</div>
                <div className="text-xl text-zinc-400 truncate">with {s.trainerName}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Shared bits ───────────────────────────────────────────────────────────

function PanelHeader({
  icon,
  title,
  subtitle,
}: {
  icon?: ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div>
      <h2 className="flex items-center gap-5 text-7xl font-bold tracking-tight">
        {icon}
        <span>{title}</span>
      </h2>
      <p className="mt-2 text-3xl text-zinc-400">{subtitle}</p>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-3xl text-zinc-500">{text}</div>
    </div>
  );
}

function RankPill({ rank, size = 'md' }: { rank: number; size?: 'md' | 'lg' }) {
  const dim = size === 'lg' ? 'h-16 w-16 text-3xl' : 'h-12 w-12 text-2xl';
  const bg =
    rank === 1
      ? 'bg-gradient-to-br from-yellow-400 to-orange-500 text-black'
      : rank === 2
        ? 'bg-gradient-to-br from-zinc-300 to-zinc-500 text-black'
        : rank === 3
          ? 'bg-gradient-to-br from-amber-700 to-amber-900 text-white'
          : 'bg-zinc-800 text-zinc-300';
  return (
    <div className={`flex items-center justify-center rounded-full font-bold ${dim} ${bg}`}>
      {rank}
    </div>
  );
}

function Avatar({ src, name, size }: { src: string | null; name: string; size: 'md' | 'lg' }) {
  const dim = size === 'lg' ? 'h-20 w-20 text-3xl' : 'h-14 w-14 text-2xl';
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join('')
    .toUpperCase();
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        className={`shrink-0 rounded-full object-cover ring-2 ring-zinc-700 ${dim}`}
      />
    );
  }
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full bg-zinc-800 font-bold text-orange-300 ring-2 ring-zinc-700 ${dim}`}
    >
      {initials}
    </div>
  );
}
