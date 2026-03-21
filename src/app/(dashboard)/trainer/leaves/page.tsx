'use client';

import { useState, useEffect, useCallback } from 'react';
import { CalendarDays, Plus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

interface LeaveRequest {
  id: string;
  startDate: string;
  endDate: string;
  reason: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewNotes: string | null;
  createdAt: string;
  affectedSessions?: {
    id: string;
    scheduledDate: string;
    scheduledTime: string;
    clientName: string;
  }[];
  affectedClients?: {
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

export default function TrainerLeavesPage() {
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [submitResult, setSubmitResult] = useState<LeaveRequest | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const fetchLeaves = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/trainer/leaves');
      if (res.ok) {
        const { data } = await res.json();
        setLeaves(data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLeaves();
  }, [fetchLeaves]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitResult(null);
    setErrorMsg('');
    try {
      const res = await fetch('/api/trainer/leaves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate, endDate, reason: reason || undefined }),
      });
      const json = await res.json();
      if (res.ok) {
        setSubmitResult(json.data);
        setStartDate('');
        setEndDate('');
        setReason('');
        fetchLeaves();
      } else {
        setErrorMsg(json.error || 'Failed to apply leave');
      }
    } finally {
      setSubmitting(false);
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-6 w-6" />
          <h1 className="text-2xl font-bold">My Leaves</h1>
        </div>

        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) {
              setSubmitResult(null);
              setErrorMsg('');
            }
          }}
        >
          <DialogTrigger render={<Button size="sm" />}>
            <Plus className="mr-1 h-4 w-4" />
            Apply Leave
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Apply for Leave</DialogTitle>
            </DialogHeader>

            {submitResult ? (
              <div className="space-y-4">
                <p className="text-sm text-green-600 font-medium">
                  Leave request submitted successfully!
                </p>
                {submitResult.affectedSessions && submitResult.affectedSessions.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-2">
                      Affected Sessions ({submitResult.affectedSessions.length}):
                    </p>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {submitResult.affectedSessions.map((s) => (
                        <div
                          key={s.id}
                          className="text-xs text-muted-foreground flex justify-between border-b border-border/30 py-1"
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
                {submitResult.affectedClients && submitResult.affectedClients.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-1">Affected Clients:</p>
                    <div className="flex flex-wrap gap-1">
                      {submitResult.affectedClients.map((c) => (
                        <Badge key={c.clientProfileId} variant="outline" className="text-[10px]">
                          {c.firstName} {c.lastName}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setDialogOpen(false);
                    setSubmitResult(null);
                  }}
                >
                  Close
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {errorMsg && (
                  <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
                    {errorMsg}
                  </p>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="startDate">Start Date</Label>
                    <Input
                      id="startDate"
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="endDate">End Date</Label>
                    <Input
                      id="endDate"
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="reason">Reason (optional)</Label>
                  <Textarea
                    id="reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={3}
                    placeholder="Why are you taking leave?"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={submitting || !startDate || !endDate}
                  className="w-full"
                >
                  {submitting ? 'Submitting...' : 'Submit Leave Request'}
                </Button>
              </form>
            )}
          </DialogContent>
        </Dialog>
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
            return (
              <Card key={leave.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">
                      {formatDate(leave.startDate)} — {formatDate(leave.endDate)}
                    </CardTitle>
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {leave.reason && (
                    <p className="text-xs text-muted-foreground">Reason: {leave.reason}</p>
                  )}
                  {leave.reviewNotes && (
                    <p className="text-xs text-muted-foreground">
                      Admin notes: {leave.reviewNotes}
                    </p>
                  )}
                  <p className="text-[10px] text-muted-foreground">
                    Applied: {formatDate(leave.createdAt)}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
