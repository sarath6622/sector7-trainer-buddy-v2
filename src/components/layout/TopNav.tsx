'use client';

import { Bell, ChevronDown, LogOut, Menu, User } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Sidebar } from './Sidebar';
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

  return (
    <header className="flex h-14 items-center justify-between border-b bg-background px-4">
      {/* Mobile menu */}
      <div className="flex items-center gap-2 lg:hidden">
        <Sheet>
          <SheetTrigger className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }))}>
            <Menu className="h-5 w-5" />
            <span className="sr-only">Toggle menu</span>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0">
            <Sidebar navItems={navItems} />
          </SheetContent>
        </Sheet>
        <span className="text-lg font-bold lg:hidden">Sector 7</span>
      </div>

      {/* Spacer for desktop */}
      <div className="hidden lg:block" />

      <div className="flex items-center gap-3">
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
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          <Badge
            variant="destructive"
            className="absolute -right-1 -top-1 h-4 w-4 rounded-full p-0 text-[10px]"
          >
            0
          </Badge>
          <span className="sr-only">Notifications</span>
        </Button>

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger className={cn(buttonVariants({ variant: 'ghost' }), 'gap-2 px-2')}>
            <Avatar className="h-7 w-7">
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
            <span className="hidden text-sm sm:block">
              {user.firstName} {user.lastName}
            </span>
            <ChevronDown className="h-3 w-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56">
            <div className="px-2 py-1.5">
              <p className="text-sm font-medium">
                {user.firstName} {user.lastName}
              </p>
              <p className="text-xs text-muted-foreground">{user.email}</p>
              <Badge variant="secondary" className="mt-1 text-[10px]">
                {user.role.replace('_', ' ')}
              </Badge>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <User className="mr-2 h-4 w-4" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
