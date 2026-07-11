import { describe, it, expect, vi, beforeEach } from 'vitest';

const DAY_MS = 24 * 60 * 60 * 1000;
const LAST_SHOWN_KEY = 's7-splash-last-shown';
const SKIP_ONCE_KEY = 's7-splash-skip-once';

// jsdom's storage is unreliable across setups (see workout-outbox.test.ts) —
// install a clean in-memory Storage for each test.
function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
    key: (i) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size;
    },
  } as Storage;
}

// The module memoizes its decision per page load, so each test gets a fresh
// import to simulate a fresh load.
async function freshSplashModule() {
  vi.resetModules();
  return import('@/lib/splash');
}

describe('splash gating', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
    vi.stubGlobal('sessionStorage', memoryStorage());
  });

  it('plays on a first-ever load and stamps the time', async () => {
    const { shouldPlaySplash } = await freshSplashModule();

    expect(shouldPlaySplash()).toBe(true);
    expect(Number(localStorage.getItem(LAST_SHOWN_KEY))).toBeGreaterThan(0);
  });

  it('is memoized — repeated calls in the same load agree', async () => {
    const { shouldPlaySplash } = await freshSplashModule();

    expect(shouldPlaySplash()).toBe(true);
    // A second call must not flip to false even though the stamp is now fresh
    expect(shouldPlaySplash()).toBe(true);
  });

  it('skips when the splash played within the last 24h', async () => {
    localStorage.setItem(LAST_SHOWN_KEY, String(Date.now() - 60_000));
    const { shouldPlaySplash } = await freshSplashModule();

    expect(shouldPlaySplash()).toBe(false);
  });

  it('plays again once 24h have passed', async () => {
    localStorage.setItem(LAST_SHOWN_KEY, String(Date.now() - DAY_MS - 60_000));
    const { shouldPlaySplash } = await freshSplashModule();

    expect(shouldPlaySplash()).toBe(true);
  });

  it('skips once when a pull-to-refresh reload requested it, without touching the daily stamp', async () => {
    const staleStamp = String(Date.now() - DAY_MS - 60_000);
    localStorage.setItem(LAST_SHOWN_KEY, staleStamp);
    sessionStorage.setItem(SKIP_ONCE_KEY, '1');
    const { shouldPlaySplash } = await freshSplashModule();

    expect(shouldPlaySplash()).toBe(false);
    // Flag is consumed and the stamp untouched, so the NEXT load still plays
    expect(sessionStorage.getItem(SKIP_ONCE_KEY)).toBeNull();
    expect(localStorage.getItem(LAST_SHOWN_KEY)).toBe(staleStamp);

    const { shouldPlaySplash: nextLoad } = await freshSplashModule();
    expect(nextLoad()).toBe(true);
  });

  it('skipSplashOnNextLoad sets the one-shot flag', async () => {
    const { skipSplashOnNextLoad } = await freshSplashModule();

    skipSplashOnNextLoad();

    expect(sessionStorage.getItem(SKIP_ONCE_KEY)).toBe('1');
  });
});
