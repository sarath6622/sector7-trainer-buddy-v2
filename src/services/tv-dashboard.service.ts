import { prisma } from '@/lib/prisma';
import { getTvControlState } from '@/services/tv-control.service';
import { listLiveAnnouncements, type TvAnnouncementRow } from '@/services/tv-announcement.service';
import { listUpcomingEvents, type TvEventRow } from '@/services/tv-event.service';

// ─── Types ────────────────────────────────────────────

export interface LeaderRow {
  // Stable identity for React keying — lets TvPanel animate rank swaps with
  // Framer Motion `layout` instead of remounting on every re-rank (ADR-038).
  clientProfileId: string;
  clientName: string;
  profileImageUrl: string | null;
  weightKg: number;
  reps: number | null;
  achievedAt: string; // ISO
}

export interface VolumeRow {
  clientName: string;
  profileImageUrl: string | null;
  totalVolumeKg: number;
}

export interface StreakRow {
  clientName: string;
  profileImageUrl: string | null;
  streakDays: number;
}

export interface BadgeUnlockRow {
  clientName: string;
  profileImageUrl: string | null;
  badgeName: string;
  badgeIcon: string;
  awardedAt: string;
}

export interface PrFeedRow {
  clientName: string;
  profileImageUrl: string | null;
  exerciseName: string;
  weightKg: number;
  reps: number | null;
  achievedAt: string;
}

export interface AttendanceRow {
  clientName: string;
  profileImageUrl: string | null;
  completedCount: number;
}

export interface LiveSessionRow {
  trainerName: string;
  clientName: string;
  startedAt: string;
}

export interface CompoundLeaderboards {
  bench: { male: LeaderRow[]; female: LeaderRow[] };
  squat: { male: LeaderRow[]; female: LeaderRow[] };
  deadlift: { male: LeaderRow[]; female: LeaderRow[] };
  ohp: { male: LeaderRow[]; female: LeaderRow[] };
}

export interface TvDashboardPayload {
  generatedAt: string;
  month: string;
  branchId: string;
  branchName: string;
  panels: {
    compoundLeaderboards: CompoundLeaderboards;
    volumeKings: { male: VolumeRow[]; female: VolumeRow[] };
    streaks: StreakRow[];
    badgesThisMonth: BadgeUnlockRow[];
    latestPRs: PrFeedRow[];
    perfectAttendance: AttendanceRow[];
    liveNow: { count: number; sessions: LiveSessionRow[] };
    announcements: TvAnnouncementRow[];
    upcomingEvents: TvEventRow[];
  };
  control: {
    pinnedPanels: string[];
    shoutout: { message: string; expiresAt: string } | null;
  };
}

// ─── Constants ────────────────────────────────────────

const TOP_N_PER_PANEL = 5;
const LEADERBOARD_LIMIT = 5;

/**
 * Slot name → list of substrings to match against `Exercise.name`
 * (case-insensitive). Picks the first matching compound exercise per slot.
 */
const COMPOUND_SLOTS = [
  { key: 'bench', nameContains: ['bench press', 'bench'] },
  { key: 'squat', nameContains: ['back squat', 'squat'] },
  { key: 'deadlift', nameContains: ['deadlift'] },
  { key: 'ohp', nameContains: ['overhead press', 'shoulder press', 'military press'] },
] as const;

// Internal: non-null variant used for the `Record<…, exerciseId | null>` map
// in resolveCompoundSlotExercises. The public-facing slot key (the one Pusher
// payloads carry to the TV) is nullable — see CompoundSlotKey below.
type CompoundSlotKeyName = (typeof COMPOUND_SLOTS)[number]['key'];
export type CompoundSlotKey = CompoundSlotKeyName | null;

// ─── Cache ────────────────────────────────────────────

interface CacheEntry {
  expiresAt: number;
  payload: TvDashboardPayload;
}
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60_000;

function cacheKey(branchId: string, month: string): string {
  return `${branchId}:${month}`;
}

/** Test/debug helper — clear cached payloads. */
export function clearTvDashboardCache(): void {
  cache.clear();
}

/**
 * Invalidate every cached month-payload for a single branch. Called by the
 * workout-save path on a fresh compound PR (ADR-038) so the TV's immediate
 * Pusher-triggered refetch reads the new top-N instead of a stale snapshot.
 */
export function invalidateTvDashboardCacheForBranch(branchId: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(`${branchId}:`)) cache.delete(key);
  }
}

/**
 * Map an exercise name to one of the four compound rotation slots on the TV
 * (bench / squat / deadlift / ohp). Returns null when the exercise isn't a
 * displayed compound — the TV refetches but does not jump (ADR-038).
 * Mirrors the substring matching used by resolveCompoundSlotExercises so the
 * same exercise resolves identically on both the read and the emit sides.
 */
