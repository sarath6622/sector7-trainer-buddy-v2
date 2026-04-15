'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

const useIsClient = () =>
  useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

// ── Timing constants (ms) ────────────────────────────────────────────────────
const STAGGER = 60;
const LETTER_DUR = 400;
const REVEAL_DONE = 5 * STAGGER + LETTER_DUR;

const SWAP_START = REVEAL_DONE + 650;
const SWAP_OUT_DUR = 220;
const SWAP_IN_DEL = SWAP_START + 110;
const SWAP_IN_DUR = 300; // Sped up for a heavier, faster "slam"

const IMPACT_TIME = SWAP_IN_DEL + SWAP_IN_DUR; // The exact moment the 7 hits
const TAGLINE_DEL = IMPACT_TIME + 200;

const FADE_START = TAGLINE_DEL + 1200;
const FADE_DUR = 500;
const GONE_AT = FADE_START + FADE_DUR + 100;

// ── Letter map ───────────────────────────────────────────────────────────────
const LETTERS = [
  { key: 'S', src: '/splash-vector/s.png' },
  { key: 'E', src: '/splash-vector/e.png' },
  { key: 'C', src: '/splash-vector/c.png' },
  { key: 'T', src: '/splash-vector/t.png' }, // swaps to 7
  { key: 'O', src: '/splash-vector/o.png' },
  { key: 'R', src: '/splash-vector/r.png' },
] as const;
const T_IDX = 3;

// ── Keyframes ────────────────────────────────────────────────────────────────
const KEYFRAMES = `
  @keyframes s7-rise {
    from { opacity: 0; transform: translateY(14px); }
    to   { opacity: 0.85; transform: translateY(0); }
  }
  @keyframes s7-swap-out {
    from { opacity: 0.85; transform: scale(1) translateY(0); }
    to   { opacity: 0;    transform: scale(0.5) translateY(10px); }
  }
  /* The Slam */
  @keyframes s7-swap-in {
    0%   { opacity: 0; transform: scale(1.5) translateY(-30px); }
    80%  { opacity: 1; transform: scale(0.95) translateY(2px); }
    100% { opacity: 1; transform: scale(1) translateY(0); }
  }
  /* The Screen Shake */
  @keyframes screen-shake {
    0% { transform: translate(0, 0) rotate(0deg); }
    20% { transform: translate(-4px, 4px) rotate(-1deg); }
    40% { transform: translate(4px, -2px) rotate(1deg); }
    60% { transform: translate(-2px, -4px) rotate(0deg); }
    80% { transform: translate(2px, 2px) rotate(-0.5deg); }
    100% { transform: translate(0, 0) rotate(0deg); }
  }
  @keyframes slam-up {
    from { opacity: 0; transform: translateY(15px) scale(0.95); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }
`;

const LETTER_H = 'clamp(2rem, 6vw, 3.2rem)';
const HERO_H = 'clamp(4.5rem, 13vw, 7rem)';

const IMG: React.CSSProperties = {
  height: LETTER_H,
  width: 'auto',
  display: 'block',
  userSelect: 'none',
};
const HERO_IMG: React.CSSProperties = {
  height: HERO_H,
  width: 'auto',
  display: 'block',
  userSelect: 'none',
  flexShrink: 0,
};

export function SplashScreen() {
  const isClient = useIsClient();
  const [gone, setGone] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fadeTimer = setTimeout(() => {
      const el = overlayRef.current;
      if (!el) return;
      el.style.transition = `opacity ${FADE_DUR}ms ease-in-out`;
      el.style.opacity = '0';
      el.style.pointerEvents = 'none';
    }, FADE_START);

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
          backgroundColor: '#000000',
        }}
      >
        {/* Screen Shake Wrapper */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            animation: `screen-shake 300ms cubic-bezier(0.36,0.07,0.19,0.97) ${IMPACT_TIME}ms forwards`,
          }}
        >
          {/* ── Wordmark + FITNESS grouped ───────────────────────────────────
               inline-flex column with alignItems:flex-end right-aligns
               FITNESS to the exact right edge of the wordmark row,
               matching the logo where "fitness" sits below OR. */}
          <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            {/* Wordmark row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
              {LETTERS.map((letter, i) => {
                const riseDelay = i * STAGGER;

                if (i === T_IDX) {
                  return (
                    // T stays in normal flow at letter size — no layout gap.
                    // The 7 is absolutely centred over T and overflows its bounds,
                    // so it punches out large without shifting adjacent letters.
                    <span key="T-slot" style={{ position: 'relative', display: 'inline-flex' }}>
                      {/* T — normal letter size, in flow */}
                      <span
                        style={{
                          display: 'inline-flex',
                          opacity: 0,
                          animation: [
                            `s7-rise     ${LETTER_DUR}ms  cubic-bezier(0.22,1,0.36,1) ${riseDelay}ms  forwards`,
                            `s7-swap-out ${SWAP_OUT_DUR}ms ease-in                    ${SWAP_START}ms  forwards`,
                          ].join(', '),
                        }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={letter.src} alt="T" style={IMG} />
                      </span>

                      {/* 7 — two wrappers:
                          outer = static centering (translate never gets overridden)
                          inner = animation only (keyframe transforms don't fight centering) */}
                      <span
                        style={{
                          position: 'absolute',
                          top: '50%',
                          left: '50%',
                          transform: 'translate(-50%, -50%)',
                          display: 'inline-flex',
                          width: 'max-content',
                          filter: 'drop-shadow(0 0 20px rgba(232,101,44,0.7))',
                        }}
                      >
                        <span
                          style={{
                            display: 'inline-flex',
                            width: 'max-content',
                            opacity: 0,
                            animation: `s7-swap-in ${SWAP_IN_DUR}ms cubic-bezier(0.175,0.885,0.32,1.275) ${SWAP_IN_DEL}ms forwards`,
                          }}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src="/splash-vector/7.png" alt="7" style={HERO_IMG} />
                        </span>
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

            {/* FITNESS — brand image asset, right-aligned below wordmark */}
            <div
              style={{
                marginTop: '0.3rem',
                opacity: 0,
                animation: `slam-up 350ms cubic-bezier(0.175,0.885,0.32,1.275) ${TAGLINE_DEL}ms forwards`,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/splash-vector/fitness.png"
                alt="Fitness"
                style={{
                  height: 'clamp(0.55rem, 1.6vw, 0.8rem)',
                  width: 'auto',
                  display: 'block',
                  userSelect: 'none',
                  opacity: 0.65,
                }}
              />
            </div>
          </div>

          {/* GYM CROSSFIT — brand image asset, centred below the wordmark */}
          <div
            style={{
              marginTop: '0.6rem',
              opacity: 0,
              animation: `slam-up 350ms cubic-bezier(0.175,0.885,0.32,1.275) ${TAGLINE_DEL + 80}ms forwards`,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/splash-vector/gym-crossfit.png"
              alt="Gym Crossfit"
              style={{
                height: 'clamp(0.6rem, 1.8vw, 0.9rem)',
                width: 'auto',
                display: 'block',
                userSelect: 'none',
                opacity: 0.5,
              }}
            />
          </div>
        </div>
      </div>
    </>
  );
}
