'use client';

import { useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import { SURFACE_COOKIE, resolveActiveSurface, type Surface } from '@/lib/roles';

function readSurfaceCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${SURFACE_COOKIE}=([^;]*)`));
  return match ? decodeURIComponent(match[1]!) : null;
}

/** Remember the last surface so `/` and the next login land there (read by middleware). */
export function rememberSurface(surface: Surface) {
  if (typeof document === 'undefined') return;
  document.cookie = `${SURFACE_COOKIE}=${surface}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}

/**
 * Which side of the app the shell is showing. For a head coach (admin +
 * trainer, ADR-054) this follows the URL: /admin/* renders the admin nav,
 * /trainer/* the trainer nav. Shared pages (/community, /notifications) keep
 * whichever side was used last.
 */
export function useActiveSurface() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const roles = session?.user?.roles ?? (session?.user?.role ? [session.user.role] : []);
  return { roles, ...resolveActiveSurface(roles, pathname, readSurfaceCookie()) };
}
