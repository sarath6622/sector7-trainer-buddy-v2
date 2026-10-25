/* eslint-disable @next/next/no-img-element */
import { cn } from '@/lib/utils';

interface LogoProps {
  className?: string;
  /** 'auto' = follows the theme. 'dark' = always on a dark bg (white wordmark only). */
  variant?: 'auto' | 'dark';
}

/**
 * Sector 7 logo — uses the actual brand PNG.
 *
 * Two versions of the same artwork, identical size so the logo sits the same in both themes:
 * - sector7-logo-cropped.png: white "SECTOR" + orange 7, for dark backgrounds.
 * - sector7-logo-cropped-light.png: near-black "SECTOR" + orange 7, for light backgrounds.
 */
export function Logo({ className, variant = 'auto' }: LogoProps) {
  const imgClass = cn('w-auto object-contain', className);

  if (variant === 'dark') {
    return (
      <div className="flex items-center">
        <img src="/sector7-logo-cropped.png" alt="Sector 7 Fitness" className={imgClass} />
      </div>
    );
  }

  return (
    <div className="flex items-center">
      <img
        src="/sector7-logo-cropped-light.png"
        alt="Sector 7 Fitness"
        className={cn(imgClass, 'dark:hidden')}
      />
      <img
        src="/sector7-logo-cropped.png"
        alt=""
        aria-hidden="true"
        className={cn(imgClass, 'hidden dark:block')}
      />
    </div>
  );
}
