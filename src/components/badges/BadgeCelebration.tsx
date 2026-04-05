'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface BadgeInfo {
  name: string;
  icon: string;
  description?: string;
  imageUrl?: string;
}

interface BadgeCelebrationProps {
  badges: BadgeInfo[];
  onDone: () => void;
}

/**
 * Full-screen animated badge celebration overlay.
 * Cycles through each newly earned badge with a scale-in + glow animation.
 */
export function BadgeCelebration({ badges, onDone }: BadgeCelebrationProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [phase, setPhase] = useState<'enter' | 'show' | 'exit'>('enter');
  const transitioning = useRef(false);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  const badge = badges[currentIndex];

  // Pre-generate confetti positions so render stays pure
  const confetti = useMemo(
    () =>
      Array.from({ length: 20 }, (_, i) => ({
        left: `${10 + ((i * 37 + 13) % 80)}%`,
        width: `${4 + (i % 6)}px`,
        height: `${4 + ((i * 3) % 6)}px`,
        color: ['#f59e0b', '#ef4444', '#3b82f6', '#10b981', '#8b5cf6', '#f97316'][i % 6],
        delay: `${(i * 0.08) % 1.5}s`,
        duration: `${2 + (i % 3)}s`,
      })),
    [],
  );

  const advance = useCallback(() => {
    if (transitioning.current) return;
    transitioning.current = true;
    setPhase('exit');
    setTimeout(() => {
      transitioning.current = false;
      if (currentIndex < badges.length - 1) {
        setCurrentIndex(currentIndex + 1);
        setPhase('enter');
        // Delay transition to 'show' to allow the enter animation to render
        setTimeout(() => setPhase('show'), 80);
      } else {
        onDoneRef.current();
      }
    }, 400);
  }, [currentIndex, badges.length]);

  // Initial enter → show
  useEffect(() => {
    if (phase === 'enter') {
      const t = setTimeout(() => setPhase('show'), 80);
      return () => clearTimeout(t);
    }
  }, [phase]);

  // Auto-advance after 3.5 seconds of showing
  useEffect(() => {
    if (phase !== 'show') return;
    const timer = setTimeout(advance, 3500);
    return () => clearTimeout(timer);
  }, [phase, advance]);

  function handleTap() {
    advance();
  }

  if (!badge) return null;

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm transition-opacity duration-300',
        phase === 'enter' && 'opacity-0',
        phase === 'show' && 'opacity-100',
        phase === 'exit' && 'opacity-0',
      )}
      onClick={handleTap}
    >
      {/* Radial glow */}
      <div
        className={cn(
          'absolute h-64 w-64 rounded-full bg-amber-500/20 blur-3xl transition-all duration-700',
          phase === 'show' ? 'scale-100 opacity-100' : 'scale-50 opacity-0',
        )}
      />

      {/* Confetti particles — CSS-only */}
      {phase === 'show' && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {confetti.map((c, i) => (
            <span
              key={i}
              className="absolute rounded-full animate-confetti"
              style={{
                left: c.left,
                top: '-5%',
                width: c.width,
                height: c.height,
                background: c.color,
                animationDelay: c.delay,
                animationDuration: c.duration,
              }}
            />
          ))}
        </div>
      )}

      {/* Badge card */}
      <div
        className={cn(
          'relative flex flex-col items-center gap-4 transition-all duration-500',
          phase === 'show'
            ? 'scale-100 opacity-100 translate-y-0'
            : 'scale-75 opacity-0 translate-y-8',
        )}
      >
        {/* Achievement label */}
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-amber-400">
          Achievement Unlocked
        </p>

        {/* Badge icon */}
        <div className="relative">
          <div
            className={cn(
              'flex h-28 w-28 items-center justify-center rounded-full border-2 border-amber-500/40 bg-gradient-to-br from-amber-500/20 to-orange-600/20 shadow-lg shadow-amber-500/20 transition-all duration-700',
              phase === 'show' ? 'scale-100' : 'scale-50',
            )}
          >
            {badge.imageUrl ? (
              <img src={badge.imageUrl} alt={badge.name} className="h-16 w-16 object-contain" />
            ) : (
              <span className="text-6xl">{badge.icon}</span>
            )}
          </div>
          {/* Pulse ring */}
          {phase === 'show' && (
            <div className="absolute inset-0 animate-ping rounded-full border border-amber-500/30" />
          )}
        </div>

        {/* Badge name */}
        <h2 className="text-2xl font-bold text-white">{badge.name}</h2>
        {badge.description && (
          <p className="max-w-xs text-center text-sm text-white/60">{badge.description}</p>
        )}

        {/* Tap hint */}
        <p className="mt-4 text-xs text-white/30 animate-pulse">
          {currentIndex < badges.length - 1 ? 'Tap for next badge' : 'Tap to continue'}
        </p>
      </div>

      {/* Counter */}
      {badges.length > 1 && (
        <div className="absolute bottom-8 flex gap-1.5">
          {badges.map((_, i) => (
            <div
              key={i}
              className={cn(
                'h-1.5 rounded-full transition-all duration-300',
                i === currentIndex ? 'w-6 bg-amber-500' : 'w-1.5 bg-white/20',
              )}
            />
          ))}
        </div>
      )}

      {/* CSS for confetti */}
      <style>{`
        @keyframes confetti-fall {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
        .animate-confetti {
          animation: confetti-fall linear forwards;
        }
      `}</style>
    </div>
  );
}
