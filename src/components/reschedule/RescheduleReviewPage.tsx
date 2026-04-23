'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, CheckCircle2, Clock, XCircle, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { DatePickerModal } from '@/components/ui/date-picker-modal';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RescheduleRequestRow {
  id: string;
  requestedDate: string;
  requestedTime: string;
  reason: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewNotes: string | null;
  reviewedAt: string | null;
  createdAt: string;
  client: {
    id: string;
    user: { firstName: string; lastName: string; email: string };
  };
  sessionInstance: {
    id: string;
    scheduledDate: string;
    scheduledTime: string;
    durationMin: number;
    trainer: { user: { firstName: string; lastName: string } };
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatTime(timeStr: string) {
  const [h = '0', m = '00'] = timeStr.split(':');
  const hour = parseInt(h, 10);
  return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`;
}

const STATUS_CONFIG = {
  PENDING: { label: 'Pending', color: 'bg-amber-500/10 text-amber-500', icon: Clock },
  APPROVED: { label: 'Approved', color: 'bg-emerald-500/10 text-emerald-500', icon: CheckCircle2 },
  REJECTED: { label: 'Declined', color: 'bg-red-500/10 text-red-500', icon: XCircle },
};

// ─── Review Dialog ────────────────────────────────────────────────────────────

function ReviewDialog({
  request,
  action,
  apiBase,
  open,
  onClose,
  onDone,
}: {
  request: RescheduleRequestRow | null;
  action: 'approve' | 'reject';
  apiBase: string;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) {
      setNotes('');
      setError('');
    }
  }, [open]);

  if (!request) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`${apiBase}/${request!.id}/${action}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewNotes: notes || undefined }),
      });
      const json = await res.json();
      if (res.ok) {
        toast.success(
          action === 'approve' ? 'Request approved — session rescheduled.' : 'Request declined.',
        );
        onDone();
        onClose();
      } else {
        setError(json.error || 'Action failed');
      }
    } finally {
      setSubmitting(false);
    }
  }

  const isApprove = action === 'approve';
  const clientName = `${request.client.user.firstName} ${request.client.user.lastName}`;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle
            className={`flex items-center gap-2 ${isApprove ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}
          >
            {isApprove ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            {isApprove ? 'Approve Reschedule' : 'Decline Reschedule'}
          </DialogTitle>
        </DialogHeader>

        {/* Summary */}
        <div className="rounded-xl bg-muted/40 px-4 py-3 text-sm space-y-1.5">
          <p className="font-semibold">{clientName}</p>
          <p className="text-xs text-muted-foreground">
            From: {formatDate(request.sessionInstance.scheduledDate)} at{' '}
            {formatTime(request.sessionInstance.scheduledTime)}
          </p>
          <p className="text-xs text-muted-foreground">
            To: {formatDate(request.requestedDate)} at {formatTime(request.requestedTime)}
          </p>
          {request.reason && (
            <p className="text-xs italic text-muted-foreground">&quot;{request.reason}&quot;</p>
          )}
        </div>

        {isApprove && (
          <div className="rounded-xl bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
            This will update the session to {formatDate(request.requestedDate)} at{' '}
            {formatTime(request.requestedTime)}. The client will be notified.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-500">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">
              {isApprove ? 'Note to client (optional)' : 'Reason for declining (optional)'}
            </Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder={
                isApprove ? 'Any message for the client...' : 'Why is this request declined?'
              }
              maxLength={500}
            />
          </div>

          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className={`flex-1 text-white ${
                isApprove ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'
              }`}
            >
              {submitting ? 'Saving...' : isApprove ? 'Approve' : 'Decline'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Request Card ─────────────────────────────────────────────────────────────

function RequestCard({
  request,
  apiBase,
  showTrainer,
  onRefresh,
}: {
  request: RescheduleRequestRow;
  apiBase: string;
  showTrainer: boolean;
  onRefresh: () => void;
}) {
  const [reviewAction, setReviewAction] = useState<'approve' | 'reject' | null>(null);
  const config = STATUS_CONFIG[request.status];
  const StatusIcon = config.icon;
  const clientName = `${request.client.user.firstName} ${request.client.user.lastName}`;
  const trainerName = `${request.sessionInstance.trainer.user.firstName} ${request.sessionInstance.trainer.user.lastName}`;

  return (
    <>
      <div className="rounded-2xl bg-card p-4 ring-1 ring-border/50 space-y-3">
        {/* Top row: client + status */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold text-sm">{clientName}</p>
            <p className="text-xs text-muted-foreground">{request.client.user.email}</p>
            {showTrainer && (
              <p className="mt-0.5 text-xs text-muted-foreground">Trainer: {trainerName}</p>
            )}
          </div>
          <div
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 ${config.color}`}
          >
            <StatusIcon className="h-3 w-3" />
            <span className="text-[10px] font-semibold">{config.label}</span>
          </div>
        </div>

        {/* Session info */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg bg-muted/40 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-0.5">
              Original
            </p>
            <p>{formatDate(request.sessionInstance.scheduledDate)}</p>
            <p className="text-muted-foreground">
              {formatTime(request.sessionInstance.scheduledTime)} ·{' '}
              {request.sessionInstance.durationMin} min
            </p>
          </div>
          <div className="rounded-lg bg-primary/5 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-0.5">
              Requested
            </p>
            <p>{formatDate(request.requestedDate)}</p>
            <p className="text-muted-foreground">{formatTime(request.requestedTime)}</p>
          </div>
        </div>

        {request.reason && (
          <p className="text-xs text-muted-foreground italic">
            Reason: &quot;{request.reason}&quot;
          </p>
        )}

        {request.reviewNotes && (
          <p className="text-xs text-muted-foreground">
            <span className="font-medium">Response:</span> {request.reviewNotes}
          </p>
        )}

        {/* Actions — only for PENDING */}
        {request.status === 'PENDING' && (
          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              className="flex-1 bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={() => setReviewAction('approve')}
            >
              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1 text-red-500 hover:bg-red-500/10 hover:text-red-600 ring-1 ring-border/50"
              onClick={() => setReviewAction('reject')}
            >
              <XCircle className="mr-1.5 h-3.5 w-3.5" />
              Decline
            </Button>
          </div>
        )}
      </div>

      <ReviewDialog
        request={request}
        action={reviewAction ?? 'approve'}
        apiBase={apiBase}
        open={reviewAction !== null}
        onClose={() => setReviewAction(null)}
        onDone={onRefresh}
      />
    </>
  );
}

