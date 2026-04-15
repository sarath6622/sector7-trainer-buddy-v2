'use client';

import { useEffect, useRef } from 'react';

// Must be slightly longer than GONE_AT in SplashScreen.tsx (~3330ms)
const SPLASH_DURATION_MS = 3600;

/**
 * Wraps page content with the `inert` attribute while the splash screen is
 * playing. This prevents iOS Safari (and other browsers) from scanning the DOM
 * for password / autofill fields before the user can actually interact with
 * the page — stopping the native "Fill Password" sheet from appearing over
 * the splash animation.
 *
 * Uses `display: contents` so the wrapper div has zero effect on layout.
 */
export function SplashGate({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    el.setAttribute('inert', '');
    el.setAttribute('aria-hidden', 'true');

    const timer = setTimeout(() => {
      el.removeAttribute('inert');
      el.removeAttribute('aria-hidden');
    }, SPLASH_DURATION_MS);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div ref={ref} style={{ display: 'contents' }}>
      {children}
    </div>
  );
}
