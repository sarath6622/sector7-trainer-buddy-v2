'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import { ChevronDown, LogOut, Menu, Moon, Settings, Sun, User, X } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Sheet, SheetContent, SheetTrigger, SheetClose } from '@/components/ui/sheet';
import { Logo } from './Logo';
import { NotificationBell } from './NotificationBell';
import type { NavItem } from '@/lib/constants';
import { groupNavItems } from '@/lib/nav-groups';
import { cn } from '@/lib/utils';

interface TopNavProps {
  user: {
    firstName: string;
    lastName: string;
    email: string;
    role: string;
    branchName?: string;
  };
  navItems: NavItem[];
  branches?: { id: string; name: string }[];
  activeBranchId?: string;
  onBranchChange?: (branchId: string) => void;
  onLogout?: () => void;
}

export function TopNav({
  user,
  navItems,
  branches = [],
  activeBranchId,
  onBranchChange,
  onLogout,
}: TopNavProps) {
  const initials = `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
  const activeBranch = branches.find((b) => b.id === activeBranchId);
  const pathname = usePathname();
  const roleLabel = user.role.replace('_', ' ');
  const { theme, setTheme } = useTheme();

  function toggleTheme() {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }

  return (
    <header
      className="shrink-0 border-b border-border/50 bg-background"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="flex h-12 items-center justify-between px-3 lg:h-14 lg:px-4">
        {/* Left side — logo */}
        <Link href="/" className="lg:hidden">
          <Logo className="h-7" />
        </Link>
        {/* Desktop spacer (logo is in sidebar) */}
        <div className="hidden lg:block" />

        {/* Right side — notifications, theme, profile, hamburger */}
        <div className="flex items-center gap-1.5 lg:gap-2">
          {/* Branch selector (admin only) */}
          {branches.length > 1 && onBranchChange && (
            <DropdownMenu>
              <DropdownMenuTrigger
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1')}
              >
                {activeBranch?.name ?? 'Select branch'}
                <ChevronDown className="h-3 w-3" />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {branches.map((branch) => (
                  <DropdownMenuItem key={branch.id} onClick={() => onBranchChange(branch.id)}>
                    {branch.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Notifications */}
          <NotificationBell />

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }))}
            aria-label="Toggle theme"
          >
            <Sun className="h-4 w-4 rotate-0 scale-100 transition-transform dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100" />
          </button>

          {/* User menu — desktop */}
          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                buttonVariants({ variant: 'ghost' }),
                'hidden gap-2 px-2 lg:inline-flex',
              )}
            >
              <Avatar className="h-7 w-7">
                <AvatarFallback className="bg-[#E8652C]/20 text-[#E8652C] text-xs font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm">
                {user.firstName} {user.lastName}
              </span>
              <ChevronDown className="h-3 w-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 rounded-xl p-0 overflow-hidden">
              <div className="bg-gradient-to-br from-[#E8652C]/10 to-transparent px-4 py-4">
                <div className="flex items-center gap-3">
                  <Avatar className="h-11 w-11 border-2 border-[#E8652C]/30">
                    <AvatarFallback className="bg-[#E8652C]/20 text-[#E8652C] text-sm font-bold">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {user.firstName} {user.lastName}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                  </div>
                </div>
                <span className="mt-2 inline-block rounded-full bg-[#E8652C]/15 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[#E8652C]">
                  {roleLabel}
                </span>
              </div>
              <DropdownMenuSeparator className="m-0" />
              <div className="p-1.5">
                <DropdownMenuItem className="gap-2.5 rounded-lg px-3 py-2.5">
                  <User className="h-4 w-4 text-muted-foreground" />
                  Profile
                </DropdownMenuItem>
                <DropdownMenuItem className="gap-2.5 rounded-lg px-3 py-2.5">
                  <Settings className="h-4 w-4 text-muted-foreground" />
                  Settings
                </DropdownMenuItem>
              </div>
              <DropdownMenuSeparator className="m-0" />
              <div className="p-1.5">
                <DropdownMenuItem
                  onClick={onLogout}
                  className="gap-2.5 rounded-lg px-3 py-2.5 text-red-400 focus:text-red-400"
                >
                  <LogOut className="h-4 w-4" />
                  Log out
                </DropdownMenuItem>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Mobile — avatar + hamburger */}
          <div className="flex items-center gap-1 lg:hidden">
            {/* Mobile profile dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger
                className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }))}
              >
                <Avatar className="h-8 w-8 border border-border/50">
                  <AvatarFallback className="bg-[#E8652C]/20 text-[#E8652C] text-xs font-semibold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72 rounded-xl p-0 overflow-hidden">
                <div className="bg-gradient-to-br from-[#E8652C]/10 to-transparent px-4 py-4">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-12 w-12 border-2 border-[#E8652C]/30">
                      <AvatarFallback className="bg-[#E8652C]/20 text-[#E8652C] font-bold">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {user.firstName} {user.lastName}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                    </div>
                  </div>
                  <span className="mt-2.5 inline-block rounded-full bg-[#E8652C]/15 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[#E8652C]">
                    {roleLabel}
                  </span>
                </div>
                <DropdownMenuSeparator className="m-0" />
                <div className="p-1.5">
                  <DropdownMenuItem className="gap-2.5 rounded-lg px-3 py-2.5">
                    <User className="h-4 w-4 text-muted-foreground" />
                    Profile
                  </DropdownMenuItem>
                  <DropdownMenuItem className="gap-2.5 rounded-lg px-3 py-2.5">
                    <Settings className="h-4 w-4 text-muted-foreground" />
                    Settings
                  </DropdownMenuItem>
                </div>
                <DropdownMenuSeparator className="m-0" />
                <div className="p-1.5">
                  <DropdownMenuItem
                    onClick={onLogout}
                    className="gap-2.5 rounded-lg px-3 py-2.5 text-red-400 focus:text-red-400"
                  >
                    <LogOut className="h-4 w-4" />
                    Log out
                  </DropdownMenuItem>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Hamburger menu */}
            <Sheet>
              <SheetTrigger className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }))}>
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle menu</span>
              </SheetTrigger>
              <SheetContent
                side="left"
                showCloseButton={false}
                className="w-[80vw] max-w-sm border-none bg-sidebar p-0"
              >
                <div
                  className="flex h-[var(--app-height)] flex-col overflow-hidden"
                  style={{ paddingTop: 'env(safe-area-inset-top)' }}
                >
                  {/* Header — logo + close */}
                  <div className="shrink-0 flex items-center justify-between px-6 pt-6 pb-4">
                    <Logo className="h-10" />
                    <SheetClose className="rounded-sm p-1 text-sidebar-foreground/50 transition-colors hover:text-sidebar-foreground">
                      <X className="h-6 w-6" />
                      <span className="sr-only">Close</span>
                    </SheetClose>
                  </div>

                  {/* Nav items */}
                  <nav className="mt-2 flex-1 min-h-0 overflow-y-auto px-4 pb-2">
                    {groupNavItems(navItems).map((group, groupIndex) => (
                      <div key={groupIndex} className={cn(groupIndex > 0 && 'mt-5')}>
                        {group.label && (
                          <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40">
                            {group.label}
                          </p>
                        )}
                        <div>
                          {group.items.map((item) => {
                            const isDashboard =
                              item.href === '/admin' ||
                              item.href === '/trainer' ||
                              item.href === '/client';
                            const isActive = isDashboard
                              ? pathname === item.href
                              : pathname === item.href || pathname.startsWith(item.href + '/');
                            const Icon = item.icon;
                            return (
                              <SheetClose
                                key={item.href}
                                nativeButton={false}
                                render={<Link href={item.href} />}
                              >
                                <span
                                  className={cn(
                                    'flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all active:scale-95 active:opacity-70',
                                    isActive
                                      ? 'text-primary bg-primary/10'
                                      : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent',
                                  )}
                                >
                                  <Icon
                                    className={cn(
                                      'h-5 w-5 shrink-0',
                                      isActive ? 'text-primary' : 'text-sidebar-foreground/40',
                                    )}
                                  />
                                  <span className="text-base font-semibold">{item.label}</span>
                                </span>
                              </SheetClose>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </nav>

                  {/* Bottom section — user */}
                  <div
                    className="shrink-0 px-4"
                    style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
                  >
                    <div className="border-t border-sidebar-border pt-3">
                      <div className="flex items-center justify-between gap-3 rounded-xl bg-sidebar-accent px-3 py-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Avatar className="h-8 w-8 border border-sidebar-border shrink-0">
                            <AvatarFallback className="bg-primary/20 text-primary text-xs font-semibold">
                              {initials}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-sidebar-foreground truncate">
                              {user.firstName} {user.lastName}
                            </p>
                            <p className="text-xs text-sidebar-foreground/60 uppercase tracking-wide">
                              {roleLabel}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={onLogout}
                          className="shrink-0 p-1.5 rounded-lg text-sidebar-foreground/40 hover:text-red-500 hover:bg-red-500/10 transition-colors"
                          aria-label="Log out"
                        >
                          <LogOut className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </header>
  );
}
