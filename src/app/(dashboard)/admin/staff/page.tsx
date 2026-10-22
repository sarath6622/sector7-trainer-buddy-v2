'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import {
  Check,
  KeyRound,
  Loader2,
  MoreVertical,
  Plus,
  Search,
  ShieldCheck,
  UserCog,
  UserX,
  UserCheck,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useConfirm } from '@/hooks/use-confirm';
import { ACCESS_LEVEL_LABELS, type AccessLevel } from '@/lib/roles';

interface StaffMember {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  roles: string[];
  accessLevel: AccessLevel;
  isActive: boolean;
  lastLoginAt: string | null;
  activeClientCount: number;
  trainerProfileId: string | null;
}

const LEVELS: AccessLevel[] = ['ADMIN', 'HEAD_COACH', 'TRAINER'];

const LEVEL_DESCRIPTIONS: Record<AccessLevel, string> = {
  ADMIN: 'Runs the gym: clients, scheduling, packages, settings. Does not train clients.',
  HEAD_COACH:
    'Everything an admin can do, plus their own clients and sessions on the trainer side.',
  TRAINER: 'Their own clients, schedule, sessions and workout logs.',
};

const LEVEL_BADGE: Record<AccessLevel, string> = {
  HEAD_COACH: 'bg-primary/15 text-primary',
  ADMIN: 'bg-violet-500/15 text-violet-500',
  TRAINER: 'bg-sky-500/15 text-sky-500',
};

/** POST /api/admin/users roles for a new account at each level. */
const CREATE_ROLES: Record<Exclude<AccessLevel, 'TRAINER'>, string[]> = {
  ADMIN: ['BRANCH_ADMIN'],
  HEAD_COACH: ['BRANCH_ADMIN', 'TRAINER'],
};

type Filter = 'all' | AccessLevel | 'inactive';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'ADMIN', label: 'Admins' },
  { key: 'HEAD_COACH', label: 'Head Coaches' },
  { key: 'TRAINER', label: 'Trainers' },
  { key: 'inactive', label: 'Inactive' },
];

