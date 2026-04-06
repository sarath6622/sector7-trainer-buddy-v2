'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Trophy, ArrowLeft, Crown, Flame } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import Link from 'next/link';

// ─── Types ────────────────────────────────────────────

interface CompoundExercise {
  id: string;
  name: string;
  targetMuscleGroup: string;
  category: string;
}

interface LeaderboardEntry {
  rank: number;
  clientProfileId: string;
  firstName: string;
  lastName: string;
  profileImageUrl: string | null;
  maxWeightKg: number;
  reps: number | null;
  achievedAt: string;
}

// ─── Avatar ───────────────────────────────────────────

function Avatar({
  name,
  imageUrl,
  size = 'md',
}: {
  name: string;
  imageUrl?: string | null;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const sizeClass = {
    sm: 'w-9 h-9 text-xs',
    md: 'w-12 h-12 text-sm',
    lg: 'w-16 h-16 text-base',
    xl: 'w-20 h-20 text-xl',
  }[size];

  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={name}
        className={`${sizeClass} rounded-full object-cover ring-2 ring-white/10`}
      />
    );
  }
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <div
      className={`${sizeClass} rounded-full bg-gradient-to-br from-orange-500 to-orange-700 flex items-center justify-center text-white font-bold flex-shrink-0 ring-2 ring-white/10`}
    >
      {initials}
    </div>
  );
}

// ─── Podium top-3 card ────────────────────────────────

function PodiumCard({
  entry,
  isMe,
  position,
}: {
  entry: LeaderboardEntry;
  isMe: boolean;
  position: 1 | 2 | 3;
}) {
  const fullName = `${entry.firstName} ${entry.lastName}`;

  const podiumConfig = {
    1: {
      order: 'order-2',
      height: 'h-28',
      crown: <Crown className="h-6 w-6 text-yellow-400 drop-shadow-glow" />,
      ringColor: 'ring-yellow-400/60',
      bgColor: 'bg-yellow-500/10 border-yellow-500/30',
      nameColor: 'text-yellow-300',
      weight: 'text-2xl',
      podiumBg: 'bg-gradient-to-b from-yellow-500/30 to-yellow-500/10',
      avatarSize: 'xl' as const,
    },
    2: {
      order: 'order-1',
      height: 'h-20',
      crown: <Crown className="h-5 w-5 text-zinc-300" />,
      ringColor: 'ring-zinc-400/60',
      bgColor: 'bg-zinc-500/10 border-zinc-500/30',
      nameColor: 'text-zinc-300',
      weight: 'text-xl',
      podiumBg: 'bg-gradient-to-b from-zinc-500/30 to-zinc-500/10',
      avatarSize: 'lg' as const,
    },
    3: {
      order: 'order-3',
      height: 'h-14',
      crown: <Crown className="h-5 w-5 text-amber-600" />,
      ringColor: 'ring-amber-600/60',
      bgColor: 'bg-amber-900/10 border-amber-700/30',
      nameColor: 'text-amber-400',
      weight: 'text-xl',
      podiumBg: 'bg-gradient-to-b from-amber-700/30 to-amber-700/10',
      avatarSize: 'lg' as const,
    },
  }[position];

  return (
    <div className={`flex flex-col items-center gap-2 ${podiumConfig.order} flex-1`}>
      {/* Crown */}
      <div className="flex flex-col items-center gap-1">
        {podiumConfig.crown}
        {/* Avatar */}
        <div
          className={`relative rounded-full ring-2 ${podiumConfig.ringColor} ${isMe ? 'ring-offset-2 ring-offset-background' : ''}`}
        >
          <Avatar name={fullName} imageUrl={entry.profileImageUrl} size={podiumConfig.avatarSize} />
        </div>
      </div>

      {/* Name & weight */}
      <div className="text-center">
        <p
          className={`font-bold text-sm leading-tight ${podiumConfig.nameColor} ${isMe ? 'underline underline-offset-2' : ''}`}
        >
          {entry.firstName}
          {isMe && <span className="ml-1 text-xs font-normal opacity-70">(you)</span>}
        </p>
        <p className={`font-black ${podiumConfig.weight} text-foreground`}>{entry.maxWeightKg}kg</p>
        {entry.reps && <p className="text-xs text-muted-foreground">{entry.reps} reps</p>}
      </div>

      {/* Podium block */}
      <div
        className={`w-full ${podiumConfig.height} ${podiumConfig.podiumBg} border-t ${podiumConfig.bgColor} rounded-t-xl flex items-center justify-center`}
      >
        <span className="text-3xl font-black text-white/20">{position}</span>
      </div>
    </div>
  );
}

// ─── Row for rank 4+ ──────────────────────────────────

