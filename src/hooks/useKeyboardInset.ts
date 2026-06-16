'use client';

import { useEffect, useState } from 'react';

// Visual-viewport metrics for keyboard-aware layout on iOS standalone PWAs.
//
// iOS overlays the virtual keyboard without shrinking the layout viewport, so
// `100dvh` and `window.innerHeight` stay full-height while the keyboard is up.
// `window.visualViewport.height`, on the other hand, always equals the actual
// on-screen area *above* the keyboard — it's the one signal that's correct on
// every platform. Sizing a scroll container from it makes the scrollport end
// exactly at the keyboard top, so a focused input can scroll into view instead
// of hiding behind the keyboard.
//
// Returns:
//   • height — visualViewport.height in px, or null during SSR / when the API
//     is unavailable (callers should fall back to `100dvh`).
//   • inset  — px the keyboard occupies at the bottom (0 when closed). Handy as
//     a keyboard-open flag.
export function useKeyboardViewport(): { height: number | null; inset: number } {
  const [metrics, setMetrics] = useState<{ height: number | null; inset: number }>({
    height: null,
    inset: 0,
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      // window.innerHeight is the layout viewport; vv.height is the visual
      // viewport (excludes the keyboard). The diff is what the keyboard covers.
      // offsetTop handles cases where the page is scrolled within the visual
      // viewport. Threshold avoids a 1–2px jitter some browsers emit on scroll.
      const raw = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      const height = vv.height;
      const inset = raw > 24 ? raw : 0;
      // Bail out when nothing changed so the frequent vv `scroll` events don't
      // churn re-renders (height is unchanged on scroll, only offsetTop moves).
      setMetrics((prev) =>
        prev.height === height && prev.inset === inset ? prev : { height, inset },
      );
    };

    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    update();
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  return metrics;
}
