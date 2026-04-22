'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar, CalendarDayButton } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

// ─── Types ─────────────────────────────────────────────────────────────────

interface LeaveRequest {
  id: string;
  trainerProfileId: string;
  startDate: string;
  endDate: string;
  reason: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  leaveCategory: 'REGULAR' | 'EMERGENCY';
  leaveType: string;
  reviewNotes: string | null;
  createdAt: string;
  trainer: {
    user: { firstName: string; lastName: string };
  };
}

interface AffectedSession {
  id: string;
  scheduledDate: string;
  scheduledTime: string;
  durationMin: number;
  clientName: string;
}

interface LeaveDetail extends LeaveRequest {
  affectedSessions: AffectedSession[];
}

interface Trainer {
  id: string;
  name: string;
}

interface EmergencyBalance {
  quota: number;
  used: number;
  remaining: number;
}

interface LeaveBalance {
  month: string;
  regular: { quota: number; used: number; remaining: number };
  emergency: { quota: number; used: number; remaining: number };
}

// ─── Constants ──────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  PENDING: { label: 'Pending', className: 'bg-amber-500/15 text-amber-500 border-amber-500/25' },
  APPROVED: {
    label: 'Approved',
    className: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/25',
  },
  REJECTED: { label: 'Rejected', className: 'bg-red-500/15 text-red-500 border-red-500/25' },
} as const;

// ─── Helpers ────────────────────────────────────────────────────────────────

function currentMonthStr() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
}

