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
    <header className="flex h-14 items-center justify-between border-b border-border/50 bg-background px-4">
      {/* Left side — logo */}
      <Link href="/" className="lg:hidden">
        <Logo className="h-8" />
      </Link>
      {/* Desktop spacer (logo is in sidebar) */}
      <div className="hidden lg:block" />

      {/* Right side — notifications, theme, profile, hamburger */}
      <div className="flex items-center gap-2">
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
            className={cn(buttonVariants({ variant: 'ghost' }), 'hidden gap-2 px-2 lg:inline-flex')}
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
            <DropdownMenuTrigger className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }))}>
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
              side="right"
              showCloseButton={false}
              className="w-full max-w-none border-none sm:max-w-none bg-gradient-to-b from-[#1a1a1a] to-[#111] p-0 flex flex-col h-full overflow-hidden"
            >
              {/* Header — logo + close */}
              <div className="flex items-center justify-between px-6 pt-6 pb-4">
                <Logo className="h-10" variant="dark" />
                <SheetClose className="rounded-sm p-1 text-white/60 transition-colors hover:text-white">
                  <X className="h-6 w-6" />
                  <span className="sr-only">Close</span>
                </SheetClose>
              </div>

              {/* Nav items — numbered, large, uppercase */}
              <nav className="mt-4 flex-1 min-h-0 overflow-y-auto flex flex-col px-6">
                {navItems.map((item, index) => {
                  const isDashboard =
                    item.href === '/admin' || item.href === '/trainer' || item.href === '/client';
                  const isActive = isDashboard
                    ? pathname === item.href
                    : pathname === item.href || pathname.startsWith(item.href + '/');
                  const num = String(index + 1).padStart(2, '0');

                  return (
                    <SheetClose
                      key={item.href}
                      nativeButton={false}
                      render={<Link href={item.href} />}
                    >
                      <span
                        className={cn(
                          'flex items-baseline gap-4 border-b border-white/10 py-5 transition-colors',
                          isActive ? 'text-[#E8652C]' : 'text-white/80 hover:text-white',
                        )}
                      >
                        <span className="text-xs font-light text-white/30">{num}</span>
                        <span className="text-xl font-bold uppercase tracking-[0.15em]">
                          {item.label}
                        </span>
                      </span>
                    </SheetClose>
                  );
                })}
              </nav>

              {/* Bottom section — theme toggle + user */}
              <div className="shrink-0 px-6 pb-8">
                <div className="border-t border-white/10 pt-6">
                  {/* Theme toggle in hamburger */}
                  <button
                    onClick={toggleTheme}
                    className="mb-5 flex items-center gap-3 text-sm text-white/60 transition-colors hover:text-white"
                  >
                    <Sun className="h-4 w-4 dark:hidden" />
                    <Moon className="hidden h-4 w-4 dark:block" />
                    <span>Switch to {theme === 'dark' ? 'light' : 'dark'} mode</span>
                  </button>

                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10 border border-white/20">
                      <AvatarFallback className="bg-[#E8652C]/20 text-[#E8652C] text-sm font-semibold">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium text-white">
                        {user.firstName} {user.lastName}
                      </p>
                      <p className="text-xs text-white/40">{roleLabel}</p>
                    </div>
                  </div>
                  <button
                    onClick={onLogout}
                    className="mt-4 flex items-center gap-2 text-sm text-white/50 transition-colors hover:text-white"
                  >
                    <LogOut className="h-4 w-4" />
                    Log out
                  </button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
