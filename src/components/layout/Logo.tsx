/* eslint-disable @next/next/no-img-element */
import { cn } from '@/lib/utils';

interface LogoProps {
  className?: string;
  /** 'auto' = dark pill in light mode, transparent in dark mode. 'dark' = always on dark bg (no pill needed). */
  variant?: 'auto' | 'dark';
}

/**
 * Sector 7 logo — uses the actual brand PNG.
 *
 * The PNG has white "SECTOR" text + orange 7 on transparent background.
 * In light mode, we place the logo on a dark rounded pill so the white text is visible.
 * In dark mode, the logo renders directly (white text is naturally visible).
 */
export function Logo({ className, variant = 'auto' }: LogoProps) {
  return (
    <div
      className={cn(
        'flex items-center',
        variant === 'auto' &&
          'rounded-lg bg-zinc-900 px-3 py-1.5 dark:bg-transparent dark:px-0 dark:py-0 dark:rounded-none',
      )}
    >
      <img
        src="/sector7-logo-cropped.png"
        alt="Sector 7 Fitness"
        className={cn('w-auto object-contain', className)}
      />
    </div>
  );
}