// ─── Shared Page Component ────────────────────────────────────────────────────

export function RescheduleReviewPage({
  title,
  subtitle,
  apiListUrl,
  apiBase,
  showTrainer = true,
}: {
  title: string;
  subtitle: string;
  apiListUrl: string;
  apiBase: string;
  showTrainer?: boolean;
}) {
  const [requests, setRequests] = useState<RescheduleRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('PENDING');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ pageSize: '100' });
      if (statusFilter && statusFilter !== 'ALL') params.set('status', statusFilter);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);

      const res = await fetch(`${apiListUrl}?${params}`);
      if (res.ok) {
        const { data } = await res.json();
        setRequests(data);
      }
    } finally {
      setLoading(false);
    }
  }, [apiListUrl, statusFilter, dateFrom, dateTo]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const pendingCount = requests.filter((r) => r.status === 'PENDING').length;

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            {pendingCount > 0 && statusFilter !== 'APPROVED' && statusFilter !== 'REJECTED' && (
              <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white">
                {pendingCount}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground shrink-0">Status</Label>
          <Select value={statusFilter} onValueChange={(v) => v && setStatusFilter(v)}>
            <SelectTrigger className="h-8 w-32 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="APPROVED">Approved</SelectItem>
              <SelectItem value="REJECTED">Declined</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground shrink-0">From</Label>
          <DatePickerModal value={dateFrom} onChange={setDateFrom} className="h-8 w-36 text-xs" />
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground shrink-0">To</Label>
          <DatePickerModal
            value={dateTo}
            onChange={setDateTo}
            minDate={dateFrom}
            className="h-8 w-36 text-xs"
          />
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-40 rounded-2xl" />
          ))}
        </div>
      ) : requests.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-card py-16 text-center ring-1 ring-border/50">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
            <CalendarClock className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">
            No {statusFilter !== 'ALL' ? statusFilter.toLowerCase() : ''} reschedule requests.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {requests.map((r) => (
            <RequestCard
              key={r.id}
              request={r}
              apiBase={apiBase}
              showTrainer={showTrainer}
              onRefresh={fetchRequests}
            />
          ))}
        </div>
      )}
    </div>
  );
}
