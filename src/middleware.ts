import { getToken } from 'next-auth/jwt';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SURFACE_COOKIE, defaultPathFor, surfaceOf, surfacesFor } from '@/lib/roles';

/**
 * Public paths that don't require a NextAuth session at the middleware layer.
 *
 * - `/api/auth` — NextAuth's own flow.
 * - `/tv` — the gym TV display page, authenticated with a bearer token in
 *   localStorage/URL. The page renders a "no token" message when missing.
 * - `/api/admin/tv/dashboard`, `/api/admin/tv/live` — bearer-token API routes
 *   for the TV. Route handlers enforce auth via `assertTvOrAdmin` (bearer OR
 *   admin session). Other `/api/admin/tv/*` routes (devices, tv-control) stay
 *   gated by the session middleware because they require an admin session.
 *
 * `/login` is NOT in this list — it gets its own branch in middleware() that
 * bounces already-authenticated users back to their dashboard.
 */
const PUBLIC_PATHS = ['/api/auth', '/tv', '/api/admin/tv/dashboard', '/api/admin/tv/live'];

/**
 * Every role the token holds (ADR-054). A head coach (admin + trainer) may open
 * both /admin and /trainer. Older tokens without `roles` fall back to `role`.
 */
function tokenRoles(token: { role?: unknown; roles?: unknown }): string[] {
  if (Array.isArray(token.roles)) return token.roles as string[];
  return typeof token.role === 'string' && token.role ? [token.role] : [];
}

/** Landing path for this token, preferring the surface they last switched to. */
function landingPath(token: { role?: unknown; roles?: unknown }, request: NextRequest) {
  return defaultPathFor(tokenRoles(token), request.cookies.get(SURFACE_COOKIE)?.value);
}

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // /login: bounce already-authenticated users back to their dashboard. A
  // transient session-fetch failure (e.g. mid-deploy) can strand a user with
  // a valid cookie on the login form — this sends them straight back in.
  // Page-route-only cost: /api/* never reaches the middleware (see matcher).
  if (pathname === '/login' || pathname.startsWith('/login/')) {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    const defaultPath = token ? landingPath(token, request) : undefined;
    // Only bounce tokens that would survive the branchId guard below —
    // otherwise the dashboard redirect would just loop back here.
    if (token && defaultPath && token.branchId) {
      const callbackUrl = request.nextUrl.searchParams.get('callbackUrl');
      const isSafeRelative = callbackUrl?.startsWith('/') && !callbackUrl.startsWith('//');
      return NextResponse.redirect(
        new URL(isSafeRelative && callbackUrl ? callbackUrl : defaultPath, request.url),
      );
    }
    return NextResponse.next();
  }

  // Allow public paths
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // Allow static assets and Next.js internals
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/icons/') ||
    pathname === '/manifest.json' ||
    pathname === '/sw.js' ||
    /\.(png|jpg|jpeg|gif|svg|ico|webp)$/.test(pathname)
  ) {
    return NextResponse.next();
  }

  // Get JWT token
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  // Not authenticated → redirect to login
  if (!token) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  const branchId = token.branchId as string | undefined;

  // Guard: branchId must be present for any non-auth route
  if (!branchId && !pathname.startsWith('/api/auth')) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  // Root path → redirect to role-specific dashboard
  if (pathname === '/') {
    return NextResponse.redirect(new URL(landingPath(token, request) ?? '/login', request.url));
  }

  // Role-based route protection for dashboard pages
  if (
    pathname.startsWith('/admin') ||
    pathname.startsWith('/trainer') ||
    pathname.startsWith('/client')
  ) {
    const surfaces = surfacesFor(tokenRoles(token));
    if (surfaces.length === 0) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    const surface = surfaceOf(pathname);
    if (!surface || !surfaces.includes(surface)) {
      return NextResponse.redirect(new URL(landingPath(token, request) ?? '/login', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Run middleware ONLY on page routes. Its sole unique job is redirecting
     * unauthenticated browser navigations to /login and role-gating dashboard
     * pages — a page concern. Every API route already authenticates itself
     * (getServerSession / bearer token / CRON_SECRET), so running the edge
     * middleware (a getToken JWE-decrypt) on /api/* was pure redundant CPU —
     * and it needlessly redirected bearer-auth clients (mobile, cron) that
     * never carry a NextAuth cookie.
     *
     * Excluded from the matcher (middleware never even spins up):
     * - `api`            → all API routes (self-authenticating)
     * - `_next/static`, `_next/image` → build output & optimized images
     * - `.*\\..*`        → any path with a file extension: manifest.json,
     *                      sw.js, firebase-messaging-sw.js, /icons/*.png, etc.
     *                      (no page route contains a dot)
     */
    '/((?!api|_next/static|_next/image|.*\\..*).*)',
  ],
};
