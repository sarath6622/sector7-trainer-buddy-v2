'use client';

import { format } from 'date-fns';
import { cn } from '@/lib/utils';

export interface EarnedBadge {
  id: string;
  awardedAt: string | Date;
  displayOnProfile: boolean;
  metadata?: Record<string, unknown> | null;
  badgeDefinition: {
    id: string;
    name: string;
    description: string;
    icon: string;
    imageUrl?: string | null;
    type: string;
  };
}

export interface LockedBadge {
  id: string;
  name: string;
  description: string;
  icon: string;
  imageUrl?: string | null;
  howToEarn?: string | null;
  type: string;
  thresholdValue?: number | null;
}

interface BadgeGridProps {
  earned: EarnedBadge[];
  locked: LockedBadge[];
  onToggleDisplay?: (badgeId: string, display: boolean) => void;
  showToggle?: boolean;
}

export function BadgeGrid({ earned, locked, onToggleDisplay, showToggle = false }: BadgeGridProps) {
  if (earned.length === 0 && locked.length === 0) {
    return <p className="text-sm text-muted-foreground py-4 text-center">No badges available.</p>;
  }

  return (
    <div className="space-y-6">
      {earned.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Earned ({earned.length})
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {earned.map((b) => (
              <BadgeCard
                key={b.id}
                icon={b.badgeDefinition.icon}
                imageUrl={b.badgeDefinition.imageUrl}
                name={b.badgeDefinition.name}
                description={b.badgeDefinition.description}
                subtitle={`Earned ${format(new Date(b.awardedAt), 'dd MMM yyyy')}`}
                earned
                dimmed={showToggle && !b.displayOnProfile}
                onToggle={
                  showToggle && onToggleDisplay
                    ? () => onToggleDisplay(b.id, !b.displayOnProfile)
                    : undefined
                }
              />
            ))}
          </div>
        </div>
      )}

      {locked.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Locked ({locked.length})
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {locked.map((b) => (
              <BadgeCard
                key={b.id}
                icon={b.icon}
                imageUrl={b.imageUrl}
                name={b.name}
                description={b.howToEarn || b.description}
                earned={false}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface BadgeCardProps {
  icon: string;
  imageUrl?: string | null;
  name: string;
  description: string;
  subtitle?: string;
  earned: boolean;
  dimmed?: boolean;
  onToggle?: () => void;
}

function BadgeCard({
  icon,
  imageUrl,
  name,
  description,
  subtitle,
  earned,
  dimmed,
  onToggle,
}: BadgeCardProps) {
  return (
    <div
      className={cn(
        'relative flex flex-col items-center gap-2 rounded-xl border p-4 text-center transition-colors',
        earned
          ? 'border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10'
          : 'border-border/50 bg-muted/30 opacity-50',
        dimmed && 'opacity-40',
      )}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={name}
          className={cn('h-10 w-10 object-contain', !earned && 'grayscale')}
        />
      ) : (
        <span className={cn('text-3xl', !earned && 'grayscale')}>{icon}</span>
      )}
      <div>
        <p className={cn('text-sm font-semibold', !earned && 'text-muted-foreground')}>{name}</p>
        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{description}</p>
        {subtitle && <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">{subtitle}</p>}
      </div>
      {onToggle && (
        <button
          onClick={onToggle}
          className="absolute top-2 right-2 text-[10px] text-muted-foreground hover:text-foreground"
          title={dimmed ? 'Show on profile' : 'Hide from profile'}
        >
          {dimmed ? '👁️' : '🚫'}
        </button>
      )}
    </div>
  );
}
