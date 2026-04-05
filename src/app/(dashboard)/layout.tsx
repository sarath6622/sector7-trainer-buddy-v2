'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopNav } from '@/components/layout/TopNav';
import { NAV_BY_ROLE, type NavItem } from '@/lib/constants';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();

  const role = session?.user?.role ?? '';
  const roles = session?.user?.roles ?? [role];
  const isAdmin = role === 'SUPER_ADMIN' || role === 'BRANCH_ADMIN';

  const [pendingLeaveCount, setPendingLeaveCount] = useState(0);

  useEffect(() => {
    if (status !== 'loading' && !session?.user) {
      router.push('/login');
    }
  }, [status, session, router]);

  const fetchPendingLeaveCount = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const res = await fetch('/api/admin/leaves/pending-count');
      if (res.ok) {
        const { count } = await res.json();
        setPendingLeaveCount(count ?? 0);
      }
    } catch {
      // silently ignore
    }
  }, [isAdmin]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchPendingLeaveCount();
    const interval = setInterval(fetchPendingLeaveCount, 30_000);
    return () => clearInterval(interval);
  }, [fetchPendingLeaveCount]);

  if (status === 'loading' || !session?.user) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  const user = {
    firstName: session.user.firstName ?? '',
    lastName: session.user.lastName ?? '',
    email: session.user.email ?? '',
    role,
  };

  // Merge nav items from all roles (deduplicated by href), primary role items first
  const navItems = roles.reduce<NavItem[]>(
    (acc, r) => {
      const items = NAV_BY_ROLE[r] ?? [];
      for (const item of items) {
        if (!acc.some((existing) => existing.href === item.href)) {
          acc.push(item);
        }
      }
      return acc;
    },
    [...(NAV_BY_ROLE[role] ?? [])],
  );
  const navBadges: Record<string, number> =
    isAdmin && pendingLeaveCount > 0 ? { '/admin/leaves': pendingLeaveCount } : {};

  function handleLogout() {
    signOut({ callbackUrl: '/login' });
  }

  return (
    <div className="flex h-dvh overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <Sidebar navItems={navItems} navBadges={navBadges} />
      </div>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopNav user={user} navItems={navItems} onLogout={handleLogout} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
