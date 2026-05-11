'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { MoreHorizontal } from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger, SheetClose } from '@/components/ui/sheet';
import { getPrimaryNav, getOverflowNav } from '@/lib/primary-nav';
import { groupNavItems } from '@/lib/nav-groups';
import type { NavItem } from '@/lib/constants';
import { cn } from '@/lib/utils';

interface RoleTabBarProps {
  role: string;
  navItems: NavItem[];
  navBadges?: Record<string, number>;
}

const DASHBOARD_HREFS = new Set(['/admin', '/trainer', '/client']);

function isHrefActive(pathname: string, href: string): boolean {
  if (DASHBOARD_HREFS.has(href)) return pathname === href;
  return pathname === href || pathname.startsWith(href + '/');
}

export function RoleTabBar({ role, navItems, navBadges }: RoleTabBarProps) {
  const pathname = usePathname();

  const primary = getPrimaryNav(role);
  const overflow = getOverflowNav(role, navItems);

  if (primary.length === 0) return null;

  const moreActive = overflow.some((item) => isHrefActive(pathname, item.href));
  const moreBadge = overflow.reduce((sum, item) => sum + (navBadges?.[item.href] ?? 0), 0);

  const tabs = [
    ...primary.map((item) => ({
      key: item.href,
      label: item.label,
      icon: item.icon,
      href: item.href,
      active: isHrefActive(pathname, item.href),
      badge: navBadges?.[item.href] ?? 0,
    })),
  ];

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:hidden"
      style={{
        paddingBottom: 'max(env(safe-area-inset-bottom), 0.5rem)',
        transform: 'translateZ(0)',
      }}
    >
      <nav
        role="tablist"
        aria-label="Primary"
        className="relative mx-auto flex h-14 max-w-screen-md items-stretch px-1"
      >
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            href={tab.href}
            role="tab"
            aria-selected={tab.active}
            aria-current={tab.active ? 'page' : undefined}
            className="relative flex flex-1 items-center justify-center"
          >
            {tab.active && (
              <motion.span
                layoutId="role-tab-pill"
                aria-hidden
                className="absolute inset-x-1 inset-y-1.5 rounded-xl bg-primary/12"
                transition={{ type: 'spring', stiffness: 480, damping: 38, mass: 0.6 }}
              />
            )}
            <span
              className={cn(
                'relative z-10 flex flex-col items-center justify-center gap-0.5 px-1 transition-colors',
                tab.active ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              <span className="relative">
                <tab.icon className="h-[18px] w-[18px]" strokeWidth={tab.active ? 2.4 : 2} />
                {tab.badge > 0 && (
                  <span className="absolute -right-2 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-none text-white">
                    {tab.badge > 9 ? '9+' : tab.badge}
                  </span>
                )}
              </span>
              <span
                className={cn(
                  'text-[10px] leading-none tracking-tight',
                  tab.active ? 'font-semibold' : 'font-medium',
                )}
              >
                {tab.label}
              </span>
            </span>
          </Link>
        ))}

        {overflow.length > 0 && (
          <Sheet>
            <SheetTrigger
              className="relative flex flex-1 items-center justify-center outline-none"
              aria-label="More"
            >
              {moreActive && (
                <motion.span
                  layoutId="role-tab-pill"
                  aria-hidden
                  className="absolute inset-x-1 inset-y-1.5 rounded-xl bg-primary/12"
                  transition={{ type: 'spring', stiffness: 480, damping: 38, mass: 0.6 }}
                />
              )}
              <span
                className={cn(
                  'relative z-10 flex flex-col items-center justify-center gap-0.5 px-1 transition-colors',
                  moreActive ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                <span className="relative">
                  <MoreHorizontal
                    className="h-[18px] w-[18px]"
                    strokeWidth={moreActive ? 2.4 : 2}
                  />
                  {moreBadge > 0 && (
                    <span className="absolute -right-2 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-none text-white">
                      {moreBadge > 9 ? '9+' : moreBadge}
                    </span>
                  )}
                </span>
                <span
                  className={cn(
                    'text-[10px] leading-none tracking-tight',
                    moreActive ? 'font-semibold' : 'font-medium',
                  )}
                >
                  More
                </span>
              </span>
            </SheetTrigger>
            <SheetContent
              side="bottom"
              showCloseButton={false}
              className="rounded-t-2xl border-border/60 p-0"
            >
              <div
                className="flex max-h-[78dvh] flex-col"
                style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
              >
                <div className="flex shrink-0 items-center justify-between px-5 pt-4 pb-2">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                      Menu
                    </p>
                    <p className="text-base font-semibold text-foreground">More options</p>
                  </div>
                  <SheetClose
                    aria-label="Close"
                    className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  </SheetClose>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
                  {groupNavItems(overflow).map((group, groupIndex) => (
                    <div key={groupIndex} className={cn(groupIndex > 0 && 'mt-3')}>
                      {group.label && (
                        <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
                          {group.label}
                        </p>
                      )}
                      <div className="grid grid-cols-1 gap-0.5">
                        {group.items.map((item) => {
                          const Icon = item.icon;
                          const active = isHrefActive(pathname, item.href);
                          const badge = navBadges?.[item.href] ?? 0;
                          return (
                            <SheetClose
                              key={item.href}
                              nativeButton={false}
                              render={<Link href={item.href} />}
                            >
                              <span
                                className={cn(
                                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors active:scale-[0.99]',
                                  active
                                    ? 'bg-primary/12 text-primary'
                                    : 'text-foreground/80 hover:bg-muted',
                                )}
                              >
                                <Icon
                                  className={cn(
                                    'h-5 w-5 shrink-0',
                                    active ? 'text-primary' : 'text-muted-foreground',
                                  )}
                                />
                                <span className="flex-1 font-medium">{item.label}</span>
                                {badge > 0 && (
                                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                                    {badge > 99 ? '99+' : badge}
                                  </span>
                                )}
                              </span>
                            </SheetClose>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </SheetContent>
          </Sheet>
        )}
      </nav>
    </div>
  );
}
