'use client';

import { useState, useEffect, useCallback } from 'react';
import { ArrowLeftRight, Search, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePickerModal } from '@/components/ui/date-picker-modal';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface VacantTrainer {
  id: string;
  user: { firstName: string; lastName: string; email: string };
  specialties: string[];
}

interface Reassignment {
  id: string;
  reason: string | null;
  createdAt: string;
  sessionInstance: {
    id: string;
    scheduledDate: string;
    scheduledTime: string;
    client: { user: { firstName: string; lastName: string } };
  };
  originalTrainer: { user: { firstName: string; lastName: string } };
  replacementTrainer: { user: { firstName: string; lastName: string } };
}

export default function AdminReassignmentsPage() {
  // Vacant trainer lookup state
  const [lookupDate, setLookupDate] = useState('');
  const [lookupStartTime, setLookupStartTime] = useState('');
  const [lookupEndTime, setLookupEndTime] = useState('');
  const [vacantTrainers, setVacantTrainers] = useState<VacantTrainer[]>([]);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupDone, setLookupDone] = useState(false);

  // Reassignment list
  const [reassignments, setReassignments] = useState<Reassignment[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [filterDate, setFilterDate] = useState('');

  // Reassign dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sessionId, setSessionId] = useState('');
  const [selectedTrainerId, setSelectedTrainerId] = useState('');
  const [reason, setReason] = useState('');
  const [reassigning, setReassigning] = useState(false);

  // Bulk reassign
  const [bulkSessionIds, setBulkSessionIds] = useState('');
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkTrainerId, setBulkTrainerId] = useState('');
  const [bulkReason, setBulkReason] = useState('');
  const [bulkReassigning, setBulkReassigning] = useState(false);

  const fetchReassignments = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterDate) params.set('date', filterDate);
      const res = await fetch(`/api/admin/reassignments?${params}`);
      if (res.ok) {
        const { data } = await res.json();
        setReassignments(data);
      }
    } finally {
      setHistoryLoading(false);
    }
  }, [filterDate]);

  useEffect(() => {
    fetchReassignments();
  }, [fetchReassignments]);

  async function searchVacant() {
    if (!lookupDate || !lookupStartTime || !lookupEndTime) return;
    setLookupLoading(true);
    setLookupDone(false);
    try {
      const params = new URLSearchParams({
        date: lookupDate,
        startTime: lookupStartTime,
        endTime: lookupEndTime,
      });
      const res = await fetch(`/api/admin/trainers/vacant?${params}`);
      if (res.ok) {
        const { data } = await res.json();
        setVacantTrainers(data);
        setLookupDone(true);
      }
    } finally {
      setLookupLoading(false);
    }
  }

  async function handleReassign(e: React.FormEvent) {
    e.preventDefault();
    if (!sessionId || !selectedTrainerId) return;
    setReassigning(true);
    try {
      const res = await fetch('/api/admin/reassignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionInstanceId: sessionId,
          replacementTrainerProfileId: selectedTrainerId,
          reason: reason || undefined,
        }),
      });
      if (res.ok) {
        setDialogOpen(false);
        setSessionId('');
        setSelectedTrainerId('');
        setReason('');
        fetchReassignments();
      } else {
        const json = await res.json();
        toast.error(json.error || 'Failed to reassign');
      }
    } finally {
      setReassigning(false);
    }
  }

  async function handleBulkReassign(e: React.FormEvent) {
    e.preventDefault();
    const ids = bulkSessionIds
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    if (ids.length === 0 || !bulkTrainerId) return;
    setBulkReassigning(true);
    try {
      const res = await fetch('/api/admin/reassignments/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionInstanceIds: ids,
          replacementTrainerProfileId: bulkTrainerId,
          reason: bulkReason || undefined,
        }),
      });
      if (res.ok) {
        setBulkDialogOpen(false);
        setBulkSessionIds('');
        setBulkTrainerId('');
        setBulkReason('');
        fetchReassignments();
      } else {
        const json = await res.json();
        toast.error(json.error || 'Failed to bulk reassign');
      }
    } finally {
      setBulkReassigning(false);
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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <ArrowLeftRight className="h-6 w-6" />
        <h1 className="text-2xl font-bold">Trainer Reassignment</h1>
      </div>

      {/* Vacant Trainer Lookup */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Search className="h-4 w-4" />
            Find Available Trainers
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Date</Label>
              <DatePickerModal value={lookupDate} onChange={setLookupDate} className="w-[150px]" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Start Time</Label>
              <Input
                type="time"
                value={lookupStartTime}
                onChange={(e) => setLookupStartTime(e.target.value)}
                className="w-[130px]"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">End Time</Label>
              <Input
                type="time"
                value={lookupEndTime}
                onChange={(e) => setLookupEndTime(e.target.value)}
                className="w-[130px]"
              />
            </div>
            <Button
              size="sm"
              onClick={searchVacant}
              disabled={lookupLoading || !lookupDate || !lookupStartTime || !lookupEndTime}
              className="bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
            >
              {lookupLoading ? 'Searching...' : 'Search'}
            </Button>
          </div>

          {lookupDone && (
            <div className="mt-4">
              {vacantTrainers.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No available trainers found for this slot.
                </p>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    {vacantTrainers.length} trainer(s) available
                  </p>
                  {vacantTrainers.map((trainer) => (
                    <div
                      key={trainer.id}
                      className="flex items-center justify-between rounded-md border border-border/50 px-3 py-2"
                    >
                      <div>
                        <p className="text-sm font-medium">
                          {trainer.user.firstName} {trainer.user.lastName}
                        </p>
                        <div className="flex gap-1 mt-1">
                          {trainer.specialties.map((s) => (
                            <Badge key={s} variant="outline" className="text-[10px]">
                              {s}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedTrainerId(trainer.id);
                          setDialogOpen(true);
                        }}
                      >
                        Assign
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
          Single Reassignment
        </Button>
        <Button size="sm" variant="outline" onClick={() => setBulkDialogOpen(true)}>
          Bulk Reassignment
        </Button>
      </div>

      {/* Reassignment History */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Reassignment History</h2>
          <DatePickerModal
            value={filterDate}
            onChange={setFilterDate}
            placeholder="Filter by date"
            className="w-[150px]"
          />
        </div>

        {historyLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : reassignments.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-muted-foreground">No reassignments found.</p>
            </CardContent>
          </Card>
        ) : (
          reassignments.map((r) => (
            <Card key={r.id}>
              <CardContent className="py-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-sm">
                      <span className="font-medium">
                        {r.sessionInstance.client.user.firstName}{' '}
                        {r.sessionInstance.client.user.lastName}
                      </span>
                      {' — '}
                      {formatDate(r.sessionInstance.scheduledDate)} at{' '}
                      {r.sessionInstance.scheduledTime}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>
                        {r.originalTrainer.user.firstName} {r.originalTrainer.user.lastName}
                      </span>
                      <ArrowLeftRight className="h-3 w-3" />
                      <span className="font-medium text-foreground">
                        {r.replacementTrainer.user.firstName} {r.replacementTrainer.user.lastName}
                      </span>
                    </div>
                    {r.reason && (
                      <p className="text-[10px] text-muted-foreground">Reason: {r.reason}</p>
                    )}
                  </div>
                  <CheckCircle className="h-4 w-4 text-green-500" />
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Single Reassignment Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reassign Session</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleReassign} className="space-y-4">
            <div className="space-y-1">
              <Label>Session Instance ID</Label>
              <Input
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value)}
                placeholder="Paste session ID"
                required
              />
            </div>
            <div className="space-y-1">
              <Label>Replacement Trainer ID</Label>
              <Input
                value={selectedTrainerId}
                onChange={(e) => setSelectedTrainerId(e.target.value)}
                placeholder="Trainer profile ID"
                required
              />
            </div>
            <div className="space-y-1">
              <Label>Reason (optional)</Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                placeholder="Why is this reassignment needed?"
              />
            </div>
            <Button
              type="submit"
              disabled={reassigning || !sessionId || !selectedTrainerId}
              className="w-full"
            >
              {reassigning ? 'Reassigning...' : 'Reassign'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Bulk Reassignment Dialog */}
      <Dialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Bulk Reassignment</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleBulkReassign} className="space-y-4">
            <div className="space-y-1">
              <Label>Session Instance IDs (one per line)</Label>
              <Textarea
                value={bulkSessionIds}
                onChange={(e) => setBulkSessionIds(e.target.value)}
                rows={4}
                placeholder="Paste session IDs, one per line"
                required
              />
            </div>
            <div className="space-y-1">
              <Label>Replacement Trainer ID</Label>
              <Input
                value={bulkTrainerId}
                onChange={(e) => setBulkTrainerId(e.target.value)}
                placeholder="Trainer profile ID"
                required
              />
            </div>
            <div className="space-y-1">
              <Label>Reason (optional)</Label>
              <Textarea
                value={bulkReason}
                onChange={(e) => setBulkReason(e.target.value)}
                rows={2}
              />
            </div>
            <Button
              type="submit"
              disabled={bulkReassigning || !bulkSessionIds || !bulkTrainerId}
              className="w-full"
            >
              {bulkReassigning ? 'Reassigning...' : 'Bulk Reassign'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
