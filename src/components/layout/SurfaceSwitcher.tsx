'use client';

import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { rememberSurface } from '@/hooks/useActiveSurface';
import type { Surface } from '@/lib/roles';

const SURFACE_LABELS: Record<Surface, string> = {
  admin: 'Admin',
  trainer: 'Trainer',
  client: 'Client',
};

interface SurfaceSwitcherProps {
  surfaces: Surface[];
  active: Surface | null;
}

/**
 * Admin / Trainer toggle for users who hold both (head coach, ADR-054).
 * Renders nothing for single-surface users.
 */
export function SurfaceSwitcher({ surfaces, active }: SurfaceSwitcherProps) {
  const router = useRouter();
  if (surfaces.length < 2) return null;

  function switchTo(surface: Surface) {
    if (surface === active) return;
    rememberSurface(surface);
    router.push(`/${surface}`);
  }

  return (
    <div
      role="tablist"
      aria-label="Switch workspace"
      className="flex items-center rounded-full bg-muted/60 p-0.5 ring-1 ring-border/50"
    >
      {surfaces.map((surface) => {
        const isActive = surface === active;
        return (
          <button
            key={surface}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => switchTo(surface)}
            className={cn(
              'rounded-full px-1.5 py-1 text-[11px] font-semibold transition-colors active:scale-95 sm:px-2.5 sm:text-xs',
              isActive
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {SURFACE_LABELS[surface]}
          </button>
        );
      })}
    </div>
  );
}
