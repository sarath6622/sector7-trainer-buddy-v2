import { getToken } from 'next-auth/jwt';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/** Public paths that don't require authentication */
const PUBLIC_PATHS = ['/login', '/api/auth'];

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
     * Match all paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, sitemap.xml, robots.txt
     */
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
  ],
};
