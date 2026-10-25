'use client';

import { Fragment, useEffect, useRef, useState, useCallback } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter, usePathname } from 'next/navigation';
import { toast } from 'sonner';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopNav } from '@/components/layout/TopNav';
import { RoleTabBar } from '@/components/layout/RoleTabBar';
import { PullToRefresh } from '@/components/layout/PullToRefresh';
import { NAV_BY_ROLE, type NavItem } from '@/lib/constants';
import { usePusherChannel } from '@/hooks/usePusherChannel';
import { useActiveSurface, rememberSurface } from '@/hooks/useActiveSurface';
import { roleLabel, surfaceOf } from '@/lib/roles';
import type { NotificationPayload, LeaveStatusChangedPayload } from '@/lib/pusher';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status, update } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const hideTabBar = /\/session\/[^/]+/.test(pathname);

  // ADR-054: a head coach holds admin + trainer roles. The shell renders one
  // side at a time, chosen by the URL, and the top bar switches between them.
  const { roles, surface, surfaceRoles, activeRole, surfaces } = useActiveSurface();
  const isAdminSurface = surface === 'admin';

  useEffect(() => {
    const fromPath = surfaceOf(pathname);
    if (surfaces.length > 1 && fromPath && surfaces.includes(fromPath)) rememberSurface(fromPath);
  }, [pathname, surfaces]);

  const [pendingLeaveCount, setPendingLeaveCount] = useState(0);

  // Pull-to-refresh: soft refresh instead of a full reload — refetch server
  // data and remount only the page subtree (via key) so its client fetches
  // re-run. The shell (TopNav, sidebar, tab bar) stays mounted, so no
  // full-page skeleton or boot splash.
  const [refreshKey, setRefreshKey] = useState(0);
  const handleRefresh = useCallback(async () => {
    router.refresh();
    setRefreshKey((k) => k + 1);
    // Brief hold so the spinner retracts smoothly instead of flashing away
    await new Promise((resolve) => setTimeout(resolve, 400));
  }, [router]);

  // ── Real-time: subscribe to the current user's channel ────────────────────
  const userId = session?.user?.id ?? null;
  usePusherChannel(userId ? `user-${userId}` : null, {
    NOTIFICATION: (data) => {
      const payload = data as NotificationPayload;
      toast(payload.title, { description: payload.body });
    },
    LEAVE_STATUS_CHANGED: (data) => {
      const payload = data as LeaveStatusChangedPayload;
      const approved = payload.status === 'APPROVED';
      toast(approved ? 'Leave Approved' : 'Leave Rejected', {
        description:
          payload.notes ??
          (approved ? 'Your leave request was approved.' : 'Your leave request was rejected.'),
      });
    },
  });

  // "Unauthenticated" can be a false negative: next-auth's client reports it
  // whenever the /api/auth/session fetch fails, which happens transiently
  // mid-deploy even with a perfectly valid cookie. Retry the session fetch
  // once before treating it as a real logout and redirecting.
  const sessionRetriedRef = useRef(false);
  useEffect(() => {
    if (status === 'authenticated') {
      sessionRetriedRef.current = false;
      return;
    }
    if (status === 'loading') return;

    let cancelled = false;
    (async () => {
      if (!sessionRetriedRef.current) {
        sessionRetriedRef.current = true;
        await new Promise((resolve) => setTimeout(resolve, 1000));
        if (cancelled) return;
        // update() refetches the session INTO the provider — on success the
        // status flips to authenticated and this effect re-runs into the
        // early return above.
        const fresh = await update().catch(() => null);
        if (cancelled || fresh?.user) return;
      }
      if (!cancelled) router.push('/login');
    })();
    return () => {
      cancelled = true;
    };
  }, [status, router, update]);

  // ADR-055: deactivated while signed in (e.g. marked as left the gym). The
  // session refetch on focus picks this up; sign out and explain on /login.
  const accessBlocked = session?.user?.accessBlocked ?? null;
  useEffect(() => {
    if (accessBlocked) void signOut({ callbackUrl: `/login?reason=${accessBlocked}` });
  }, [accessBlocked]);

  // iOS standalone PWA cold-start: WebKit briefly lays the document out taller
  // than the screen, leaving a phantom scrollable region that drags the whole
  // layout when swiped. The document never legitimately scrolls here — only
  // <main> does — so snap any stray document scroll back to 0.
  //
  // While a text field is focused, iOS animates its own document scroll to
  // keep the field clear of the keyboard. Snapping on every scroll event fights
  // that animation frame by frame (visible up/down jitter), so while editing
  // wait for the scroll to settle and snap once.
  useEffect(() => {
    let settle: ReturnType<typeof setTimeout> | undefined;
    const snap = () => {
      if (window.scrollY !== 0) window.scrollTo(0, 0);
    };
    const reset = () => {
      clearTimeout(settle);
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        settle = setTimeout(snap, 150);
      } else {
        snap();
      }
    };
    window.addEventListener('scroll', reset, { passive: true });
    window.visualViewport?.addEventListener('resize', reset);
    reset();
    return () => {
      clearTimeout(settle);
      window.removeEventListener('scroll', reset);
      window.visualViewport?.removeEventListener('resize', reset);
    };
  }, []);

  const fetchPendingLeaveCount = useCallback(async () => {
    if (!isAdminSurface) return;
    try {
      const res = await fetch('/api/admin/leaves/pending-count');
      if (res.ok) {
        const { count } = await res.json();
        setPendingLeaveCount(count ?? 0);
      }
    } catch {
      // silently ignore
    }
  }, [isAdminSurface]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchPendingLeaveCount();
    const interval = setInterval(fetchPendingLeaveCount, 30_000);
    return () => clearInterval(interval);
  }, [fetchPendingLeaveCount]);

  if (status === 'loading' || !session?.user) {
    return (
      <div className="flex h-[var(--app-height)] overflow-hidden">
        {/* Sidebar placeholder */}
        <div className="hidden lg:flex lg:w-64 lg:flex-col lg:gap-3 lg:p-4 border-r border-border/50">
          <div className="h-8 w-32 animate-pulse rounded-xl bg-muted/60" />
          <div className="mt-4 space-y-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded-xl bg-muted/60" />
            ))}
          </div>
        </div>
        {/* Content area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* TopNav placeholder */}
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-border/50 px-4">
            <div className="h-6 w-24 animate-pulse rounded-lg bg-muted/60" />
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 animate-pulse rounded-full bg-muted/60" />
              <div className="h-8 w-8 animate-pulse rounded-full bg-muted/60" />
              <div className="h-8 w-8 animate-pulse rounded-full bg-muted/60" />
            </div>
          </div>
          {/* Page skeleton */}
          <main className="flex-1 overflow-y-auto p-4 md:p-6">
            <div className="mx-auto max-w-2xl space-y-5">
              <div className="space-y-2">
                <div className="h-7 w-40 animate-pulse rounded-xl bg-muted/60" />
                <div className="h-4 w-52 animate-pulse rounded-xl bg-muted/60" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="rounded-2xl bg-card p-3.5 ring-1 ring-border/50 space-y-2"
                  >
                    <div className="h-8 w-8 animate-pulse rounded-xl bg-muted/60" />
                    <div className="h-2.5 w-12 animate-pulse rounded-xl bg-muted/60" />
                    <div className="h-6 w-10 animate-pulse rounded-xl bg-muted/60" />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[0, 1].map((i) => (
                  <div key={i} className="rounded-2xl bg-card p-4 ring-1 ring-border/50 space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 animate-pulse rounded-xl bg-muted/60" />
                      <div className="h-3 w-14 animate-pulse rounded-xl bg-muted/60" />
                    </div>
                    <div className="h-8 w-24 animate-pulse rounded-xl bg-muted/60" />
                    <div className="h-3 w-16 animate-pulse rounded-xl bg-muted/60" />
                  </div>
                ))}
              </div>
              <div className="rounded-2xl bg-card p-5 ring-1 ring-border/50">
                <div className="flex items-center justify-between mb-4">
                  <div className="h-3.5 w-20 animate-pulse rounded-xl bg-muted/60" />
                  <div className="h-3.5 w-20 animate-pulse rounded-xl bg-muted/60" />
                </div>
                <div className="flex items-center gap-6">
                  <div className="h-28 w-28 shrink-0 animate-pulse rounded-full bg-muted/60" />
                  <div className="grid flex-1 grid-cols-2 gap-3">
                    {[0, 1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2.5 rounded-xl bg-muted/40 px-3 py-2.5"
                      >
                        <div className="h-7 w-7 shrink-0 animate-pulse rounded-lg bg-muted/60" />
                        <div className="space-y-1.5">
                          <div className="h-5 w-6 animate-pulse rounded bg-muted/60" />
                          <div className="h-2.5 w-12 animate-pulse rounded bg-muted/60" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  const user = {
    firstName: session.user.firstName ?? '',
    lastName: session.user.lastName ?? '',
    email: session.user.email ?? '',
    role: activeRole,
    roleLabel: roleLabel(roles),
  };

  // Merge nav items from this surface's roles (deduplicated by href), so a
  // TRAINER + CROSSFIT_TRAINER still sees both, but a head coach on the
  // trainer side does not get the admin nav mixed in.
  const navItems = surfaceRoles.reduce<NavItem[]>((acc, r) => {
    for (const item of NAV_BY_ROLE[r] ?? []) {
      if (!acc.some((existing) => existing.href === item.href)) acc.push(item);
    }
    return acc;
  }, []);
  const navBadges: Record<string, number> =
    isAdminSurface && pendingLeaveCount > 0 ? { '/admin/leaves': pendingLeaveCount } : {};

  function handleLogout() {
    signOut({ callbackUrl: '/login' });
  }

  return (
    <div className="flex h-[var(--app-height)] max-h-[var(--app-height)] overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <Sidebar navItems={navItems} navBadges={navBadges} />
      </div>

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopNav
          user={user}
          navItems={navItems}
          surfaces={surfaces}
          activeSurface={surface}
          onLogout={handleLogout}
        />
        <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-6">
          <PullToRefresh onRefresh={handleRefresh}>
            <Fragment key={refreshKey}>{children}</Fragment>
          </PullToRefresh>
        </main>
        {!hideTabBar && <RoleTabBar role={activeRole} navItems={navItems} navBadges={navBadges} />}
      </div>
    </div>
  );
}
