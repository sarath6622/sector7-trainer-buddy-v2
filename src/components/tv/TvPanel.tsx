'use client';

import type { ReactNode } from 'react';
import {
  BadgeCheck,
  Crown,
  Flame,
  MapPin,
  Medal,
  Megaphone,
  Plus,
  Target,
  Timer,
  User,
  Zap,
} from 'lucide-react';
import type {
  AnnouncementSlide,
  TvDashboardPayload,
  UpcomingEvent,
} from '@/components/tv/TvDashboard';

const HEADER_ICON_CLASS = 'h-20 w-20 shrink-0 text-orange-400';

type Accent = 'blue' | 'pink';
type Gender = 'male' | 'female';

interface Props {
  panelKey: string;
  data: TvDashboardPayload;
  now: number;
  announcement?: AnnouncementSlide;
}

export function TvPanel({ panelKey, data, now, announcement }: Props) {
  const panels = data.panels;
  switch (panelKey) {
    case 'announcement':
      return announcement ? <AnnouncementPanel slide={announcement} /> : null;
    case 'liveNow':
      return <LiveNowPanel data={panels.liveNow} now={now} />;
    case 'bench':
      return <CompoundLiftPanel slot={panels.compoundLeaderboards.bench} />;
    case 'squat':
      return <CompoundLiftPanel slot={panels.compoundLeaderboards.squat} />;
    case 'deadlift':
      return <CompoundLiftPanel slot={panels.compoundLeaderboards.deadlift} />;
    case 'ohp':
      return <CompoundLiftPanel slot={panels.compoundLeaderboards.ohp} />;
    case 'volume':
      return <VolumePanel data={panels.volumeKings} />;
    case 'streaks':
      return <StreakPanel data={panels.streaks} />;
    case 'latestPRs':
      return <LatestPrPanel data={panels.latestPRs} />;
    case 'events':
      return <EventsPanel data={panels.upcomingEvents} now={now} />;
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

function CompoundLiftPanel({ slot }: { slot: { male: LeaderRow[]; female: LeaderRow[] } }) {
  return (
    <div className="grid w-full flex-1 min-h-0 grid-cols-2 gap-6">
      <LeaderColumn header="MEN" rows={slot.male.slice(0, 3)} accent="blue" gender="male" />
      <LeaderColumn header="WOMEN" rows={slot.female.slice(0, 3)} accent="pink" gender="female" />
    </div>
  );
}

function LeaderColumn({
  header,
  rows,
  accent,
  gender,
}: {
  header: string;
  rows: LeaderRow[];
  accent: Accent;
  gender: Gender;
}) {
  const a = accentClasses(accent);
  return (
    <div className="flex flex-col rounded-3xl bg-gradient-to-b from-zinc-900/80 to-zinc-950/70 p-7 ring-1 ring-white/5 shadow-2xl">
      <div
        className={`mb-5 flex items-center gap-3 text-3xl font-extrabold tracking-widest ${a.text}`}
      >
        <User className={`h-9 w-9 ${a.text}`} />
        {header}
      </div>
      {rows.length === 0 ? (
        <EmptyState text="No lifts logged yet this month" />
      ) : (
        <div className="flex flex-1 flex-col gap-4">
          {rows.map((r, i) => (
            <LeaderRowCard
              key={`${r.clientName}-${i}`}
              rank={i + 1}
              row={r}
              accent={accent}
              gender={gender}
            />
          ))}
        </div>
      )}
      <div
        className={`mt-5 flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed py-4 ${a.dashed}`}
      >
        <Plus className="h-7 w-7" />
        <span className="text-2xl font-semibold">View Full Leaderboard</span>
      </div>
    </div>
  );
}

function LeaderRowCard({
  rank,
  row,
  accent,
  gender,
}: {
  rank: number;
  row: LeaderRow;
  accent: Accent;
  gender: Gender;
}) {
  const a = accentClasses(accent);
  return (
    <div className="flex items-stretch overflow-hidden rounded-2xl bg-black/40 ring-1 ring-white/5">
      <RankBadge rank={rank} accent={accent} />
      <div className="flex flex-1 flex-col justify-center min-w-0 gap-2 px-6 py-4">
        <div className="truncate text-4xl font-bold leading-tight">{row.clientName}</div>
        <div>
          <div className={`text-6xl font-extrabold tabular-nums leading-none ${a.text}`}>
            {row.weightKg.toFixed(1)}
            <span className="ml-1 text-2xl font-bold text-zinc-400">KG</span>
          </div>
          <div className="mt-1 text-sm uppercase tracking-widest text-zinc-500">
            {row.reps ? `${row.reps} rep${row.reps === 1 ? '' : 's'}` : 'Elite Member'}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center pr-5 py-3">
        <Avatar
          src={row.profileImageUrl}
          name={row.clientName}
          size="3xl"
          gender={gender}
          accent={accent}
        />
      </div>
    </div>
  );
}

function RankBadge({ rank, accent }: { rank: number; accent: Accent }) {
  if (rank === 1) {
    const grad =
      accent === 'blue'
        ? 'from-blue-500 via-blue-600 to-blue-800'
        : 'from-pink-500 via-pink-600 to-pink-800';
    return (
      <div
        className={`flex w-20 shrink-0 flex-col items-center justify-center gap-1 bg-gradient-to-b ${grad}`}
      >
        <Crown className="h-7 w-7 text-yellow-300 drop-shadow" />
        <div className="text-4xl font-extrabold text-white">1</div>
      </div>
    );
  }
  return (
    <div className="flex w-20 shrink-0 items-center justify-center bg-zinc-800/80">
      <div className="text-4xl font-extrabold text-zinc-300">{rank}</div>
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
    <div className="flex w-full flex-1 min-h-0 flex-col">
      <CenteredPanelTitle
        icon={<Flame className={`${HEADER_ICON_CLASS} text-orange-500`} />}
        title="Volume Kings"
        subtitle="Most total weight moved this month"
      />
      <div className="mt-4 grid flex-1 min-h-0 grid-cols-2 gap-6">
        <VolumeColumn header="MEN" rows={data.male.slice(0, 3)} accent="blue" gender="male" />
        <VolumeColumn header="WOMEN" rows={data.female.slice(0, 3)} accent="pink" gender="female" />
      </div>
    </div>
  );
}

function VolumeColumn({
  header,
  rows,
  accent,
  gender,
}: {
  header: string;
  rows: VolumeRow[];
  accent: Accent;
  gender: Gender;
}) {
  const a = accentClasses(accent);
  return (
    <div className="flex flex-col rounded-3xl bg-gradient-to-b from-zinc-900/80 to-zinc-950/70 p-7 ring-1 ring-white/5 shadow-2xl">
      <div
        className={`mb-5 flex items-center gap-3 text-3xl font-extrabold tracking-widest ${a.text}`}
      >
        <User className="h-9 w-9" />
        {header}
      </div>
      {rows.length === 0 ? (
        <EmptyState text="No volume data yet this month" />
      ) : (
        <div className="flex flex-1 flex-col gap-4">
          {rows.map((r, i) => (
            <div
              key={`${r.clientName}-${i}`}
              className="flex items-stretch overflow-hidden rounded-2xl bg-black/40 ring-1 ring-white/5"
            >
              <RankBadge rank={i + 1} accent={accent} />
              <div className="flex shrink-0 items-center pl-4 pr-2 py-3">
                <Avatar
                  src={r.profileImageUrl}
                  name={r.clientName}
                  size="2xl"
                  gender={gender}
                  accent={accent}
                />
              </div>
              <div className="flex flex-1 items-center px-4 min-w-0">
                <div className="flex flex-col min-w-0">
                  <div className="truncate text-4xl font-bold">{r.clientName}</div>
                  <div className="truncate text-xl text-zinc-500">Elite Member</div>
                </div>
              </div>
              <div className="flex items-center pr-6">
                <div className={`text-6xl font-extrabold tabular-nums ${a.text}`}>
                  {formatTons(r.totalVolumeKg)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <div
        className={`mt-5 flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed py-4 ${a.dashed}`}
      >
        <Plus className="h-7 w-7" />
        <span className="text-2xl font-semibold">View Full Leaderboard</span>
      </div>
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
    <div className="flex w-full flex-1 min-h-0 flex-col">
      <CenteredPanelTitle
        icon={<Flame className={`${HEADER_ICON_CLASS} text-orange-500`} />}
        title="Hottest Streaks"
        subtitle="Consecutive sessions completed"
      />
      <div className="mt-4 flex-1 min-h-0 rounded-3xl bg-zinc-900/60 p-8 ring-1 ring-white/5">
        {data.length === 0 ? (
          <EmptyState text="No active streaks" />
        ) : (
          <div className="space-y-5">
            {data.map((r, i) => (
              <div key={`${r.clientName}-${i}`} className="flex items-center gap-6">
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
    <div className="flex w-full flex-1 min-h-0 flex-col">
      <CenteredPanelTitle
        icon={<Medal className={`${HEADER_ICON_CLASS} text-yellow-400`} />}
        title="Badges Unlocked"
        subtitle="Milestones hit this month"
      />
      <div className="mt-4 flex-1 min-h-0 rounded-3xl bg-zinc-900/60 p-8 ring-1 ring-white/5">
        {data.length === 0 ? (
          <EmptyState text="No new badges yet this month" />
        ) : (
          <div className="grid grid-cols-2 gap-5">
            {data.slice(0, 6).map((b, i) => (
              <div
                key={`${b.clientName}-${b.badgeName}-${i}`}
                className="flex items-center gap-5 rounded-2xl bg-black/40 p-5 ring-1 ring-white/5"
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
    <div className="flex w-full flex-1 min-h-0 flex-col">
      <div className="flex flex-1 min-h-0 flex-col rounded-3xl bg-gradient-to-b from-zinc-900/80 to-zinc-950/70 p-7 ring-1 ring-white/5 shadow-2xl">
        {data.length === 0 ? (
          <EmptyState text="No recent PRs" />
        ) : (
          <div className="grid flex-1 grid-cols-2 gap-4 content-start">
            {data.slice(0, 6).map((r, i) => (
              <div
                key={`${r.clientName}-${i}`}
                className="flex items-stretch overflow-hidden rounded-2xl bg-black/40 ring-1 ring-white/5"
              >
                <div className="flex w-16 shrink-0 items-center justify-center bg-gradient-to-b from-yellow-500 via-orange-500 to-orange-700">
                  <Zap className="h-7 w-7 text-white" />
                </div>
                <div className="flex shrink-0 items-center pl-3 pr-1 py-2">
                  <Avatar src={r.profileImageUrl} name={r.clientName} size="lg" />
                </div>
                <div className="flex flex-1 items-center gap-3 px-2 min-w-0">
                  <div className="flex flex-col min-w-0">
                    <div className="truncate text-2xl font-bold">{r.clientName}</div>
                    <div className="truncate text-base text-zinc-400">{r.exerciseName}</div>
                  </div>
                </div>
                <div className="flex items-center pr-4">
                  <div className="text-3xl font-extrabold tabular-nums text-orange-400">
                    {r.weightKg.toFixed(0)}
                    <span className="ml-0.5 text-base font-bold text-zinc-400">KG</span>
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

// ─── Perfect attendance ────────────────────────────────────────────────────

interface AttendanceRow {
  clientName: string;
  profileImageUrl: string | null;
  completedCount: number;
}

function PerfectAttendancePanel({ data }: { data: AttendanceRow[] }) {
  return (
    <div className="flex w-full flex-1 min-h-0 flex-col">
      <CenteredPanelTitle
        icon={<Target className={`${HEADER_ICON_CLASS} text-emerald-400`} />}
        title="Perfect Attendance"
        subtitle="100% this month — every session counted"
      />
      <div className="mt-4 flex-1 min-h-0 rounded-3xl bg-zinc-900/60 p-8 ring-1 ring-white/5">
        {data.length === 0 ? (
          <EmptyState text="No perfect attendance yet this month" />
        ) : (
          <div className="space-y-5">
            {data.map((r, i) => (
              <div key={`${r.clientName}-${i}`} className="flex items-center gap-6">
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
    <div className="flex w-full flex-1 min-h-0 flex-col">
      <CenteredPanelTitle
        icon={<Timer className={`${HEADER_ICON_CLASS} text-red-400`} />}
        title="Training Right Now"
        subtitle={`${data.count} ${data.count === 1 ? 'session' : 'sessions'} in progress`}
      />
      <div className="mt-4 flex-1 min-h-0 rounded-3xl bg-zinc-900/60 p-8 ring-1 ring-white/5">
        {data.count === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-5xl text-zinc-500">No active sessions</div>
          </div>
        ) : data.sessions.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center space-y-4">
              <div className="text-9xl font-bold text-orange-400 tabular-nums animate-pulse">
                {data.count}
              </div>
              <div className="text-3xl text-zinc-400">Sessions in progress</div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-5">
            {data.sessions.slice(0, 8).map((s, i) => (
              <div
                key={`${s.clientName}-${i}`}
                className="rounded-2xl bg-black/40 p-5 ring-1 ring-orange-500/20"
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

// ─── Upcoming Events ───────────────────────────────────────────────────────

function EventsPanel({ data, now }: { data: UpcomingEvent[]; now: number }) {
  return (
    <div className="flex w-full flex-1 min-h-0 flex-col rounded-3xl bg-gradient-to-b from-zinc-900/80 to-zinc-950/70 p-7 ring-1 ring-white/5 shadow-2xl">
      {data.length === 0 ? (
        <EmptyState text="No upcoming events" />
      ) : (
        <div className="grid flex-1 min-h-0 grid-cols-1 gap-4 content-start">
          {data.slice(0, 5).map((e) => (
            <EventCard key={e.id} event={e} now={now} />
          ))}
        </div>
      )}
    </div>
  );
}

function EventCard({ event, now }: { event: UpcomingEvent; now: number }) {
  const when = new Date(event.eventAt);
  const countdown = formatCountdown(when.getTime() - now);
  return (
    <div className="flex items-stretch overflow-hidden rounded-2xl bg-black/40 ring-1 ring-sky-500/20">
      {/* Date block on the left — day-of-month + short month, sky accent */}
      <div className="flex w-32 shrink-0 flex-col items-center justify-center gap-1 bg-gradient-to-b from-sky-500 via-sky-600 to-sky-800 px-2 py-3">
        <div className="text-xs font-semibold uppercase tracking-widest text-sky-100/80">
          {when.toLocaleDateString('en-IN', { month: 'short' }).toUpperCase()}
        </div>
        <div className="text-5xl font-extrabold leading-none text-white tabular-nums">
          {when.getDate()}
        </div>
        <div className="text-xs font-semibold uppercase tracking-widest text-sky-100/80">
          {when.toLocaleDateString('en-IN', { weekday: 'short' }).toUpperCase()}
        </div>
      </div>

      {/* Icon */}
      <div className="flex w-24 shrink-0 items-center justify-center">
        <div className="text-6xl leading-none">{event.icon ?? '📅'}</div>
      </div>

      {/* Title + meta */}
      <div className="flex flex-1 flex-col justify-center gap-1 px-3 min-w-0 py-3">
        <div className="truncate text-3xl font-bold text-white">{event.title}</div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 text-lg text-zinc-400">
          <span className="tabular-nums">
            {when.toLocaleTimeString('en-IN', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            })}
          </span>
          {event.location && (
            <span className="flex items-center gap-1.5 truncate">
              <MapPin className="h-4 w-4 shrink-0" />
              <span className="truncate">{event.location}</span>
            </span>
          )}
        </div>
        {event.description && (
          <div className="truncate text-base text-zinc-500">{event.description}</div>
        )}
      </div>

      {/* Countdown chip */}
      <div className="flex items-center pr-6">
        <div className="flex flex-col items-end">
          <div className="text-3xl font-extrabold tabular-nums text-sky-400">{countdown}</div>
          <div className="text-xs uppercase tracking-widest text-zinc-500">to go</div>
        </div>
      </div>
    </div>
  );
}

/** Compact "in X" countdown — days for >24h, hours-minutes otherwise. */
function formatCountdown(ms: number): string {
  if (ms <= 0) return 'now';
  const totalMin = Math.floor(ms / 60_000);
  const days = Math.floor(totalMin / (60 * 24));
  if (days >= 1) return `${days}d`;
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  if (hours >= 1) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

// ─── Announcement ──────────────────────────────────────────────────────────

function AnnouncementPanel({ slide }: { slide: AnnouncementSlide }) {
  return (
    <div className="relative flex w-full flex-1 min-h-0 items-center justify-center overflow-hidden rounded-3xl bg-zinc-950 ring-2 ring-yellow-400/40">
      {/* Animated colour blobs in opposite corners — gives the slide energy */}
      <div className="pointer-events-none absolute -top-40 -left-40 h-[28rem] w-[28rem] rounded-full bg-yellow-500/25 blur-3xl animate-pulse" />
      <div
        className="pointer-events-none absolute -bottom-40 -right-40 h-[28rem] w-[28rem] rounded-full bg-orange-500/30 blur-3xl animate-pulse"
        style={{ animationDelay: '1.5s' }}
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(251,191,36,0.18),transparent_55%)]" />

      <div className="relative flex max-w-6xl flex-col items-center gap-10 px-12 py-10 text-center">
        {/* Hero: emoji if provided, else a glowing megaphone medallion */}
        {slide.icon ? (
          <div className="relative">
            <div className="pointer-events-none absolute inset-0 rounded-full bg-yellow-400/30 blur-3xl" />
            <div className="relative text-[12rem] leading-none drop-shadow-[0_0_50px_rgba(251,191,36,0.6)]">
              {slide.icon}
            </div>
          </div>
        ) : (
          <div className="relative">
            <div className="pointer-events-none absolute inset-0 rounded-full bg-yellow-400/40 blur-2xl animate-pulse" />
            <div className="relative flex h-40 w-40 items-center justify-center rounded-full bg-gradient-to-br from-yellow-400 via-orange-500 to-orange-700 shadow-[0_0_80px_rgba(251,191,36,0.6)] ring-4 ring-yellow-300/40">
              <Megaphone className="h-20 w-20 text-white" />
            </div>
          </div>
        )}

        {/* Title — massive gradient fill, all-caps for poster energy */}
        <h2 className="text-8xl font-black uppercase leading-[0.95] tracking-tight bg-gradient-to-b from-yellow-50 via-yellow-200 to-orange-400 bg-clip-text text-transparent drop-shadow-[0_4px_30px_rgba(251,191,36,0.4)]">
          {slide.title}
        </h2>

        {/* Body — framed callout so it reads as info, not as subtitle */}
        {slide.body && (
          <div className="rounded-2xl bg-black/70 px-12 py-6 ring-2 ring-yellow-400/50 shadow-2xl backdrop-blur-sm">
            <div className="whitespace-pre-wrap text-5xl font-semibold leading-snug text-zinc-50">
              {slide.body}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Shared bits ───────────────────────────────────────────────────────────

function CenteredPanelTitle({
  icon,
  title,
  subtitle,
}: {
  icon?: ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex flex-col items-center">
      <div className="flex items-center gap-5">
        {icon}
        <h2 className="text-7xl font-extrabold uppercase tracking-tight">{title}</h2>
      </div>
      <div className="mt-2 flex items-center gap-3 text-2xl uppercase tracking-[0.4em] text-zinc-500">
        <span className="text-orange-500">·</span>
        {subtitle}
        <span className="text-orange-500">·</span>
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex h-full flex-1 items-center justify-center">
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

function Avatar({
  src,
  name,
  size,
  gender,
  accent,
}: {
  src: string | null;
  name: string;
  size: 'md' | 'lg' | 'xl' | '2xl' | '3xl';
  gender?: Gender;
  accent?: Accent;
}) {
  const dim =
    size === '3xl'
      ? 'h-56 w-56'
      : size === '2xl'
        ? 'h-36 w-36'
        : size === 'xl'
          ? 'h-20 w-20'
          : size === 'lg'
            ? 'h-16 w-16'
            : 'h-14 w-14';
  const ring =
    accent === 'blue'
      ? 'ring-4 ring-blue-400/60 shadow-lg shadow-blue-500/20'
      : accent === 'pink'
        ? 'ring-4 ring-pink-400/60 shadow-lg shadow-pink-500/20'
        : 'ring-2 ring-white/10';
  const url = src ?? dummyAvatarUrl(name, gender);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={name}
      className={`shrink-0 rounded-full bg-zinc-800 object-cover ${ring} ${dim}`}
    />
  );
}

// Deterministic placeholder avatar — DiceBear avataaars seeded by name + gender
// so the same person always gets the same face across panels. We bias the seed
// with a gender prefix so men/women columns get visually distinct characters
// from the same name pool.
function dummyAvatarUrl(name: string, gender?: Gender): string {
  const slug = name.trim().toLowerCase().replace(/\s+/g, '-');
  const prefix = gender === 'female' ? 'f' : gender === 'male' ? 'm' : 'x';
  const seed = encodeURIComponent(`${prefix}-${slug}`);
  return `https://api.dicebear.com/9.x/avataaars/svg?seed=${seed}&backgroundColor=2a2a2a,1f1f1f,3a3a3a`;
}

function accentClasses(accent: Accent): {
  text: string;
  ring: string;
  dashed: string;
} {
  if (accent === 'blue') {
    return {
      text: 'text-blue-400',
      ring: 'ring-blue-500/50',
      dashed: 'border-blue-500/40 text-blue-300',
    };
  }
  return {
    text: 'text-pink-400',
    ring: 'ring-pink-500/50',
    dashed: 'border-pink-500/40 text-pink-300',
  };
}
