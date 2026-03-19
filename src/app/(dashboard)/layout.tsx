'use client';

import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopNav } from '@/components/layout/TopNav';
import { NAV_BY_ROLE } from '@/lib/constants';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();

  if (status === 'loading') {
    return (
      <div className="flex h-dvh items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!session?.user) {
    router.push('/login');
    return null;
  }

  const user = {
    firstName: session.user.firstName ?? '',
    lastName: session.user.lastName ?? '',
    email: session.user.email ?? '',
    role: session.user.role ?? '',
  };

  const navItems = NAV_BY_ROLE[user.role] ?? [];

  function handleLogout() {
    signOut({ callbackUrl: '/login' });
  }

  return (
    <div className="flex h-dvh overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <Sidebar navItems={navItems} />
      </div>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopNav user={user} navItems={navItems} onLogout={handleLogout} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
