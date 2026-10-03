import type { NextConfig } from 'next';

const isDev = process.env.NODE_ENV === 'development';

// Hosts allowed to pull /_next/* dev resources cross-origin. Next 16 blocks
// these by default, which silently breaks hydration when you open the dev
// server from a phone on the LAN: the HTML loads, every JS chunk is refused,
// and forms fall back to native submits. Set DEV_LAN_ORIGINS in .env.local to
// your machine's LAN IP (comma-separated for more than one) when testing on a
// device — left unset, nothing changes. Dev-only; ignored in production.
const devLanOrigins = (process.env.DEV_LAN_ORIGINS ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  // Silence Turbopack warning when Serwist adds webpack config in production
  turbopack: {},
  ...(devLanOrigins.length > 0 ? { allowedDevOrigins: devLanOrigins } : {}),
};

let finalConfig: NextConfig = nextConfig;

// Serwist (PWA service worker) uses webpack — only apply for production builds.
// In dev, Next.js 16 uses Turbopack by default where Serwist is not needed.
if (!isDev) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const withSerwistInit = require('@serwist/next').default;
    const withSerwist = withSerwistInit({
      swSrc: 'src/app/sw.ts',
      swDest: 'public/sw.js',
    });
    finalConfig = withSerwist(nextConfig);
  } catch {
    // Serwist not available — skip
  }
}

export default finalConfig;