export function resolveCompoundSlotKey(exerciseName: string): CompoundSlotKey {
  const lower = exerciseName.toLowerCase();
  for (const slot of COMPOUND_SLOTS) {
    if (slot.nameContains.some((n) => lower.includes(n.toLowerCase()))) {
      return slot.key;
    }
  }
  return null;
}

// ─── Month helpers ────────────────────────────────────

function parseMonth(month: string | undefined): { start: Date; end: Date; label: string } {
  const now = new Date();
  const label =
    month ?? `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const [yStr, mStr] = label.split('-');
  const year = Number(yStr);
  const monthIdx = Number(mStr) - 1;
  const start = new Date(Date.UTC(year, monthIdx, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, monthIdx + 1, 1, 0, 0, 0));
  return { start, end, label };
}

function fullName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.trim();
}

// ─── Slot exercise resolution ─────────────────────────

async function resolveCompoundSlotExercises(): Promise<Record<CompoundSlotKeyName, string | null>> {
  const compoundExercises = await prisma.exercise.findMany({
    where: { isCompound: true, isActive: true },
    select: { id: true, name: true },
  });

  const result = {} as Record<CompoundSlotKeyName, string | null>;
  for (const slot of COMPOUND_SLOTS) {
    const match = compoundExercises.find((ex) =>
      slot.nameContains.some((needle) => ex.name.toLowerCase().includes(needle.toLowerCase())),
    );
    result[slot.key] = match?.id ?? null;
  }
  return result;
}

// ─── Compound lift leaderboards (gendered, month-scoped, opt-in) ──────────

async function getCompoundLeaderboardForExercise(
  branchId: string,
  exerciseId: string,
  gender: 'MALE' | 'FEMALE',
  start: Date,
  end: Date,
): Promise<LeaderRow[]> {
  const rows = await prisma.$queryRaw<
    Array<{
      clientProfileId: string;
      firstName: string;
      lastName: string;
      profileImageUrl: string | null;
      maxWeightKg: number;
      reps: number | null;
      achievedAt: Date;
    }>
  >`
    SELECT
      cp.id                     AS "clientProfileId",
      u."firstName",
      u."lastName",
      u."profileImageUrl",
      MAX(ws."weightKg")::float AS "maxWeightKg",
      ws."reps",
      MAX(ws."createdAt")       AS "achievedAt"
    FROM workout_sets ws
    JOIN workout_logs wl       ON wl.id = ws."workoutLogId"
    JOIN session_instances si  ON si.id = wl."sessionInstanceId"
    JOIN client_profiles cp    ON cp.id = si."clientProfileId"
    JOIN users u               ON u.id = cp."userId"
    WHERE
      si."branchId"     = ${branchId}
      AND wl."exerciseId" = ${exerciseId}
      AND ws."weightKg"   IS NOT NULL
      AND ws."createdAt"  >= ${start}
      AND ws."createdAt"  <  ${end}
      AND cp."gender"     = ${gender}::"Gender"
    GROUP BY cp.id, u."firstName", u."lastName", u."profileImageUrl", ws."reps"
    ORDER BY "maxWeightKg" DESC
    LIMIT 50
  `;

  // One row per client — keep their single best lift in the window
  const seen = new Set<string>();
  const result: LeaderRow[] = [];
  for (const r of rows) {
    if (seen.has(r.clientProfileId)) continue;
    seen.add(r.clientProfileId);
    result.push({
      clientProfileId: r.clientProfileId,
      clientName: fullName(r.firstName, r.lastName),
      profileImageUrl: r.profileImageUrl,
      weightKg: Number(r.maxWeightKg),
      reps: r.reps,
      achievedAt: r.achievedAt.toISOString(),
    });
    if (result.length >= LEADERBOARD_LIMIT) break;
  }
  return result;
}

async function getCompoundLeaderboards(
  branchId: string,
  start: Date,
  end: Date,
): Promise<CompoundLeaderboards> {
  const slotMap = await resolveCompoundSlotExercises();

  const fetchSlot = async (exerciseId: string | null) =>
    exerciseId
      ? {
          male: await getCompoundLeaderboardForExercise(branchId, exerciseId, 'MALE', start, end),
          female: await getCompoundLeaderboardForExercise(
            branchId,
            exerciseId,
            'FEMALE',
            start,
            end,
          ),
        }
      : { male: [], female: [] };

  return {
    bench: await fetchSlot(slotMap.bench),
    squat: await fetchSlot(slotMap.squat),
    deadlift: await fetchSlot(slotMap.deadlift),
    ohp: await fetchSlot(slotMap.ohp),
  };
}

// ─── Volume kings (Σ weight × reps) ───────────────────────

async function getVolumeKingsForGender(
  branchId: string,
  gender: 'MALE' | 'FEMALE',
  start: Date,
  end: Date,
): Promise<VolumeRow[]> {
  const rows = await prisma.$queryRaw<
    Array<{
      firstName: string;
      lastName: string;
      profileImageUrl: string | null;
      totalVolumeKg: number;
    }>
  >`
    SELECT
      u."firstName",
      u."lastName",
      u."profileImageUrl",
      SUM(ws."weightKg" * COALESCE(ws."reps", 0))::float AS "totalVolumeKg"
    FROM workout_sets ws
    JOIN workout_logs wl       ON wl.id = ws."workoutLogId"
    JOIN session_instances si  ON si.id = wl."sessionInstanceId"
    JOIN client_profiles cp    ON cp.id = si."clientProfileId"
    JOIN users u               ON u.id = cp."userId"
    WHERE
      si."branchId"    = ${branchId}
      AND ws."weightKg" IS NOT NULL
      AND ws."reps"     IS NOT NULL
      AND ws."createdAt" >= ${start}
      AND ws."createdAt" <  ${end}
      AND cp."gender"    = ${gender}::"Gender"
    GROUP BY cp.id, u."firstName", u."lastName", u."profileImageUrl"
    ORDER BY "totalVolumeKg" DESC
    LIMIT ${TOP_N_PER_PANEL}
  `;

  return rows.map((r) => ({
    clientName: fullName(r.firstName, r.lastName),
    profileImageUrl: r.profileImageUrl,
    totalVolumeKg: Number(r.totalVolumeKg ?? 0),
  }));
}

// ─── Streaks (consecutive completed sessions, current as of now) ──────

async function getCurrentStreaks(branchId: string): Promise<StreakRow[]> {
  // For each opted-in client, walk backwards from their most recent session.
  // A streak breaks on NO_SHOW or CANCELLED; gaps of unscheduled days don't break.
  // We pull the last 50 sessions per client to bound work.
  const clients = await prisma.clientProfile.findMany({
    where: { branchId, showOnTv: true, user: { isActive: true, deletedAt: null } },
    select: {
      id: true,
      user: { select: { firstName: true, lastName: true, profileImageUrl: true } },
      sessionInstances: {
        where: { branchId, status: { in: ['COMPLETED', 'NO_SHOW'] } },
        orderBy: { scheduledDate: 'desc' },
        take: 50,
        select: { status: true, scheduledDate: true },
      },
    },
  });

  const rows: StreakRow[] = [];
  for (const c of clients) {
    let streak = 0;
    for (const s of c.sessionInstances) {
      if (s.status === 'COMPLETED') {
        streak += 1;
      } else {
        break;
      }
    }
    if (streak > 0) {
      rows.push({
        clientName: fullName(c.user.firstName, c.user.lastName),
        profileImageUrl: c.user.profileImageUrl,
        streakDays: streak,
      });
    }
  }
  rows.sort((a, b) => b.streakDays - a.streakDays);
  return rows.slice(0, TOP_N_PER_PANEL);
}

// ─── Badges unlocked this month (scrolling feed) ──────

async function getBadgesThisMonth(
  branchId: string,
  start: Date,
  end: Date,
): Promise<BadgeUnlockRow[]> {
  const badges = await prisma.userBadge.findMany({
    where: {
      branchId,
      awardedAt: { gte: start, lt: end },
      client: { showOnTv: true },
    },
    orderBy: { awardedAt: 'desc' },
    take: 25,
    select: {
      awardedAt: true,
      badgeDefinition: { select: { name: true, icon: true } },
      client: {
        select: { user: { select: { firstName: true, lastName: true, profileImageUrl: true } } },
      },
    },
  });

  return badges.map((b) => ({
    clientName: fullName(b.client.user.firstName, b.client.user.lastName),
    profileImageUrl: b.client.user.profileImageUrl,
    badgeName: b.badgeDefinition.name,
    badgeIcon: b.badgeDefinition.icon,
    awardedAt: b.awardedAt.toISOString(),
  }));
}

// ─── Latest PRs (auto-generated CommunityPosts, last 7 days) ──────

async function getLatestPRs(branchId: string): Promise<PrFeedRow[]> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const posts = await prisma.communityPost.findMany({
    where: {
      branchId,
      isAutoGenerated: true,
      isHidden: false,
      createdAt: { gte: sevenDaysAgo },
      exerciseId: { not: null },
      weightKg: { not: null },
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      weightKg: true,
      reps: true,
      createdAt: true,
      exercise: { select: { name: true } },
      client: {
        select: { user: { select: { firstName: true, lastName: true, profileImageUrl: true } } },
      },
    },
  });

  return posts
    .filter((p) => p.exercise && p.weightKg != null)
    .map((p) => ({
      clientName: fullName(p.client.user.firstName, p.client.user.lastName),
      profileImageUrl: p.client.user.profileImageUrl,
      exerciseName: p.exercise!.name,
      weightKg: p.weightKg!,
      reps: p.reps,
      achievedAt: p.createdAt.toISOString(),
    }));
}

// ─── Perfect attendance (100% completed, this month, ≥1 session) ──────

async function getPerfectAttendance(
  branchId: string,
  start: Date,
  end: Date,
): Promise<AttendanceRow[]> {
  const rows = await prisma.$queryRaw<
    Array<{
      firstName: string;
      lastName: string;
      profileImageUrl: string | null;
      completedCount: bigint;
    }>
  >`
    SELECT
      u."firstName",
      u."lastName",
      u."profileImageUrl",
      COUNT(*)::bigint AS "completedCount"
    FROM session_instances si
    JOIN client_profiles cp ON cp.id = si."clientProfileId"
    JOIN users u            ON u.id = cp."userId"
    WHERE
      si."branchId"      = ${branchId}
      AND si."scheduledDate" >= ${start}
      AND si."scheduledDate" <  ${end}
      AND cp."showOnTv"  = true
      AND cp.id NOT IN (
        SELECT si2."clientProfileId"
        FROM session_instances si2
        WHERE
          si2."branchId" = ${branchId}
          AND si2."scheduledDate" >= ${start}
          AND si2."scheduledDate" <  ${end}
          AND si2."status" IN ('NO_SHOW', 'CANCELLED')
      )
      AND si."status" = 'COMPLETED'
    GROUP BY cp.id, u."firstName", u."lastName", u."profileImageUrl"
    HAVING COUNT(*) > 0
    ORDER BY "completedCount" DESC
    LIMIT ${TOP_N_PER_PANEL}
  `;

  return rows.map((r) => ({
    clientName: fullName(r.firstName, r.lastName),
    profileImageUrl: r.profileImageUrl,
    completedCount: Number(r.completedCount),
  }));
}

// ─── Live now ─────────────────────────────────────────

async function getLiveNow(branchId: string): Promise<{
  count: number;
  sessions: LiveSessionRow[];
}> {
  const live = await prisma.sessionInstance.findMany({
    where: { branchId, status: 'IN_PROGRESS' },
    orderBy: { startedAt: 'asc' },
    take: 20,
    select: {
      startedAt: true,
      client: {
        select: {
          showOnTv: true,
          user: { select: { firstName: true, lastName: true } },
        },
      },
      trainer: {
        select: { user: { select: { firstName: true, lastName: true } } },
      },
    },
  });

  const count = live.length;
  const sessions: LiveSessionRow[] = live
    .filter((s) => s.startedAt)
    .map((s) => ({
      trainerName: fullName(s.trainer.user.firstName, s.trainer.user.lastName),
      clientName: fullName(s.client.user.firstName, s.client.user.lastName),
      startedAt: s.startedAt!.toISOString(),
    }));

  return { count, sessions };
}

// ─── Top-level orchestrator ───────────────────────────

/**
 * Build the full TV dashboard payload for a branch + month. Cached in-process
 * for 60 seconds per (branchId, month) — the TV polls once a minute, so this
 * is sized to roughly one DB round-trip per branch per minute regardless of
 * how many devices are pointed at it.
 */
export async function getTvDashboard({
  branchId,
  month,
}: {
  branchId: string;
  month?: string;
}): Promise<TvDashboardPayload> {
  const { start, end, label } = parseMonth(month);
  const key = cacheKey(branchId, label);

  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.payload;
  }

  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: { name: true },
  });

  const [
    compoundLeaderboards,
    volumeMale,
    volumeFemale,
    streaks,
    badgesThisMonth,
    latestPRs,
    perfectAttendance,
    liveNow,
    control,
    announcements,
    upcomingEvents,
  ] = await Promise.all([
    getCompoundLeaderboards(branchId, start, end),
    getVolumeKingsForGender(branchId, 'MALE', start, end),
    getVolumeKingsForGender(branchId, 'FEMALE', start, end),
    getCurrentStreaks(branchId),
    getBadgesThisMonth(branchId, start, end),
    getLatestPRs(branchId),
    getPerfectAttendance(branchId, start, end),
    getLiveNow(branchId),
    getTvControlState(branchId),
    listLiveAnnouncements(branchId),
    listUpcomingEvents(branchId),
  ]);

  const payload: TvDashboardPayload = {
    generatedAt: new Date().toISOString(),
    month: label,
    branchId,
    branchName: branch?.name ?? '',
    panels: {
      compoundLeaderboards,
      volumeKings: { male: volumeMale, female: volumeFemale },
      streaks,
      badgesThisMonth,
      latestPRs,
      perfectAttendance,
      liveNow,
      announcements,
      upcomingEvents,
    },
    control,
  };

  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, payload });
  return payload;
}
