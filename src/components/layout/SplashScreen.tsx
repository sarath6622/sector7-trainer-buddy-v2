'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

// useSyncExternalStore is the idiomatic SSR-safe way to detect client-side rendering
// without calling setState inside an effect (which triggers the lint rule).
const useIsClient = () =>
  useSyncExternalStore(
    () => () => {}, // subscribe — no external store to subscribe to
    () => true, // getSnapshot (client)
    () => false, // getServerSnapshot (server → false prevents SSR render)
  );

// ── Timing constants (ms) ────────────────────────────────────────────────────
const STAGGER = 65;
const LETTER_DUR = 400;
const REVEAL_DONE = 5 * STAGGER + LETTER_DUR; // ~725ms  — last letter done

const SWAP_START = REVEAL_DONE + 460; // ~1185ms — hold "SECTOR", then swap
const SWAP_OUT_DUR = 240;
const SWAP_IN_DEL = SWAP_START + 90; // ~1275ms — 7 punches in
const SWAP_IN_DUR = 400;

const TAGLINE_DEL = SWAP_START + 410; // ~1595ms — FITNESS appears

const FADE_START = SWAP_IN_DEL + SWAP_IN_DUR + 700; // ~2375ms — overlay fades
const FADE_DUR = 480;
const GONE_AT = FADE_START + FADE_DUR + 80; // ~2935ms — React unmounts

// ── Letter image map ─────────────────────────────────────────────────────────
const LETTERS = [
  { key: 'S', src: '/splash-vector/s.png' },
  { key: 'E', src: '/splash-vector/e.png' },
  { key: 'C', src: '/splash-vector/c.png' },
  { key: 'T', src: '/splash-vector/t.png' },
  { key: 'O', src: '/splash-vector/o.png' },
  { key: 'R', src: '/splash-vector/r.png' },
] as const;
const T_IDX = 3;

// ── Keyframes (letter animations only — overlay fade is JS-driven) ───────────
const KEYFRAMES = `
  @keyframes s7-rise {
    from { opacity:0; transform:translateY(20px); }
    to   { opacity:1; transform:translateY(0); }
  }
  @keyframes s7-ghost {
    from { opacity:0; transform:translateY(16px); }
    to   { opacity:0.06; transform:translateY(0); }
  }
  @keyframes s7-swap-out {
    from { opacity:1; transform:scale(1) translateY(0); }
    to   { opacity:0; transform:scale(0.55) translateY(-10px); }
  }
  @keyframes s7-swap-in {
    0%   { opacity:0; transform:scale(0.55) translateY(12px); }
    70%  { opacity:1; transform:scale(1.08) translateY(-2px); }
    100% { opacity:1; transform:scale(1) translateY(0); }
  }
`;

const IMG: React.CSSProperties = {
  height: 'clamp(2.8rem, 9vw, 5rem)',
  width: 'auto',
  display: 'block',
  userSelect: 'none',
};

export function SplashScreen() {
  const isClient = useIsClient(); // false on server, true on client
  const [gone, setGone] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Fade-out: bypass React entirely — directly set opacity on the DOM node.
    // This is immune to React re-renders resetting the CSS animation counter.
    const fadeTimer = setTimeout(() => {
      const el = overlayRef.current;
      if (!el) return;
      el.style.transition = `opacity ${FADE_DUR}ms ease-in-out`;
      el.style.opacity = '0';
      el.style.pointerEvents = 'none';
    }, FADE_START);

    // Unmount: after the fade is complete
    const goneTimer = setTimeout(() => setGone(true), GONE_AT);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(goneTimer);
    };
  }, []);

  if (!isClient || gone) return null;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: KEYFRAMES }} />

      <div
        ref={overlayRef}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#111111',
          // opacity & transition are set imperatively via overlayRef — NOT here
        }}
      >
        {/* ── Word mark ──────────────────────────────────────────────────── */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          {/* Ghost layer — very faint behind the foreground */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              pointerEvents: 'none',
            }}
          >
            {LETTERS.map((l, i) => (
              <span
                key={'g' + i}
                style={{
                  display: 'inline-flex',
                  opacity: 0,
                  filter: 'blur(0.5px)',
                  animation: `s7-ghost 600ms ease-out ${REVEAL_DONE + 80}ms forwards`,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={l.src} alt="" style={{ ...IMG, filter: 'brightness(10)' }} />
              </span>
            ))}
          </div>

          {/* Foreground letters */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, position: 'relative' }}>
            {LETTERS.map((letter, i) => {
              const riseDelay = i * STAGGER;

              if (i === T_IDX) {
                return (
                  // inline-grid: T and 7 occupy the same cell — zero layout shift on swap
                  <span key="T-slot" style={{ display: 'inline-grid' }}>
                    {/* T — rises in, then CSS swaps it out */}
                    <span
                      style={{
                        gridArea: '1/1',
                        display: 'inline-flex',
                        opacity: 0,
                        animation: [
                          `s7-rise ${LETTER_DUR}ms cubic-bezier(0.22,1,0.36,1) ${riseDelay}ms forwards`,
                          `s7-swap-out ${SWAP_OUT_DUR}ms ease-in ${SWAP_START}ms forwards`,
                        ].join(', '),
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={letter.src} alt="T" style={IMG} />
                    </span>

                    {/* 7 — hidden until CSS swap-in fires */}
                    <span
                      style={{
                        gridArea: '1/1',
                        display: 'inline-flex',
                        opacity: 0,
                        filter: 'drop-shadow(0 0 14px rgba(232,101,44,0.55))',
                        animation: `s7-swap-in ${SWAP_IN_DUR}ms cubic-bezier(0.22,1,0.36,1) ${SWAP_IN_DEL}ms forwards`,
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/splash-vector/7.png" alt="7" style={IMG} />
                    </span>
                  </span>
                );
              }

              return (
                <span
                  key={letter.key}
                  style={{
                    display: 'inline-flex',
                    opacity: 0,
                    animation: `s7-rise ${LETTER_DUR}ms cubic-bezier(0.22,1,0.36,1) ${riseDelay}ms forwards`,
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={letter.src} alt={letter.key} style={IMG} />
                </span>
              );
            })}
          </div>
        </div>

        {/* ── FITNESS tagline ─────────────────────────────────────────────── */}
        <div
          style={{
            fontFamily: 'var(--font-logo), ui-sans-serif, sans-serif',
            fontSize: 'clamp(0.55rem, 1.6vw, 0.8rem)',
            fontWeight: 600,
            letterSpacing: '0.45em',
            color: 'rgba(255,255,255,0.5)',
            textTransform: 'uppercase',
            marginTop: '0.75rem',
            opacity: 0,
            animation: `s7-rise 400ms ease-out ${TAGLINE_DEL}ms forwards`,
          }}
        >
          FITNESS
        </div>
      </div>
    </>
  );
}
