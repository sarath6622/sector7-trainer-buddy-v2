import { getToken } from 'next-auth/jwt';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Public paths that don't require a NextAuth session at the middleware layer.
 *
 * - `/login`, `/api/auth` — NextAuth's own flow.
 * - `/tv` — the gym TV display page, authenticated with a bearer token in
 *   localStorage/URL. The page renders a "no token" message when missing.
 * - `/api/admin/tv/dashboard`, `/api/admin/tv/live` — bearer-token API routes
 *   for the TV. Route handlers enforce auth via `assertTvOrAdmin` (bearer OR
 *   admin session). Other `/api/admin/tv/*` routes (devices, tv-control) stay
 *   gated by the session middleware because they require an admin session.
 */
const PUBLIC_PATHS = [
  '/login',
  '/api/auth',
  '/tv',
  '/api/admin/tv/dashboard',
  '/api/admin/tv/live',
];

/** Role-to-path prefix mapping for route protection */
const ROLE_PATH_MAP: Record<string, string[]> = {
  SUPER_ADMIN: ['/admin'],
  BRANCH_ADMIN: ['/admin'],
  TRAINER: ['/trainer'],
  KICKBOXING_TRAINER: ['/trainer'],
  CROSSFIT_TRAINER: ['/trainer'],
  CLIENT: ['/client'],
};

/** Default redirect path after login for each role */
const ROLE_DEFAULT_PATH: Record<string, string> = {
  SUPER_ADMIN: '/admin',
  BRANCH_ADMIN: '/admin',
  TRAINER: '/trainer',
  KICKBOXING_TRAINER: '/trainer',
  CROSSFIT_TRAINER: '/trainer',
  CLIENT: '/client',
};

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

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

  const role = token.role as string;
  const branchId = token.branchId as string | undefined;

  // Guard: branchId must be present for any non-auth route
  if (!branchId && !pathname.startsWith('/api/auth')) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  // Root path → redirect to role-specific dashboard
  if (pathname === '/') {
    const defaultPath = ROLE_DEFAULT_PATH[role] ?? '/login';
    return NextResponse.redirect(new URL(defaultPath, request.url));
  }

  // Role-based route protection for dashboard pages
  if (
    pathname.startsWith('/admin') ||
    pathname.startsWith('/trainer') ||
    pathname.startsWith('/client')
  ) {
    const allowedPaths = ROLE_PATH_MAP[role];
    if (!allowedPaths) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    const hasAccess = allowedPaths.some((p) => pathname.startsWith(p));
    if (!hasAccess) {
      const defaultPath = ROLE_DEFAULT_PATH[role] ?? '/login';
      return NextResponse.redirect(new URL(defaultPath, request.url));
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
