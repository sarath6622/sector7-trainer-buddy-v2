'use client';

import { useState, useEffect, useCallback } from 'react';
import { CalendarDays, Eye } from 'lucide-react';
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

interface LeaveDetail extends LeaveRequest {
  affectedSessions: {
    id: string;
    scheduledDate: string;
    scheduledTime: string;
    clientName: string;
  }[];
  affectedClients: {
    clientProfileId: string;
    firstName: string;
    lastName: string;
  }[];
}

const STATUS_BADGE: Record<
  string,
  { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }
> = {
  PENDING: { variant: 'secondary', label: 'Pending' },
  APPROVED: { variant: 'default', label: 'Approved' },
  REJECTED: { variant: 'destructive', label: 'Rejected' },
};

export default function AdminLeavesPage() {
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedLeave, setSelectedLeave] = useState<LeaveDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reviewNotes, setReviewNotes] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

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
    try {
      const res = await fetch(`/api/admin/leaves/${leaveId}`);
      if (res.ok) {
        const { data } = await res.json();
        setSelectedLeave(data);
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

  function formatDate(dateStr: string) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Leave Request Details</DialogTitle>
          </DialogHeader>

          {detailLoading ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Loading...</p>
          ) : selectedLeave ? (
            <div className="space-y-4">
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

              {/* Affected Sessions */}
              {selectedLeave.affectedSessions.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">
                    Affected Sessions ({selectedLeave.affectedSessions.length})
                  </p>
                  <div className="max-h-32 overflow-y-auto space-y-1 rounded-md border border-border/50 p-2">
                    {selectedLeave.affectedSessions.map((s) => (
                      <div
                        key={s.id}
                        className="flex justify-between text-xs text-muted-foreground border-b border-border/30 py-1 last:border-0"
                      >
                        <span>
                          {formatDate(s.scheduledDate)} at {s.scheduledTime}
                        </span>
                        <span>{s.clientName}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Affected Clients */}
              {selectedLeave.affectedClients.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-1">Affected Clients</p>
                  <div className="flex flex-wrap gap-1">
                    {selectedLeave.affectedClients.map((c) => (
                      <Badge key={c.clientProfileId} variant="outline" className="text-[10px]">
                        {c.firstName} {c.lastName}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Approve/Reject Actions */}
              {selectedLeave.status === 'PENDING' && (
                <div className="space-y-3 pt-2 border-t border-border/50">
                  <div className="space-y-1">
                    <Label htmlFor="reviewNotes">Review Notes (optional)</Label>
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
