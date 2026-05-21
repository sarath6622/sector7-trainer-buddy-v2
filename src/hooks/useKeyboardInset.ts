'use client';

import { useEffect, useState } from 'react';

// Returns the number of pixels the on-screen virtual keyboard is currently
// occupying at the bottom of the viewport. Backed by the VisualViewport API
// so it's accurate on iOS standalone PWAs (where `100dvh` and `window.inner-
// Height` do not shrink with the keyboard). Returns 0 when no keyboard is
// open, when the API is unavailable, or during SSR.
//
// Use this to subtract from container heights so bottom-anchored UI (e.g. the
// rest-timer pill on /trainer/session/[id]) stays visible above the keyboard.
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      // window.innerHeight is the layout viewport; vv.height is the visual
      // viewport (excludes the keyboard). The diff is what the keyboard
      // covers. offsetTop handles cases where the page is scrolled within
      // the visual viewport.
      const next = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      // Threshold avoids a 1–2px jitter that some browsers emit on scroll.
      setInset(next > 24 ? next : 0);
    };

    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    update();
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  return inset;
}
