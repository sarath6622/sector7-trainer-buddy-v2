import type { NextConfig } from 'next';

const isDev = process.env.NODE_ENV === 'development';

const nextConfig: NextConfig = {
  // Silence Turbopack warning when Serwist adds webpack config in production
  turbopack: {},
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
