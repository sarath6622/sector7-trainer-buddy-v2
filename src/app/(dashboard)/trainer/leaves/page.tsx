'use client';

import { useState, useEffect, useCallback } from 'react';
import { CalendarDays, Clock, Plus, AlertTriangle } from 'lucide-react';
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

type LeaveType = 'FULL_DAY' | 'HALF_DAY_AM' | 'HALF_DAY_PM' | 'CUSTOM';

interface LeaveRequest {
  id: string;
  startDate: string;
  endDate: string;
  leaveType: LeaveType;
  startTime: string | null;
  endTime: string | null;
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

const LEAVE_TYPE_OPTIONS: {
  value: LeaveType;
  label: string;
  desc: string;
  startTime?: string;
  endTime?: string;
}[] = [
  { value: 'FULL_DAY', label: 'Full Day', desc: 'Entire day off' },
  {
    value: 'HALF_DAY_AM',
    label: 'Half Day AM',
    desc: 'Morning (06:00 – 13:00)',
    startTime: '06:00',
    endTime: '13:00',
  },
  {
    value: 'HALF_DAY_PM',
    label: 'Half Day PM',
    desc: 'Afternoon (13:00 – 21:00)',
    startTime: '13:00',
    endTime: '21:00',
  },
  { value: 'CUSTOM', label: 'Custom Hours', desc: 'Pick specific hours' },
];

const STATUS_STYLES: Record<string, string> = {
  PENDING: 'bg-amber-500/10 text-amber-500',
  APPROVED: 'bg-emerald-500/10 text-emerald-500',
  REJECTED: 'bg-red-500/10 text-red-500',
};

const LEAVE_TYPE_LABEL: Record<LeaveType, string> = {
  FULL_DAY: 'Full Day',
  HALF_DAY_AM: 'Half Day AM',
  HALF_DAY_PM: 'Half Day PM',
  CUSTOM: 'Custom Hours',
};

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

export default function TrainerLeavesPage() {
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [multiDay, setMultiDay] = useState(false);
  const [leaveType, setLeaveType] = useState<LeaveType>('FULL_DAY');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
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

  function handleLeaveTypeChange(type: LeaveType) {
    setLeaveType(type);
    const opt = LEAVE_TYPE_OPTIONS.find((o) => o.value === type);
    setStartTime(opt?.startTime ?? '');
    setEndTime(opt?.endTime ?? '');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitResult(null);
    setErrorMsg('');
    try {
      const body: Record<string, unknown> = {
        startDate,
        endDate,
        leaveType,
        reason: reason || undefined,
      };
      if (leaveType !== 'FULL_DAY') {
        body.startTime = startTime;
        body.endTime = endTime;
      }

      const res = await fetch('/api/trainer/leaves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (res.ok) {
        setSubmitResult(json.data);
        setStartDate('');
        setEndDate('');
        setMultiDay(false);
        setLeaveType('FULL_DAY');
        setStartTime('');
        setEndTime('');
        setReason('');
        fetchLeaves();
      } else {
        setErrorMsg(json.error || 'Failed to apply leave');
      }
    } finally {
      setSubmitting(false);
    }
  }

  const isFormValid =
    !!startDate && !!endDate && (leaveType === 'FULL_DAY' || (!!startTime && !!endTime));

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 pb-8">
        <div className="h-8 w-40 animate-pulse rounded-lg bg-muted" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Leaves</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Apply for full-day or partial-day leaves
          </p>
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
          <DialogTrigger
            render={
              <Button
                size="sm"
                className="gap-1.5 bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700"
              >
                <Plus className="h-3.5 w-3.5" />
                Apply Leave
              </Button>
            }
          />
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4" />
                Apply for Leave
              </DialogTitle>
            </DialogHeader>

            {submitResult ? (
              <div className="space-y-4">
                <div className="rounded-xl bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                  Leave request submitted successfully!
                </div>
                {(submitResult.affectedSessions?.length ?? 0) > 0 ? (
                  <div>
                    <p className="mb-2 text-sm font-medium">
                      {submitResult.affectedSessions!.length} affected session
                      {submitResult.affectedSessions!.length !== 1 ? 's' : ''}:
                    </p>
                    <div className="max-h-40 space-y-1 overflow-y-auto">
                      {submitResult.affectedSessions!.map((s) => (
                        <div
                          key={s.id}
                          className="flex justify-between rounded-lg bg-muted/40 px-3 py-1.5 text-xs"
                        >
                          <span className="text-muted-foreground">
                            {formatDate(s.scheduledDate)} at {s.scheduledTime}
                          </span>
                          <span className="font-medium">{s.clientName}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No sessions are affected during this leave window.
                  </p>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setDialogOpen(false);
                    setSubmitResult(null);
                  }}
                >
                  Close
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                {errorMsg && (
                  <div className="flex items-center gap-2 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-500">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    {errorMsg}
                  </div>
                )}

                {/* Date(s) */}
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">
                      {multiDay ? 'Start Date' : 'Date'}
                    </Label>
                    <Input
                      type="date"
                      value={startDate}
                      onChange={(e) => {
                        setStartDate(e.target.value);
                        if (!multiDay) setEndDate(e.target.value);
                      }}
                      required
                    />
                  </div>

                  {/* Multi-day toggle */}
                  <button
                    type="button"
                    onClick={() => {
                      const next = !multiDay;
                      setMultiDay(next);
                      if (!next) setEndDate(startDate); // collapse back to single day
                    }}
                    className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <div
                      className={`flex h-4 w-7 items-center rounded-full transition-colors ${multiDay ? 'bg-primary' : 'bg-muted'}`}
                    >
                      <div
                        className={`h-3 w-3 rounded-full bg-white shadow transition-transform mx-0.5 ${multiDay ? 'translate-x-3' : 'translate-x-0'}`}
                      />
                    </div>
                    Multiple days
                  </button>

                  {multiDay && (
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-muted-foreground">End Date</Label>
                      <Input
                        type="date"
                        value={endDate}
                        min={startDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        required
                      />
                    </div>
                  )}
                </div>

                {/* Leave type */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">Leave Type</Label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {LEAVE_TYPE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => handleLeaveTypeChange(opt.value)}
                        className={`rounded-xl px-3 py-2.5 text-left transition-colors ring-1 ${
                          leaveType === opt.value
                            ? 'bg-primary/10 text-primary ring-primary/40'
                            : 'bg-muted/30 text-muted-foreground ring-border/40 hover:bg-muted/60'
                        }`}
                      >
                        <p className="text-xs font-semibold">{opt.label}</p>
                        <p className="mt-0.5 text-[10px] opacity-70">{opt.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Time range — for partial leaves */}
                {leaveType !== 'FULL_DAY' && (
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      Time Range
                    </Label>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <p className="text-[10px] text-muted-foreground">From</p>
                        <Input
                          type="time"
                          value={startTime}
                          onChange={(e) => setStartTime(e.target.value)}
                          required
                          readOnly={leaveType !== 'CUSTOM'}
                          className={leaveType !== 'CUSTOM' ? 'cursor-default opacity-70' : ''}
                        />
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] text-muted-foreground">To</p>
                        <Input
                          type="time"
                          value={endTime}
                          onChange={(e) => setEndTime(e.target.value)}
                          required
                          readOnly={leaveType !== 'CUSTOM'}
                          className={leaveType !== 'CUSTOM' ? 'cursor-default opacity-70' : ''}
                        />
                      </div>
                    </div>
                    {leaveType !== 'CUSTOM' && (
                      <p className="text-[10px] text-muted-foreground">
                        Times are pre-set. Choose Custom Hours to pick your own window.
                      </p>
                    )}
                  </div>
                )}

                {/* Reason */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">
                    Reason (optional)
                  </Label>
                  <Textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={2}
                    placeholder="Why are you taking leave?"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={submitting || !isFormValid}
                  className="w-full gap-1.5 bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700"
                >
                  {submitting ? 'Submitting...' : 'Submit Leave Request'}
                </Button>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {/* Leave list */}
      {leaves.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-card py-12 text-center ring-1 ring-border/50">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
            <CalendarDays className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">No leave requests yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {leaves.map((leave) => (
            <div key={leave.id} className="rounded-2xl bg-card p-4 ring-1 ring-border/50">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1.5">
                  <p className="text-sm font-semibold">
                    {formatDate(leave.startDate)}
                    {leave.startDate.slice(0, 10) !== leave.endDate.slice(0, 10) &&
                      ` — ${formatDate(leave.endDate)}`}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {LEAVE_TYPE_LABEL[leave.leaveType] ?? leave.leaveType}
                    </span>
                    {leave.startTime && leave.endTime && (
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {formatTime12(leave.startTime)} – {formatTime12(leave.endTime)}
                      </span>
                    )}
                  </div>
                  {leave.reason && <p className="text-xs text-muted-foreground">{leave.reason}</p>}
                  {leave.reviewNotes && (
                    <p className="text-xs italic text-muted-foreground">
                      Admin: {leave.reviewNotes}
                    </p>
                  )}
                  <p className="text-[10px] text-muted-foreground">
                    Applied {formatDate(leave.createdAt)}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-md px-2.5 py-1 text-[10px] font-semibold ${STATUS_STYLES[leave.status] ?? ''}`}
                >
                  {leave.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