function RankRow({ entry, isMe }: { entry: LeaderboardEntry; isMe: boolean }) {
  const fullName = `${entry.firstName} ${entry.lastName}`;
  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
        isMe
          ? 'bg-orange-500/10 border border-orange-500/30'
          : 'bg-card border border-border/50 hover:border-border'
      }`}
    >
      <span className="w-7 text-center text-sm font-bold text-muted-foreground">{entry.rank}</span>
      <Avatar name={fullName} imageUrl={entry.profileImageUrl} size="sm" />
      <div className="flex-1 min-w-0">
        <p
          className={`font-semibold text-sm truncate ${isMe ? 'text-orange-400' : 'text-foreground'}`}
        >
          {fullName}
          {isMe && <span className="ml-2 text-xs font-normal text-orange-400/70">(you)</span>}
        </p>
        {entry.reps && <p className="text-xs text-muted-foreground">{entry.reps} reps</p>}
      </div>
      <div className="text-right flex-shrink-0">
        <p className="font-bold text-foreground">{entry.maxWeightKg} kg</p>
        <p className="text-xs text-muted-foreground">
          {new Date(entry.achievedAt).toLocaleDateString()}
        </p>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────

export default function LeaderboardPage() {
  const { data: session } = useSession();
  const myClientProfileId = session?.user?.clientProfileId;

  const [exercises, setExercises] = useState<CompoundExercise[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [board, setBoard] = useState<LeaderboardEntry[]>([]);
  const [loadingExercises, setLoadingExercises] = useState(true);
  const [loadingBoard, setLoadingBoard] = useState(false);

  useEffect(() => {
    fetch('/api/community/leaderboard')
      .then((r) => r.json())
      .then(({ data }) => {
        setExercises(data ?? []);
        if (data?.length > 0) setSelectedId(data[0].id);
      })
      .catch(() => toast.error('Failed to load exercises'))
      .finally(() => setLoadingExercises(false));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    async function load() {
      setLoadingBoard(true);
      setBoard([]);
      try {
        const r = await fetch(`/api/community/leaderboard?exerciseId=${selectedId}`);
        const { data } = await r.json();
        if (!cancelled) setBoard(data ?? []);
      } catch {
        if (!cancelled) toast.error('Failed to load leaderboard');
      } finally {
        if (!cancelled) setLoadingBoard(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const top3 = board.slice(0, 3);
  const rest = board.slice(3);

  return (
    <div className="max-w-xl mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/community">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Trophy className="h-6 w-6 text-yellow-400" />
            Leaderboard
          </h1>
          <p className="text-sm text-muted-foreground">Top lifts by compound exercise</p>
        </div>
      </div>

      {/* Exercise pills */}
      {loadingExercises ? (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-9 w-28 flex-shrink-0 rounded-full" />
          ))}
        </div>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-none">
          {exercises.map((ex) => (
            <button
              key={ex.id}
              onClick={() => setSelectedId(ex.id)}
              className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-semibold border transition-all ${
                selectedId === ex.id
                  ? 'bg-orange-500 text-white border-orange-500 shadow-lg shadow-orange-500/25'
                  : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 bg-card'
              }`}
            >
              {ex.name}
            </button>
          ))}
        </div>
      )}

      {/* Board */}
      {selectedId && (
        <>
          {loadingBoard ? (
            <div className="space-y-3">
              {/* Podium skeleton */}
              <div className="flex items-end gap-3 justify-center h-56">
                <Skeleton className="flex-1 h-40 rounded-xl" />
                <Skeleton className="flex-1 h-52 rounded-xl" />
                <Skeleton className="flex-1 h-36 rounded-xl" />
              </div>
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          ) : board.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
              <Flame className="h-12 w-12 opacity-20" />
              <p className="font-semibold">No lifts recorded yet</p>
              <p className="text-sm">Complete a session with this exercise to appear here.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Podium — top 3 */}
              {top3.length > 0 && (
                <div className="flex items-end gap-2 pt-4">
                  {top3.map((entry) => (
                    <PodiumCard
                      key={entry.clientProfileId}
                      entry={entry}
                      isMe={entry.clientProfileId === myClientProfileId}
                      position={entry.rank as 1 | 2 | 3}
                    />
                  ))}
                </div>
              )}

              {/* Divider */}
              {rest.length > 0 && (
                <div className="flex items-center gap-3 py-1">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-muted-foreground font-medium">Rankings</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
              )}

              {/* Rank 4+ list */}
              <div className="space-y-2">
                {rest.map((entry) => (
                  <RankRow
                    key={entry.clientProfileId}
                    entry={entry}
                    isMe={entry.clientProfileId === myClientProfileId}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
