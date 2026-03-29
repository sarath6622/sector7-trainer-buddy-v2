'use client';

import { useState, useEffect, useCallback } from 'react';
import { CalendarDays, Eye, UserCheck, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

interface LeaveRequest {
  id: string;
  startDate: string;
  endDate: string;
  reason: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
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
  affectedClients: {
    clientProfileId: string;
    firstName: string;
    lastName: string;
  }[];
}

interface TrainerOption {
  id: string;
  firstName: string;
  lastName: string;
}

const STATUS_BADGE: Record<
  string,
  { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }
> = {
  PENDING: { variant: 'secondary', label: 'Pending' },
  APPROVED: { variant: 'default', label: 'Approved' },
  REJECTED: { variant: 'destructive', label: 'Rejected' },
};

function addMinutes(time: string, minutes: number): string {
  const [h = '0', m = '0'] = time.split(':');
  const total = parseInt(h, 10) * 60 + parseInt(m, 10) + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    weekday: 'short',
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

export default function AdminLeavesPage() {
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedLeave, setSelectedLeave] = useState<LeaveDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reviewNotes, setReviewNotes] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Reassignment state
  // Map of sessionId → selected replacement trainerProfileId
  const [reassignSelections, setReassignSelections] = useState<Record<string, string>>({});
  // Map of slotKey (date:startTime:endTime) → TrainerOption[]
  const [vacantTrainersCache, setVacantTrainersCache] = useState<Record<string, TrainerOption[]>>(
    {},
  );
  // Set of sessionIds that have been successfully reassigned
  const [reassignedSessions, setReassignedSessions] = useState<Set<string>>(new Set());
  // Per-session reassignment loading
  const [reassignLoading, setReassignLoading] = useState<Record<string, boolean>>({});

  const fetchLeaves = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter && statusFilter !== 'all') params.set('status', statusFilter);
      const res = await fetch(`/api/admin/leaves?${params}`);
      if (res.ok) {
        const json = await res.json();
        setLeaves(json.data);
      }
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchLeaves();
  }, [fetchLeaves]);

  async function openDetail(leaveId: string) {
    setDetailOpen(true);
    setDetailLoading(true);
    setReviewNotes('');
    setReassignSelections({});
    setReassignedSessions(new Set());
    setVacantTrainersCache({});
    try {
      const res = await fetch(`/api/admin/leaves/${leaveId}`);
      if (res.ok) {
        const { data } = await res.json();
        setSelectedLeave(data);
        // Pre-fetch vacant trainers for all unique slots
        if (data.status === 'PENDING' && data.affectedSessions.length > 0) {
          prefetchVacantTrainers(data.affectedSessions);
        }
      }
    } finally {
      setDetailLoading(false);
    }
  }

  async function prefetchVacantTrainers(sessions: AffectedSession[]) {
    // Deduplicate by (date, startTime, endTime)
    const seen = new Set<string>();
    const uniqueSlots = sessions
      .map((s) => {
        const date = new Date(s.scheduledDate).toISOString().slice(0, 10);
        const endTime = addMinutes(s.scheduledTime, s.durationMin);
        return { date, startTime: s.scheduledTime, endTime };
      })
      .filter(({ date, startTime, endTime }) => {
        const key = `${date}:${startTime}:${endTime}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

    await Promise.allSettled(
      uniqueSlots.map(async ({ date, startTime, endTime }) => {
        const key = `${date}:${startTime}:${endTime}`;
        const params = new URLSearchParams({ date, startTime, endTime });
        const res = await fetch(`/api/admin/reassignments/vacant-trainers?${params}`);
        if (res.ok) {
          const { data } = await res.json();
          setVacantTrainersCache((prev) => ({ ...prev, [key]: data }));
        }
      }),
    );
  }

  function getVacantTrainersForSession(session: AffectedSession): TrainerOption[] {
    const date = new Date(session.scheduledDate).toISOString().slice(0, 10);
    const endTime = addMinutes(session.scheduledTime, session.durationMin);
    const key = `${date}:${session.scheduledTime}:${endTime}`;
    return vacantTrainersCache[key] ?? [];
  }

  async function handleReassignSession(session: AffectedSession) {
    const trainerId = reassignSelections[session.id];
    if (!trainerId) return;

    setReassignLoading((prev) => ({ ...prev, [session.id]: true }));
    try {
      const res = await fetch('/api/admin/reassignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionInstanceId: session.id,
          replacementTrainerProfileId: trainerId,
          reason: `Leave cover — ${selectedLeave?.trainer.user.firstName} ${selectedLeave?.trainer.user.lastName}`,
        }),
      });
      if (res.ok) {
        setReassignedSessions((prev) => new Set([...prev, session.id]));
        toast.success(`Session reassigned for ${session.clientName}`);
      } else {
        const json = await res.json();
        toast.error(json.error || 'Reassignment failed');
      }
    } finally {
      setReassignLoading((prev) => ({ ...prev, [session.id]: false }));
    }
  }

  async function handleAction(action: 'approve' | 'reject') {
    if (!selectedLeave) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/admin/leaves/${selectedLeave.id}/${action}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: reviewNotes || undefined }),
      });
      if (res.ok) {
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

  const unreassignedCount =
    selectedLeave?.affectedSessions.filter((s) => !reassignedSessions.has(s.id)).length ?? 0;

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <CalendarDays className="h-6 w-6" />
        <h1 className="text-2xl font-bold">Leave Management</h1>
      </div>

      {/* Filter */}
      <div className="flex gap-3">
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? '')}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="PENDING">Pending</SelectItem>
            <SelectItem value="APPROVED">Approved</SelectItem>
            <SelectItem value="REJECTED">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Leave List */}
      {leaves.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">No leave requests found.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {leaves.map((leave) => {
            const badge = STATUS_BADGE[leave.status] ?? {
              variant: 'secondary' as const,
              label: leave.status,
            };
            const trainerName = `${leave.trainer.user.firstName} ${leave.trainer.user.lastName}`;
            return (
              <Card key={leave.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-sm">{trainerName}</CardTitle>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDate(leave.startDate)} — {formatDate(leave.endDate)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                      <Button size="sm" variant="ghost" onClick={() => openDetail(leave.id)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {leave.reason && (
                    <p className="text-xs text-muted-foreground">Reason: {leave.reason}</p>
                  )}
                  {leave.reviewNotes && (
                    <p className="text-xs text-muted-foreground mt-1">Notes: {leave.reviewNotes}</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Leave Request Details</DialogTitle>
          </DialogHeader>

          {detailLoading ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Loading...</p>
          ) : selectedLeave ? (
            <div className="space-y-5">
              {/* Header info */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Trainer</p>
                  <p className="font-medium">
                    {selectedLeave.trainer.user.firstName} {selectedLeave.trainer.user.lastName}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Status</p>
                  <Badge variant={STATUS_BADGE[selectedLeave.status]?.variant ?? 'secondary'}>
                    {STATUS_BADGE[selectedLeave.status]?.label ?? selectedLeave.status}
                  </Badge>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">From</p>
                  <p>{formatDate(selectedLeave.startDate)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">To</p>
                  <p>{formatDate(selectedLeave.endDate)}</p>
                </div>
              </div>

              {selectedLeave.reason && (
                <div>
                  <p className="text-xs text-muted-foreground">Reason</p>
                  <p className="text-sm">{selectedLeave.reason}</p>
                </div>
              )}

              {/* ── Reassignment Panel ── */}
              {selectedLeave.affectedSessions.length > 0 && (
                <div className="rounded-xl border border-border/60 bg-muted/20 p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <UserCheck className="h-4 w-4 text-primary" />
                      <p className="text-sm font-semibold">
                        Reassign Sessions ({selectedLeave.affectedSessions.length})
                      </p>
                    </div>
                    {selectedLeave.status === 'PENDING' && unreassignedCount > 0 && (
                      <span className="flex items-center gap-1 text-[10px] text-amber-500">
                        <AlertCircle className="h-3 w-3" />
                        {unreassignedCount} unassigned
                      </span>
                    )}
                    {selectedLeave.status === 'PENDING' && unreassignedCount === 0 && (
                      <span className="flex items-center gap-1 text-[10px] text-emerald-500">
                        <CheckCircle2 className="h-3 w-3" />
                        All reassigned
                      </span>
                    )}
                  </div>

                  <div className="space-y-2">
                    {selectedLeave.affectedSessions.map((session) => {
                      const isReassigned = reassignedSessions.has(session.id);
                      const isLoading = reassignLoading[session.id];
                      const vacantTrainers = getVacantTrainersForSession(session);
                      const selectedTrainerId = reassignSelections[session.id] ?? '';

                      return (
                        <div
                          key={session.id}
                          className={`rounded-lg p-3 text-xs space-y-2 ${
                            isReassigned
                              ? 'bg-emerald-500/10 ring-1 ring-emerald-500/30'
                              : 'bg-card ring-1 ring-border/50'
                          }`}
                        >
                          {/* Session info row */}
                          <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                              <p className="font-medium">{session.clientName}</p>
                              <p className="text-muted-foreground">
                                {formatDate(session.scheduledDate)} ·{' '}
                                {formatTime12(session.scheduledTime)} ({session.durationMin} min)
                              </p>
                            </div>
                            {isReassigned && (
                              <span className="flex items-center gap-1 text-emerald-500 font-medium">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Reassigned
                              </span>
                            )}
                          </div>

                          {/* Trainer select + button (only for pending + not yet reassigned) */}
                          {selectedLeave.status === 'PENDING' && !isReassigned && (
                            <div className="flex gap-2 items-center">
                              <Select
                                value={selectedTrainerId}
                                onValueChange={(v) =>
                                  v &&
                                  setReassignSelections((prev) => ({ ...prev, [session.id]: v }))
                                }
                              >
                                <SelectTrigger className="h-7 flex-1 text-xs">
                                  <SelectValue>
                                    {selectedTrainerId
                                      ? (() => {
                                          const t = vacantTrainers.find(
                                            (x) => x.id === selectedTrainerId,
                                          );
                                          return t
                                            ? `${t.firstName} ${t.lastName}`
                                            : selectedTrainerId;
                                        })()
                                      : vacantTrainers.length === 0
                                        ? 'No trainers available'
                                        : 'Select trainer…'}
                                  </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                  {vacantTrainers.length === 0 ? (
                                    <SelectItem value="_none" disabled>
                                      No available trainers
                                    </SelectItem>
                                  ) : (
                                    vacantTrainers.map((t) => (
                                      <SelectItem key={t.id} value={t.id}>
                                        {t.firstName} {t.lastName}
                                      </SelectItem>
                                    ))
                                  )}
                                </SelectContent>
                              </Select>
                              <Button
                                size="sm"
                                className="h-7 px-3 text-xs"
                                disabled={!selectedTrainerId || isLoading}
                                onClick={() => handleReassignSession(session)}
                              >
                                {isLoading ? '…' : 'Assign'}
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Approve/Reject Actions */}
              {selectedLeave.status === 'PENDING' && (
                <div className="space-y-3 pt-1 border-t border-border/50">
                  {unreassignedCount > 0 && selectedLeave.affectedSessions.length > 0 && (
                    <p className="text-[11px] text-amber-500 flex items-center gap-1.5">
                      <AlertCircle className="h-3 w-3 shrink-0" />
                      {unreassignedCount} session{unreassignedCount !== 1 ? 's' : ''} not yet
                      reassigned. You can still approve — the admin can reassign later.
                    </p>
                  )}
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
                      className="flex-1 bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-700"
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
    </div>
  );
}
