const LAST_SHOWN_KEY = 's7-splash-last-shown';
const SKIP_ONCE_KEY = 's7-splash-skip-once';
const MIN_INTERVAL_MS = 24 * 60 * 60 * 1000;

// Memoized per page load so SplashScreen and SplashGate always agree on the
// same decision regardless of which one asks first.
let decision: boolean | null = null;

/** Ask the next full page load to skip the boot splash (e.g. pull-to-refresh reload). */
export function skipSplashOnNextLoad(): void {
  try {
    sessionStorage.setItem(SKIP_ONCE_KEY, '1');
  } catch {
    // storage unavailable — the splash will just play
  }
}

/**
 * Whether this page load should play the boot splash animation.
 *
 * Skipped when the previous page requested it (pull-to-refresh) or when the
 * splash already played within the last 24h; otherwise it plays and the time
 * is stamped. The skip-once path leaves the daily stamp untouched so a later
 * genuine cold start still gets its splash.
 */
export function shouldPlaySplash(): boolean {
  if (typeof window === 'undefined') return false;
  if (decision === null) decision = computeShouldPlay();
  return decision;
}

function computeShouldPlay(): boolean {
  try {
    if (sessionStorage.getItem(SKIP_ONCE_KEY) === '1') {
      sessionStorage.removeItem(SKIP_ONCE_KEY);
      return false;
    }
    const last = Number(localStorage.getItem(LAST_SHOWN_KEY) ?? 0);
    if (Number.isFinite(last) && last > 0 && Date.now() - last < MIN_INTERVAL_MS) {
      return false;
    }
    localStorage.setItem(LAST_SHOWN_KEY, String(Date.now()));
    return true;
  } catch {
    // Private mode / blocked storage — fall back to always playing
    return true;
  }
}