function shiftMonth(m: string, delta: -1 | 1) {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y!, mo! - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonthLabel(m: string) {
  const [y, mo] = m.split('-').map(Number);
  return new Date(y!, mo! - 1).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  });
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatDateShort(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatTime12(t: string) {
  const [h = '0', m = '00'] = t.split(':');
  const hour = parseInt(h, 10);
  return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`;
}

function daysBetween(start: string, end: string) {
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86_400_000) + 1;
}

function isSameDay(a: string, b: string) {
  return a.slice(0, 10) === b.slice(0, 10);
}

function initials(first: string, last: string) {
  return `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase();
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function StatTile({
  label,
  value,
  active,
  colorClass,
  onClick,
}: {
  label: string;
  value: number;
  active: boolean;
  colorClass: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-xl px-3 py-3 text-center transition-all ring-1 ${
        active ? `${colorClass} ring-current/30` : 'bg-card ring-border/50 hover:bg-muted/30'
      }`}
    >
      <p className={`text-2xl font-bold tabular-nums ${active ? '' : 'text-foreground'}`}>
        {value}
      </p>
      <p className={`text-[11px] mt-0.5 ${active ? 'opacity-80' : 'text-muted-foreground'}`}>
        {label}
      </p>
    </button>
  );
}

function CategoryChip({
  label,
  active,
  onClick,
  colorClass,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  colorClass: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
        active ? colorClass : 'bg-muted/50 text-muted-foreground hover:bg-muted'
      }`}
    >
      {label}
    </button>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function AdminLeavesPage() {
  const [allLeaves, setAllLeaves] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(currentMonthStr());
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [trainerFilter, setTrainerFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const [selectedLeave, setSelectedLeave] = useState<LeaveDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reviewNotes, setReviewNotes] = useState('');
  const [reviewCategory, setReviewCategory] = useState<'REGULAR' | 'EMERGENCY'>('REGULAR');
  const [actionLoading, setActionLoading] = useState(false);
  const [leaveBalance, setLeaveBalance] = useState<LeaveBalance | null>(null);
  const [leaveBalanceLoading, setLeaveBalanceLoading] = useState(false);
  const [showLeaveCalendar, setShowLeaveCalendar] = useState(false);

  // ── Emergency leave dialog state ──────────────────────────────────────────
  const [emergencyOpen, setEmergencyOpen] = useState(false);
  const [trainerList, setTrainerList] = useState<Trainer[]>([]);
  const [emgTrainerId, setEmgTrainerId] = useState('');
  const [emgDate, setEmgDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [emgNotes, setEmgNotes] = useState('');
  const [emgBalance, setEmgBalance] = useState<EmergencyBalance | null>(null);
  const [emgBalanceLoading, setEmgBalanceLoading] = useState(false);
  const [emgSubmitting, setEmgSubmitting] = useState(false);

  const fetchLeaves = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/leaves?month=${month}&pageSize=200`);
      if (res.ok) {
        const json = await res.json();
        setAllLeaves(json.data ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    fetchLeaves();
  }, [fetchLeaves]);

  // Reset filters when month changes
  useEffect(() => {
    setStatusFilter('all');
    setCategoryFilter('all');
    setTrainerFilter('all');
    setSearch('');
  }, [month]);

  // Fetch trainer list once (for emergency dialog)
  useEffect(() => {
    fetch('/api/admin/trainers')
      .then((r) => r.json())
      .then(({ data }) => setTrainerList(data ?? []))
      .catch(() => {});
  }, []);

  // Fetch emergency balance when trainer or date changes
  useEffect(() => {
    if (!emgTrainerId || !emgDate) {
      setEmgBalance(null);
      return;
    }
    const month = emgDate.slice(0, 7);
    setEmgBalanceLoading(true);
    fetch(`/api/admin/leaves/balance?trainerProfileId=${emgTrainerId}&month=${month}`)
      .then((r) => r.json())
      .then(({ data }) => setEmgBalance(data?.emergency ?? null))
      .catch(() => setEmgBalance(null))
      .finally(() => setEmgBalanceLoading(false));
  }, [emgTrainerId, emgDate]);

  // ── Stats (from full month data, ignoring client filters) ──────────────────
  const stats = useMemo(
    () => ({
      total: allLeaves.length,
      pending: allLeaves.filter((l) => l.status === 'PENDING').length,
      approved: allLeaves.filter((l) => l.status === 'APPROVED').length,
      rejected: allLeaves.filter((l) => l.status === 'REJECTED').length,
    }),
    [allLeaves],
  );

  // ── Unique trainers from data ──────────────────────────────────────────────
  const trainers = useMemo(() => {
    const map = new Map<string, string>();
    allLeaves.forEach((l) => {
      map.set(l.trainerProfileId, `${l.trainer.user.firstName} ${l.trainer.user.lastName}`);
    });
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allLeaves]);

  // ── Client-side filtered list ──────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return allLeaves.filter((l) => {
      if (statusFilter !== 'all' && l.status !== statusFilter) return false;
      if (categoryFilter !== 'all' && l.leaveCategory !== categoryFilter) return false;
      if (trainerFilter !== 'all' && l.trainerProfileId !== trainerFilter) return false;
      if (q) {
        const name = `${l.trainer.user.firstName} ${l.trainer.user.lastName}`.toLowerCase();
        if (!name.includes(q)) return false;
      }
      return true;
    });
  }, [allLeaves, statusFilter, categoryFilter, trainerFilter, search]);

  const activeFilterCount = [
    statusFilter !== 'all',
    categoryFilter !== 'all',
    trainerFilter !== 'all',
    search !== '',
  ].filter(Boolean).length;

  // ── Detail dialog ──────────────────────────────────────────────────────────
  async function openDetail(leaveId: string) {
    setDetailOpen(true);
    setDetailLoading(true);
    setReviewNotes('');
    setReviewCategory('REGULAR');
    setLeaveBalance(null);
    setShowLeaveCalendar(false);
    try {
      const res = await fetch(`/api/admin/leaves/${leaveId}`);
      if (res.ok) {
        const { data } = await res.json();
        setSelectedLeave(data);
        // Fetch leave quota for this trainer/month in parallel
        const month = data.startDate.slice(0, 7);
        setLeaveBalanceLoading(true);
        fetch(`/api/admin/leaves/balance?trainerProfileId=${data.trainerProfileId}&month=${month}`)
          .then((r) => r.json())
          .then(({ data: bal }) => setLeaveBalance(bal ?? null))
          .catch(() => setLeaveBalance(null))
          .finally(() => setLeaveBalanceLoading(false));
      }
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleAction(action: 'approve' | 'reject') {
    if (!selectedLeave) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/admin/leaves/${selectedLeave.id}/${action}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes: reviewNotes || undefined,
          ...(action === 'approve' ? { leaveCategory: reviewCategory } : {}),
        }),
      });
      if (res.ok) {
        toast.success(`Leave ${action === 'approve' ? 'approved' : 'rejected'}`);
        setDetailOpen(false);
        setSelectedLeave(null);
        fetchLeaves();
      } else {
        const json = await res.json();
        toast.error(json.error || `Failed to ${action} leave`);
      }
    } finally {
      setActionLoading(false);
    }
  }

  async function handleEmergencySubmit() {
    if (!emgTrainerId || !emgDate) return;
    setEmgSubmitting(true);
    try {
      const res = await fetch('/api/admin/leaves/emergency', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trainerProfileId: emgTrainerId,
          date: emgDate,
          notes: emgNotes || undefined,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        toast.success(`Emergency leave marked for ${json.data.trainerName}`);
        setEmergencyOpen(false);
        setEmgTrainerId('');
        setEmgDate(new Date().toISOString().slice(0, 10));
        setEmgNotes('');
        setEmgBalance(null);
        fetchLeaves();
      } else {
        toast.error(json.error || 'Failed to mark emergency leave');
      }
    } finally {
      setEmgSubmitting(false);
    }
  }

  function clearFilters() {
    setStatusFilter('all');
    setCategoryFilter('all');
    setTrainerFilter('all');
    setSearch('');
  }

  const isCurrentMonth = month === currentMonthStr();

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-8">
      {/* ── Header ── */}
      <div className="flex items-center gap-2">
        <CalendarDays className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-2xl font-bold tracking-tight">Leave Requests</h1>
        {!loading && stats.pending > 0 && (
          <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-500">
            {stats.pending} pending
          </span>
        )}
        <Button
          size="sm"
          onClick={() => setEmergencyOpen(true)}
          className="ml-auto gap-1.5 bg-amber-500 text-white hover:bg-amber-600"
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          Emergency Leave
        </Button>
      </div>

      {/* ── Month navigator ── */}
      <div className="flex items-center justify-between rounded-xl bg-card ring-1 ring-border/50 px-3 py-2.5">
        <button
          onClick={() => setMonth((m) => shiftMonth(m, -1))}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="text-center">
          <p className="text-sm font-semibold">{formatMonthLabel(month)}</p>
          {!isCurrentMonth && (
            <button
              onClick={() => setMonth(currentMonthStr())}
              className="text-[10px] text-muted-foreground/60 hover:text-primary transition-colors"
            >
              Back to current month
            </button>
          )}
        </div>
        <button
          onClick={() => setMonth((m) => shiftMonth(m, 1))}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          disabled={isCurrentMonth}
        >
          <ChevronRight className={`h-4 w-4 ${isCurrentMonth ? 'opacity-25' : ''}`} />
        </button>
      </div>

      {/* ── Stats tiles ── */}
      {loading ? (
        <div className="flex gap-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="flex-1 h-16 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="flex gap-2">
          <StatTile
            label="Total"
            value={stats.total}
            active={
              statusFilter === 'all' &&
              categoryFilter === 'all' &&
              trainerFilter === 'all' &&
              !search
            }
            colorClass="bg-card text-foreground ring-border"
            onClick={clearFilters}
          />
          <StatTile
            label="Pending"
            value={stats.pending}
            active={statusFilter === 'PENDING'}
            colorClass="bg-amber-500/10 text-amber-500"
            onClick={() => setStatusFilter((s) => (s === 'PENDING' ? 'all' : 'PENDING'))}
          />
          <StatTile
            label="Approved"
            value={stats.approved}
            active={statusFilter === 'APPROVED'}
            colorClass="bg-emerald-500/10 text-emerald-500"
            onClick={() => setStatusFilter((s) => (s === 'APPROVED' ? 'all' : 'APPROVED'))}
          />
          <StatTile
            label="Rejected"
            value={stats.rejected}
            active={statusFilter === 'REJECTED'}
            colorClass="bg-red-500/10 text-red-500"
            onClick={() => setStatusFilter((s) => (s === 'REJECTED' ? 'all' : 'REJECTED'))}
          />
        </div>
      )}

      {/* ── Filters ── */}
      <div className="space-y-2.5">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search trainer..."
            className="pl-8 h-9 text-sm"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Category + Trainer row */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Category chips */}
          <div className="flex items-center gap-1.5">
            <CategoryChip
              label="All"
              active={categoryFilter === 'all'}
              onClick={() => setCategoryFilter('all')}
              colorClass="bg-muted text-foreground"
            />
            <CategoryChip
              label="Regular"
              active={categoryFilter === 'REGULAR'}
              onClick={() => setCategoryFilter((c) => (c === 'REGULAR' ? 'all' : 'REGULAR'))}
              colorClass="bg-blue-500/15 text-blue-500"
            />
            <CategoryChip
              label="Emergency"
              active={categoryFilter === 'EMERGENCY'}
              onClick={() => setCategoryFilter((c) => (c === 'EMERGENCY' ? 'all' : 'EMERGENCY'))}
              colorClass="bg-amber-500/15 text-amber-500"
            />
          </div>

          {/* Trainer dropdown */}
          {trainers.length > 1 && (
            <Select value={trainerFilter} onValueChange={(v) => setTrainerFilter(v ?? 'all')}>
              <SelectTrigger className="h-7 text-xs w-auto min-w-[130px] ml-auto">
                <SelectValue placeholder="All Trainers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Trainers</SelectItem>
                {trainers.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Clear all */}
          {activeFilterCount > 0 && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors ml-auto"
            >
              <X className="h-3 w-3" /> Clear
            </button>
          )}
        </div>
      </div>

      {/* ── Leave list ── */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[72px] rounded-2xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl bg-card ring-1 ring-border/50 py-14 text-center">
          <CalendarDays className="mx-auto h-8 w-8 text-muted-foreground/25 mb-2.5" />
          <p className="text-sm font-medium text-muted-foreground">
            {activeFilterCount > 0
              ? 'No leaves match your filters'
              : `No leave requests in ${formatMonthLabel(month)}`}
          </p>
          {activeFilterCount > 0 && (
            <button onClick={clearFilters} className="mt-2 text-xs text-primary hover:underline">
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-2xl bg-card ring-1 ring-border/50 overflow-hidden divide-y divide-border/40">
          {filtered.map((leave) => {
            const cfg = STATUS_CONFIG[leave.status] ?? STATUS_CONFIG.PENDING;
            const { firstName, lastName } = leave.trainer.user;
            const singleDay = isSameDay(leave.startDate, leave.endDate);
            const days = daysBetween(leave.startDate, leave.endDate);
            const isEmergency = leave.leaveCategory === 'EMERGENCY';

            return (
              <button
                key={leave.id}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/30 active:bg-muted/50"
                onClick={() => openDetail(leave.id)}
              >
                {/* Avatar */}
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                  {initials(firstName, lastName)}
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium truncate">
                      {firstName} {lastName}
                    </p>
                    <span
                      className={`shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wide ${
                        isEmergency
                          ? 'bg-amber-500/10 text-amber-500'
                          : 'bg-blue-500/10 text-blue-500'
                      }`}
                    >
                      {isEmergency ? 'Emerg' : 'Regular'}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {singleDay
                      ? formatDate(leave.startDate)
                      : `${formatDateShort(leave.startDate)} — ${formatDateShort(leave.endDate)}`}
                    {!singleDay && <span className="ml-1.5 text-muted-foreground/50">{days}d</span>}
                  </p>
                  {leave.reason && (
                    <p className="text-xs text-muted-foreground/50 mt-0.5 truncate">
                      {leave.reason}
                    </p>
                  )}
                </div>

                {/* Status */}
                <span
                  className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium ${cfg.className}`}
                >
                  {cfg.label}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Result count ── */}
      {!loading && filtered.length > 0 && activeFilterCount > 0 && (
        <p className="text-center text-xs text-muted-foreground/60">
          Showing {filtered.length} of {allLeaves.length} requests
        </p>
      )}

      {/* ── Detail Dialog ── */}
      <Dialog
        open={detailOpen}
        onOpenChange={(open) => {
          setDetailOpen(open);
          if (!open) {
            setSelectedLeave(null);
            setLeaveBalance(null);
            setShowLeaveCalendar(false);
          }
        }}
      >
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Leave Request</DialogTitle>
          </DialogHeader>

          {detailLoading ? (
            <div className="space-y-3 py-2">
              <Skeleton className="h-12 rounded-xl" />
              <Skeleton className="h-20 rounded-xl" />
              <Skeleton className="h-28 rounded-xl" />
            </div>
          ) : selectedLeave ? (
            <div className="space-y-5">
              {/* Trainer header */}
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
                  {initials(
                    selectedLeave.trainer.user.firstName,
                    selectedLeave.trainer.user.lastName,
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold">
                      {selectedLeave.trainer.user.firstName} {selectedLeave.trainer.user.lastName}
                    </p>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${
                        selectedLeave.leaveCategory === 'EMERGENCY'
                          ? 'bg-amber-500/10 text-amber-500'
                          : 'bg-blue-500/10 text-blue-500'
                      }`}
                    >
                      {selectedLeave.leaveCategory === 'EMERGENCY' ? 'Emergency' : 'Regular'}
                    </span>
                    {(() => {
                      const scfg = STATUS_CONFIG[selectedLeave.status] ?? STATUS_CONFIG.PENDING;
                      return (
                        <span
                          className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${scfg.className}`}
                        >
                          {scfg.label}
                        </span>
                      );
                    })()}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {isSameDay(selectedLeave.startDate, selectedLeave.endDate)
                      ? formatDate(selectedLeave.startDate)
                      : `${formatDateShort(selectedLeave.startDate)} — ${formatDateShort(selectedLeave.endDate)} · ${daysBetween(selectedLeave.startDate, selectedLeave.endDate)} days`}
                  </p>
                </div>
              </div>

              {/* Leave type */}
              <div className="flex gap-3">
                <div className="rounded-xl bg-muted/30 px-3.5 py-2.5 flex-1 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">
                    Type
                  </p>
                  <p className="text-sm font-medium capitalize">
                    {selectedLeave.leaveType.replace(/_/g, ' ').toLowerCase()}
                  </p>
                </div>
                <div className="rounded-xl bg-muted/30 px-3.5 py-2.5 flex-1 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">
                    Duration
                  </p>
                  <p className="text-sm font-medium">
                    {daysBetween(selectedLeave.startDate, selectedLeave.endDate)} day
                    {daysBetween(selectedLeave.startDate, selectedLeave.endDate) !== 1 ? 's' : ''}
                  </p>
                </div>
                <div className="rounded-xl bg-muted/30 px-3.5 py-2.5 flex-1 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">
                    Applied
                  </p>
                  <p className="text-sm font-medium">
                    {new Date(selectedLeave.createdAt).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </p>
                </div>
              </div>

              {/* Leave quota */}
              {leaveBalanceLoading ? (
                <Skeleton className="h-16 rounded-xl" />
              ) : leaveBalance ? (
                <div className="rounded-xl bg-muted/30 px-3.5 py-3 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                      Monthly Quota —{' '}
                      {new Date(leaveBalance.month + '-01').toLocaleDateString('en-IN', {
                        month: 'long',
                        year: 'numeric',
                      })}
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowLeaveCalendar(true)}
                      className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                      title="View leave calendar"
                    >
                      <CalendarIcon className="h-3 w-3" />
                      View
                    </button>
                  </div>
                  {/* Regular */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-blue-400 font-medium">Regular</span>
                      <span className="text-muted-foreground tabular-nums">
                        {leaveBalance.regular.used}/{leaveBalance.regular.quota}d used
                        <span
                          className={`ml-2 font-semibold ${leaveBalance.regular.remaining > 0 ? 'text-blue-400' : 'text-red-400'}`}
                        >
                          · {leaveBalance.regular.remaining}d left
                        </span>
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${leaveBalance.regular.remaining > 0 ? 'bg-blue-500' : 'bg-red-500'}`}
                        style={{
                          width: `${leaveBalance.regular.quota > 0 ? Math.min(100, (leaveBalance.regular.used / leaveBalance.regular.quota) * 100) : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                  {/* Emergency */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-amber-400 font-medium">Emergency</span>
                      <span className="text-muted-foreground tabular-nums">
                        {leaveBalance.emergency.used}/{leaveBalance.emergency.quota}d used
                        <span
                          className={`ml-2 font-semibold ${leaveBalance.emergency.remaining > 0 ? 'text-amber-400' : 'text-red-400'}`}
                        >
                          · {leaveBalance.emergency.remaining}d left
                        </span>
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${leaveBalance.emergency.remaining > 0 ? 'bg-amber-500' : 'bg-red-500'}`}
                        style={{
                          width: `${leaveBalance.emergency.quota > 0 ? Math.min(100, (leaveBalance.emergency.used / leaveBalance.emergency.quota) * 100) : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Reason */}
              {selectedLeave.reason && (
                <div className="rounded-xl bg-muted/30 px-3.5 py-3">
                  <p className="text-xs text-muted-foreground mb-1">Reason</p>
                  <p className="text-sm">{selectedLeave.reason}</p>
                </div>
              )}

              {/* Review notes (already reviewed) */}
              {selectedLeave.reviewNotes && selectedLeave.status !== 'PENDING' && (
                <div className="rounded-xl bg-muted/30 px-3.5 py-3">
                  <p className="text-xs text-muted-foreground mb-1">Review Notes</p>
                  <p className="text-sm">{selectedLeave.reviewNotes}</p>
                </div>
              )}

              {/* Affected sessions */}
              {selectedLeave.affectedSessions.length > 0 && (
                <div className="rounded-xl border border-border/60 bg-muted/20 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Affected Sessions
                    </p>
                    <span className="text-xs text-muted-foreground">
                      {selectedLeave.affectedSessions.length} session
                      {selectedLeave.affectedSessions.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Clients will do an independent cardio session during this period.
                  </p>
                  <div className="space-y-1.5 pt-1">
                    {selectedLeave.affectedSessions.map((session) => (
                      <div
                        key={session.id}
                        className="flex items-center justify-between rounded-lg bg-card px-3 py-2 text-xs ring-1 ring-border/50"
                      >
                        <span className="font-medium">{session.clientName}</span>
                        <span className="text-muted-foreground">
                          {formatDate(session.scheduledDate)} ·{' '}
                          {formatTime12(session.scheduledTime)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Approve / Reject */}
              {selectedLeave.status === 'PENDING' && (
                <div className="space-y-3 pt-1 border-t border-border/50">
                  {/* Category override */}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Leave Category</Label>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => setReviewCategory('REGULAR')}
                        className={`rounded-xl px-3 py-2.5 text-left transition-colors ring-1 ${
                          reviewCategory === 'REGULAR'
                            ? 'bg-blue-500/10 text-blue-500 ring-blue-500/30'
                            : 'bg-muted/30 text-muted-foreground ring-border/40 hover:bg-muted/60'
                        }`}
                      >
                        <p className="text-xs font-semibold">Regular</p>
                        <p className="mt-0.5 text-[10px] opacity-70">
                          Counts against monthly quota
                        </p>
                      </button>
                      <button
                        type="button"
                        onClick={() => setReviewCategory('EMERGENCY')}
                        className={`rounded-xl px-3 py-2.5 text-left transition-colors ring-1 ${
                          reviewCategory === 'EMERGENCY'
                            ? 'bg-amber-500/10 text-amber-500 ring-amber-500/30'
                            : 'bg-muted/30 text-muted-foreground ring-border/40 hover:bg-muted/60'
                        }`}
                      >
                        <p className="text-xs font-semibold">Emergency</p>
                        <p className="mt-0.5 text-[10px] opacity-70">Admin-granted override</p>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="reviewNotes" className="text-xs">
                      Review Notes (optional)
                    </Label>
                    <Textarea
                      id="reviewNotes"
                      value={reviewNotes}
                      onChange={(e) => setReviewNotes(e.target.value)}
                      rows={2}
                      placeholder="Add notes for the trainer..."
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleAction('approve')}
                      disabled={actionLoading}
                      className="flex-1 bg-emerald-600 text-white hover:bg-emerald-700"
                    >
                      {actionLoading ? 'Processing...' : 'Approve'}
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => handleAction('reject')}
                      disabled={actionLoading}
                      className="flex-1"
                    >
                      {actionLoading ? 'Processing...' : 'Reject'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* ── Leave Calendar Overlay ── */}
      {showLeaveCalendar &&
        selectedLeave &&
        (() => {
          // Expand all non-rejected leaves for this trainer into individual dates
          const leaveDays = allLeaves
            .filter(
              (l) =>
                l.trainerProfileId === selectedLeave.trainerProfileId && l.status !== 'REJECTED',
            )
            .flatMap((l) => {
              const dates: Date[] = [];
              const start = new Date(l.startDate);
              const end = new Date(l.endDate);
              const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
              const endLocal = new Date(end.getFullYear(), end.getMonth(), end.getDate());
              while (cur <= endLocal) {
                dates.push(new Date(cur));
                cur.setDate(cur.getDate() + 1);
              }
              return dates;
            });

          const defaultMonth = new Date(selectedLeave.startDate.slice(0, 7) + '-01T00:00:00');
          const trainerName = `${selectedLeave.trainer.user.firstName} ${selectedLeave.trainer.user.lastName}`;

          return (
            <>
              <div
                className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm"
                onClick={() => setShowLeaveCalendar(false)}
              />
              <div className="fixed left-1/2 top-1/2 z-[201] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-card shadow-2xl ring-1 ring-border/50 overflow-hidden">
                <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold">{trainerName}&apos;s Leave Days</p>
                    {leaveDays.length > 0 ? (
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        <span className="inline-block h-2 w-2 rounded-full bg-red-500 mr-1 align-middle" />
                        Red dates = on leave (pending or approved)
                      </p>
                    ) : (
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        No leaves this month
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowLeaveCalendar(false)}
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <Calendar
                  mode="single"
                  selected={undefined}
                  defaultMonth={defaultMonth}
                  modifiers={{ leaveDay: leaveDays }}
                  components={{
                    DayButton: (props) => {
                      const isLeave = !!props.modifiers?.leaveDay;
                      return (
                        <CalendarDayButton
                          {...props}
                          className={
                            isLeave
                              ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30 ring-1 ring-red-500/30 font-semibold'
                              : undefined
                          }
                        />
                      );
                    },
                  }}
                  className="p-4 [--cell-size:2.75rem]"
                />
              </div>
            </>
          );
        })()}

      {/* ── Emergency Leave Dialog ── */}
      <Dialog
        open={emergencyOpen}
        onOpenChange={(open) => {
          setEmergencyOpen(open);
          if (!open) {
            setEmgTrainerId('');
            setEmgNotes('');
            setEmgBalance(null);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Mark Emergency Leave
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-1">
            <p className="text-xs text-muted-foreground">
              Use this when a trainer calls in and reports they can&apos;t come. The leave is marked
              as approved immediately.
            </p>

            {/* Trainer */}
            <div className="space-y-1.5">
              <Label className="text-xs">Trainer</Label>
              <Select
                value={emgTrainerId}
                onValueChange={(v) => {
                  setEmgTrainerId(v ?? '');
                  setEmgBalance(null);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select trainer…">
                    {emgTrainerId
                      ? (trainerList.find((t) => t.id === emgTrainerId)?.name ?? 'Select trainer…')
                      : 'Select trainer…'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {trainerList.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date */}
            <div className="space-y-1.5">
              <Label className="text-xs">Date</Label>
              <Input type="date" value={emgDate} onChange={(e) => setEmgDate(e.target.value)} />
            </div>

            {/* Emergency quota display */}
            {emgTrainerId && (
              <div
                className={`rounded-xl px-4 py-3 ${
                  emgBalanceLoading
                    ? 'bg-muted/40'
                    : emgBalance && emgBalance.remaining > 0
                      ? 'bg-amber-500/10'
                      : 'bg-red-500/10'
                }`}
              >
                {emgBalanceLoading ? (
                  <p className="text-xs text-muted-foreground">Loading quota…</p>
                ) : emgBalance ? (
                  <>
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                        Emergency Leave Quota
                      </p>
                      <span
                        className={`text-xs font-bold ${emgBalance.remaining > 0 ? 'text-amber-500' : 'text-red-500'}`}
                      >
                        {emgBalance.remaining} / {emgBalance.quota} remaining
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${emgBalance.remaining > 0 ? 'bg-amber-500' : 'bg-red-500'}`}
                        style={{
                          width: `${emgBalance.quota > 0 ? Math.min(100, (emgBalance.used / emgBalance.quota) * 100) : 100}%`,
                        }}
                      />
                    </div>
                    {emgBalance.remaining <= 0 && (
                      <p className="mt-1.5 text-[11px] text-red-500 font-medium">
                        Emergency quota exhausted for this month.
                      </p>
                    )}
                  </>
                ) : null}
              </div>
            )}

            {/* Notes */}
            <div className="space-y-1.5">
              <Label className="text-xs">Notes (optional)</Label>
              <Textarea
                value={emgNotes}
                onChange={(e) => setEmgNotes(e.target.value)}
                rows={2}
                placeholder="e.g. Called in sick at 6 AM"
              />
            </div>

            <Button
              onClick={handleEmergencySubmit}
              disabled={
                emgSubmitting ||
                !emgTrainerId ||
                !emgDate ||
                (emgBalance !== null && emgBalance.remaining <= 0)
              }
              className="w-full bg-amber-500 text-white hover:bg-amber-600"
            >
              {emgSubmitting ? 'Marking…' : 'Mark as Emergency Leave'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
