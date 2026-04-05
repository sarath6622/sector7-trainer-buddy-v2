'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Trophy, Medal, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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

// ─── Medal icon by rank ───────────────────────────────

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <Trophy className="h-5 w-5 text-yellow-400" />;
  if (rank === 2) return <Medal className="h-5 w-5 text-zinc-300" />;
  if (rank === 3) return <Medal className="h-5 w-5 text-amber-600" />;
  return <span className="text-sm font-bold text-muted-foreground w-5 text-center">#{rank}</span>;
}

// ─── Avatar ───────────────────────────────────────────

function Avatar({ name, imageUrl }: { name: string; imageUrl?: string | null }) {
  if (imageUrl) {
    return <img src={imageUrl} alt={name} className="w-9 h-9 rounded-full object-cover" />;
  }
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className="w-9 h-9 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-400 text-xs font-semibold flex-shrink-0">
      {initials}
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

  // Load compound exercises
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

  // Load leaderboard when exercise changes
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

  return (
    <div className="max-w-xl mx-auto p-4 space-y-4">
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

      {/* Exercise tabs */}
      {loadingExercises ? (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-8 w-24 flex-shrink-0 rounded-full" />
          ))}
        </div>
      ) : exercises.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          <Trophy className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No compound exercises yet</p>
          <p className="text-sm mt-1">
            Ask your admin to mark exercises as compound in the exercise library.
          </p>
        </Card>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
          {exercises.map((ex) => (
            <button
              key={ex.id}
              onClick={() => setSelectedId(ex.id)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                selectedId === ex.id
                  ? 'bg-orange-500 text-white border-orange-500'
                  : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
              }`}
            >
              {ex.name}
            </button>
          ))}
        </div>
      )}

      {/* Leaderboard table */}
      {selectedId && (
        <div className="space-y-2">
          {loadingBoard ? (
            [1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)
          ) : board.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground">
              <p className="font-medium">No lifts recorded yet</p>
              <p className="text-sm mt-1">Complete a session with this exercise to appear here.</p>
            </Card>
          ) : (
            board.map((entry) => {
              const isMe = entry.clientProfileId === myClientProfileId;
              const fullName = `${entry.firstName} ${entry.lastName}`;
              return (
                <Card
                  key={entry.clientProfileId}
                  className={`px-4 py-3 flex items-center gap-3 ${
                    isMe ? 'border-orange-500/50 bg-orange-500/5' : ''
                  }`}
                >
                  <RankBadge rank={entry.rank} />
                  <Avatar name={fullName} imageUrl={entry.profileImageUrl} />
                  <div className="flex-1 min-w-0">
                    <p
                      className={`font-semibold text-sm truncate ${isMe ? 'text-orange-400' : ''}`}
                    >
                      {fullName}
                      {isMe && (
                        <span className="ml-2 text-xs font-normal text-orange-400/70">(you)</span>
                      )}
                    </p>
                    {entry.reps && (
                      <p className="text-xs text-muted-foreground">{entry.reps} reps</p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-bold text-lg text-foreground">{entry.maxWeightKg} kg</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(entry.achievedAt).toLocaleDateString()}
                    </p>
                  </div>
                </Card>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
