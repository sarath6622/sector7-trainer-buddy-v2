'use client';

import { useState, useEffect, useCallback } from 'react';
import { CalendarDays, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

interface UnavailabilityRecord {
  id: string;
  date: string;
  reason: string | null;
}

export default function ClientUnavailabilityPage() {
  const [records, setRecords] = useState<UnavailabilityRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [dateInput, setDateInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [monthFilter, setMonthFilter] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (monthFilter) params.set('month', monthFilter);
      const res = await fetch(`/api/client/unavailability?${params}`);
      if (res.ok) {
        const { data } = await res.json();
        setRecords(data);
      }
    } finally {
      setLoading(false);
    }
  }, [monthFilter]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  function addDate() {
    if (dateInput && !selectedDates.includes(dateInput)) {
      setSelectedDates((prev) => [...prev, dateInput].sort());
      setDateInput('');
    }
  }

  function removeDate(date: string) {
    setSelectedDates((prev) => prev.filter((d) => d !== date));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selectedDates.length === 0) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/client/unavailability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dates: selectedDates }),
      });
      if (res.ok) {
        setSelectedDates([]);
        setDialogOpen(false);
        fetchRecords();
      } else {
        const json = await res.json();
        toast.error(json.error || 'Failed to mark unavailability');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemove(id: string) {
    const res = await fetch(`/api/client/unavailability/${id}`, { method: 'DELETE' });
    if (res.ok) {
      fetchRecords();
    } else {
      const json = await res.json();
      toast.error(json.error || 'Failed to remove');
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

  function getMonthLabel(monthStr: string) {
    const [yearStr, mStr] = monthStr.split('-');
    const d = new Date(parseInt(yearStr!, 10), parseInt(mStr!, 10) - 1, 1);
    return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
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
          <h1 className="text-2xl font-bold">My Unavailability</h1>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger render={<Button size="sm" />}>
            <Plus className="mr-1 h-4 w-4" />
            Mark Dates
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Mark Unavailable Dates</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Select Dates</Label>
                <div className="flex gap-2">
                  <Input
                    type="date"
                    value={dateInput}
                    onChange={(e) => setDateInput(e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={addDate}
                    disabled={!dateInput}
                  >
                    Add
                  </Button>
                </div>
              </div>

              {selectedDates.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">
                    Selected ({selectedDates.length}):
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {selectedDates.map((date) => (
                      <Badge key={date} variant="secondary" className="text-xs gap-1">
                        {formatDate(date)}
                        <button
                          type="button"
                          onClick={() => removeDate(date)}
                          className="ml-1 hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <Button
                type="submit"
                disabled={submitting || selectedDates.length === 0}
                className="w-full"
              >
                {submitting ? 'Saving...' : `Mark ${selectedDates.length} Date(s) Unavailable`}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Month Filter */}
      <div className="flex items-center gap-2">
        <Label htmlFor="month" className="text-sm text-muted-foreground">
          Month:
        </Label>
        <Input
          id="month"
          type="month"
          value={monthFilter}
          onChange={(e) => setMonthFilter(e.target.value)}
          className="w-[180px]"
        />
      </div>

      {/* Records */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{getMonthLabel(monthFilter)}</CardTitle>
        </CardHeader>
        <CardContent>
          {records.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No unavailability dates marked for this month.
            </p>
          ) : (
            <div className="space-y-2">
              {records.map((record) => (
                <div
                  key={record.id}
                  className="flex items-center justify-between rounded-md border border-border/50 px-3 py-2"
                >
                  <span className="text-sm">{formatDate(record.date)}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-destructive hover:text-destructive"
                    onClick={() => handleRemove(record.id)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
