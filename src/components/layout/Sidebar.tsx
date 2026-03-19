'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import type { NavItem } from '@/lib/constants';

interface SidebarProps {
  navItems: NavItem[];
  className?: string;
}

export function Sidebar({ navItems, className }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className={cn('flex h-full w-64 flex-col border-r border-border/50 bg-sidebar', className)}
    >
      <div className="flex h-14 items-center border-b border-border/50 px-4">
        <Link href="/">
          <Image
            src="/sector7-logo.png"
            alt="Sector 7"
            width={120}
            height={60}
            className="h-9 w-auto"
          />
        </Link>
      </div>

      <nav className="flex-1 space-y-1 p-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          const Icon = item.icon;

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
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