function LevelPicker({
  value,
  onChange,
}: {
  value: AccessLevel;
  onChange: (level: AccessLevel) => void;
}) {
  return (
    <div className="space-y-2" role="radiogroup" aria-label="Access level">
      {LEVELS.map((level) => {
        const selected = value === level;
        return (
          <button
            key={level}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(level)}
            className={cn(
              'flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left ring-1 transition-colors',
              selected ? 'bg-primary/10 ring-primary' : 'ring-border/60 hover:bg-muted/40',
            )}
          >
            <span
              className={cn(
                'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full ring-1',
                selected ? 'bg-primary ring-primary text-primary-foreground' : 'ring-border',
              )}
            >
              {selected && <Check className="h-3 w-3" />}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{ACCESS_LEVEL_LABELS[level]}</span>
              <span className="block text-xs text-muted-foreground">
                {LEVEL_DESCRIPTIONS[level]}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

const EMPTY_FORM = { firstName: '', lastName: '', email: '', phone: '', password: '' };

export default function StaffAccessPage() {
  const { data: session } = useSession();
  const myId = session?.user?.id;
  const { confirm, ConfirmDialog } = useConfirm();

  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');

  // Change access
  const [accessTarget, setAccessTarget] = useState<StaffMember | null>(null);
  const [accessLevel, setAccessLevel] = useState<AccessLevel>('TRAINER');
  const [accessError, setAccessError] = useState('');
  const [savingAccess, setSavingAccess] = useState(false);

  // Reset password
  const [pwTarget, setPwTarget] = useState<StaffMember | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [pwError, setPwError] = useState('');
  const [savingPw, setSavingPw] = useState(false);

  // Add staff
  const [addOpen, setAddOpen] = useState(false);
  const [addLevel, setAddLevel] = useState<AccessLevel>('ADMIN');
  const [form, setForm] = useState(EMPTY_FORM);
  const [addError, setAddError] = useState('');
  const [adding, setAdding] = useState(false);

  const fetchStaff = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/staff');
      if (res.ok) {
        const json = await res.json();
        setStaff(json.data);
      }
    } catch (err) {
      console.error('Failed to fetch staff:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  const visible = useMemo(() => {
    const terms = search.toLowerCase().split(/\s+/).filter(Boolean);
    return staff.filter((s) => {
      if (filter === 'inactive' && s.isActive) return false;
      if (filter !== 'all' && filter !== 'inactive' && (s.accessLevel !== filter || !s.isActive))
        return false;
      const haystack = `${s.firstName} ${s.lastName} ${s.email}`.toLowerCase();
      return terms.every((t) => haystack.includes(t));
    });
  }, [staff, filter, search]);

  const activeCount = staff.filter((s) => s.isActive).length;
  const adminCount = staff.filter((s) => s.isActive && s.accessLevel !== 'TRAINER').length;

  async function patchStaff(id: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/admin/staff/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error ?? 'Something went wrong');
    const updated = json.data as StaffMember;
    setStaff((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    return updated;
  }

  function openAccess(member: StaffMember) {
    setAccessTarget(member);
    setAccessLevel(member.accessLevel);
    setAccessError('');
  }

  async function saveAccess() {
    if (!accessTarget) return;
    setSavingAccess(true);
    setAccessError('');
    try {
      const updated = await patchStaff(accessTarget.id, { accessLevel });
      toast.success(
        `${updated.firstName} is now ${ACCESS_LEVEL_LABELS[updated.accessLevel].toLowerCase()}`,
      );
      setAccessTarget(null);
    } catch (err) {
      setAccessError((err as Error).message);
    } finally {
      setSavingAccess(false);
    }
  }

  async function toggleActive(member: StaffMember) {
    const deactivating = member.isActive;
    if (deactivating) {
      const ok = await confirm({
        title: `Deactivate ${member.firstName}?`,
        description:
          'They will be signed out within a minute and cannot log in until reactivated. Their history stays.',
        confirmText: 'Deactivate',
        variant: 'destructive',
      });
      if (!ok) return;
    }
    try {
      await patchStaff(member.id, { isActive: !deactivating });
      toast.success(
        deactivating ? `${member.firstName} deactivated` : `${member.firstName} reactivated`,
      );
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function savePassword() {
    if (!pwTarget) return;
    if (newPassword.length < 6) {
      setPwError('Password must be at least 6 characters');
      return;
    }
    setSavingPw(true);
    setPwError('');
    try {
      const res = await fetch(`/api/admin/users/${pwTarget.id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? 'Failed to reset password');
      }
      toast.success(`Password updated for ${pwTarget.firstName}`);
      setPwTarget(null);
      setNewPassword('');
    } catch (err) {
      setPwError((err as Error).message);
    } finally {
      setSavingPw(false);
    }
  }

  function openAdd() {
    setAddLevel('ADMIN');
    setForm(EMPTY_FORM);
    setAddError('');
    setAddOpen(true);
  }

  async function createStaff() {
    if (addLevel === 'TRAINER') return;
    if (!form.firstName.trim() || !form.lastName.trim() || !form.email.trim()) {
      setAddError('Name and email are required');
      return;
    }
    if (form.password.length < 6) {
      setAddError('Temporary password must be at least 6 characters');
      return;
    }
    setAdding(true);
    setAddError('');
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || undefined,
          password: form.password,
          roles: CREATE_ROLES[addLevel],
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'Failed to create account');
      toast.success(
        `${form.firstName.trim()} added as ${ACCESS_LEVEL_LABELS[addLevel].toLowerCase()}`,
      );
      setAddOpen(false);
      fetchStaff();
    } catch (err) {
      setAddError((err as Error).message);
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="space-y-3 pb-8">
      {ConfirmDialog}

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight">Staff &amp; Access</h1>
          <p className="text-xs text-muted-foreground">
            {activeCount} active &middot; {adminCount} with admin access
          </p>
        </div>
        <button
          onClick={openAdd}
          className="flex shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Plus className="h-3.5 w-3.5" />
          Add staff
        </button>
      </div>

      {/* Filters */}
      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5 md:mx-0 md:px-0">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              'shrink-0 rounded-full px-3 py-1 text-xs font-medium ring-1 transition-colors',
              filter === f.key
                ? 'bg-foreground text-background ring-foreground'
                : 'text-muted-foreground ring-border/60 hover:text-foreground',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by name or email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 pl-8 text-sm"
        />
      </div>

      {/* List */}
      {loading ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[68px] rounded-xl" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/60">
            <Users className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">
            {search || filter !== 'all' ? 'No staff match this filter' : 'No staff yet'}
          </p>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {visible.map((member) => {
            const isMe = member.id === myId;
            const initials =
              `${member.firstName[0] ?? ''}${member.lastName[0] ?? ''}`.toUpperCase();
            const isTrainerSide = member.accessLevel !== 'ADMIN';
            return (
              <div
                key={member.id}
                className={cn(
                  'flex items-center gap-3 rounded-xl bg-card px-3 py-2.5 ring-1 ring-border/50',
                  !member.isActive && 'opacity-60',
                )}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                  {initials}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-sm font-semibold leading-tight">
                      {member.firstName} {member.lastName}
                    </p>
                    {isMe && (
                      <span className="shrink-0 rounded-full bg-muted px-1.5 py-px text-[9px] font-semibold text-muted-foreground">
                        You
                      </span>
                    )}
                  </div>
                  <p className="truncate text-[11px] text-muted-foreground">{member.email}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span
                      className={cn(
                        'rounded-full px-1.5 py-px text-[10px] font-semibold',
                        LEVEL_BADGE[member.accessLevel],
                      )}
                    >
                      {ACCESS_LEVEL_LABELS[member.accessLevel]}
                    </span>
                    {!member.isActive && (
                      <span className="rounded-full bg-zinc-500/15 px-1.5 py-px text-[10px] font-semibold text-zinc-500">
                        Inactive
                      </span>
                    )}
                    <span className="text-[10px] text-muted-foreground">
                      {isTrainerSide &&
                        `${member.activeClientCount} client${member.activeClientCount === 1 ? '' : 's'} · `}
                      {member.lastLoginAt
                        ? `Seen ${formatDistanceToNow(new Date(member.lastLoginAt), { addSuffix: true })}`
                        : 'Never logged in'}
                    </span>
                  </div>
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger
                    aria-label={`Actions for ${member.firstName}`}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem
                      disabled={isMe}
                      onClick={() => openAccess(member)}
                      className="gap-2"
                    >
                      <ShieldCheck className="h-4 w-4" />
                      Change access
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        setPwTarget(member);
                        setNewPassword('');
                        setPwError('');
                      }}
                      className="gap-2"
                    >
                      <KeyRound className="h-4 w-4" />
                      Reset password
                    </DropdownMenuItem>
                    {member.trainerProfileId && (
                      <DropdownMenuItem
                        render={<Link href={`/admin/trainers/${member.id}`} />}
                        className="gap-2"
                      >
                        <UserCog className="h-4 w-4" />
                        Trainer profile and shifts
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      disabled={isMe}
                      onClick={() => toggleActive(member)}
                      className={cn('gap-2', member.isActive && 'text-red-500 focus:text-red-500')}
                    >
                      {member.isActive ? (
                        <UserX className="h-4 w-4" />
                      ) : (
                        <UserCheck className="h-4 w-4" />
                      )}
                      {member.isActive ? 'Deactivate' : 'Reactivate'}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })}
        </div>
      )}

      {/* Change access */}
      <Dialog open={!!accessTarget} onOpenChange={(open) => !open && setAccessTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Access for {accessTarget?.firstName} {accessTarget?.lastName}
            </DialogTitle>
            <DialogDescription>Takes effect within a minute, no re-login needed.</DialogDescription>
          </DialogHeader>
          <LevelPicker value={accessLevel} onChange={setAccessLevel} />
          {accessError && <p className="text-xs text-red-500">{accessError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAccessTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={saveAccess}
              disabled={savingAccess || accessLevel === accessTarget?.accessLevel}
            >
              {savingAccess && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset password */}
      <Dialog open={!!pwTarget} onOpenChange={(open) => !open && setPwTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reset password</DialogTitle>
            <DialogDescription>
              Set a new password for {pwTarget?.firstName} and share it with them directly.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              type="text"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          {pwError && <p className="text-xs text-red-500">{pwError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPwTarget(null)}>
              Cancel
            </Button>
            <Button onClick={savePassword} disabled={savingPw}>
              {savingPw && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Update password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add staff */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-h-[85vh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add staff</DialogTitle>
            <DialogDescription>Each person gets their own login.</DialogDescription>
          </DialogHeader>

          <LevelPicker value={addLevel} onChange={setAddLevel} />

          {addLevel === 'TRAINER' ? (
            <div className="rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground">
              Trainers also need specialties and shifts, so they are added from the trainer form.
              <Link
                href="/admin/trainers/new"
                className="mt-2 flex w-fit items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 font-semibold text-primary-foreground"
              >
                <Plus className="h-3.5 w-3.5" />
                Open trainer form
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="s-first">First name</Label>
                <Input
                  id="s-first"
                  value={form.firstName}
                  onChange={(e) => setForm((p) => ({ ...p, firstName: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="s-last">Last name</Label>
                <Input
                  id="s-last"
                  value={form.lastName}
                  onChange={(e) => setForm((p) => ({ ...p, lastName: e.target.value }))}
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="s-email">Email</Label>
                <Input
                  id="s-email"
                  type="email"
                  autoComplete="off"
                  value={form.email}
                  onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="s-phone">Phone (optional)</Label>
                <Input
                  id="s-phone"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="s-password">Temporary password</Label>
                <Input
                  id="s-password"
                  type="text"
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                />
              </div>
              {addLevel === 'HEAD_COACH' && (
                <p className="col-span-2 text-xs text-muted-foreground">
                  After creating, set their shifts from Trainer profile and shifts so clients can be
                  scheduled with them.
                </p>
              )}
            </div>
          )}

          {addError && <p className="text-xs text-red-500">{addError}</p>}

          {addLevel !== 'TRAINER' && (
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddOpen(false)}>
                Cancel
              </Button>
              <Button onClick={createStaff} disabled={adding}>
                {adding && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Create account
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
