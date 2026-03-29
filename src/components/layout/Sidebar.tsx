'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Logo } from './Logo';
import type { NavItem } from '@/lib/constants';

interface SidebarProps {
  navItems: NavItem[];
  navBadges?: Record<string, number>; // href → badge count
  className?: string;
}

export function Sidebar({ navItems, navBadges, className }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className={cn('flex h-full w-64 flex-col border-r border-border/50 bg-sidebar', className)}
    >
      <div className="flex h-16 items-center border-b border-border/50 px-4">
        <Link href="/">
          <Logo className="h-10" />
        </Link>
      </div>

      <nav className="flex-1 space-y-1 p-2">
        {navItems.map((item) => {
          const isDashboard =
            item.href === '/admin' || item.href === '/trainer' || item.href === '/client';
          const isActive = isDashboard
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(item.href + '/');
          const Icon = item.icon;
          const badge = navBadges?.[item.href];

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary/15 text-primary font-semibold'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="flex-1">{item.label}</span>
              {badge != null && badge > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
