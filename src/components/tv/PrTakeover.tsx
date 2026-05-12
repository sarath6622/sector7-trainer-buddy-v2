'use client';

import { useMemo } from 'react';
import { PartyPopper } from 'lucide-react';

export interface TakeoverPr {
  clientName: string;
  profileImageUrl: string | null;
  exerciseName: string;
  weightKg: number;
  reps: number | null;
  achievedAt: string;
}

const CONFETTI_PIECES = 60;
const CONFETTI_COLORS = ['#f97316', '#fbbf24', '#22c55e', '#3b82f6', '#ec4899', '#a855f7'];

export function PrTakeover({ pr }: { pr: TakeoverPr }) {
  // Deterministic-ish randomness so confetti positions don't change on re-render
  const confetti = useMemo(
    () =>
      Array.from({ length: CONFETTI_PIECES }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.8,
        duration: 1.8 + Math.random() * 1.6,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        size: 6 + Math.random() * 10,
        rotate: Math.random() * 360,
      })),
    // pr.achievedAt makes the seed stable per PR
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pr.achievedAt],
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      {/* Confetti */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {confetti.map((c, i) => (
          <span
            key={i}
            className="absolute -top-4 block animate-pr-confetti"
            style={{
              left: `${c.left}%`,
              width: c.size,
              height: c.size,
              backgroundColor: c.color,
              transform: `rotate(${c.rotate}deg)`,
              animationDelay: `${c.delay}s`,
              animationDuration: `${c.duration}s`,
            }}
          />
        ))}
      </div>

      {/* Card */}
      <div className="relative max-w-6xl w-full mx-12 rounded-3xl bg-gradient-to-br from-orange-500/30 to-yellow-500/10 p-16 text-center ring-4 ring-orange-500 animate-pr-pop">
        <div className="flex items-center justify-center gap-6 text-6xl font-black tracking-widest text-orange-300 animate-pulse">
          <PartyPopper className="h-16 w-16 shrink-0" />
          <span>NEW PR</span>
          <PartyPopper className="h-16 w-16 shrink-0" />
        </div>
        <div className="mt-8 text-9xl font-black tracking-tight text-white drop-shadow-[0_4px_20px_rgba(249,115,22,0.4)]">
          {pr.clientName}
        </div>
        <div className="mt-6 text-5xl font-bold text-zinc-200">{pr.exerciseName}</div>
        <div className="mt-8 text-[10rem] font-black tabular-nums text-orange-400 leading-none">
          {pr.weightKg.toFixed(1)}
          <span className="text-7xl text-orange-200/80"> kg</span>
        </div>
        {pr.reps != null && <div className="mt-2 text-4xl text-zinc-300">× {pr.reps} reps</div>}
      </div>

      <style jsx global>{`
        @keyframes pr-confetti {
          0% {
            transform: translateY(-20px) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(120vh) rotate(720deg);
            opacity: 0.6;
          }
        }
        @keyframes pr-pop {
          0% {
            transform: scale(0.7);
            opacity: 0;
          }
          60% {
            transform: scale(1.05);
            opacity: 1;
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }
        .animate-pr-confetti {
          animation-name: pr-confetti;
          animation-timing-function: linear;
          animation-fill-mode: forwards;
        }
        .animate-pr-pop {
          animation: pr-pop 600ms cubic-bezier(0.34, 1.56, 0.64, 1);
        }
      `}</style>
    </div>
  );
}
