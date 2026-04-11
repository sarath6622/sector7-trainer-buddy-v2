'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { CalendarIcon, ChevronLeft, ChevronRight, Search, UserCheck, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface CrossfitClass {
  id: string;
  name: string;
  dayOfWeek: string;
  startTime: string;
  durationMin: number;
  _count: { enrollments: number };
}

interface AttendanceRecord {
  id: string;
  clientProfileId: string | null;
  externalName: string | null;
  markedAt: string;
  client: {
    user: { firstName: string; lastName: string; profileImageUrl: string | null };
  } | null;
}

interface SearchResult {
  id: string;
  name: string;
  profileImageUrl: string | null;
  isEnrolled: boolean;
}

const DAY_LABEL: Record<string, string> = {
  MONDAY: 'Mon',
  TUESDAY: 'Tue',
  WEDNESDAY: 'Wed',
  THURSDAY: 'Thu',
  FRIDAY: 'Fri',
  SATURDAY: 'Sat',
  SUNDAY: 'Sun',
};

export default function CrossfitTrainerPage() {
  const [classes, setClasses] = useState<CrossfitClass[]>([]);
  const [classesLoading, setClassesLoading] = useState(true);

  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);

  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setClassesLoading(true);
    fetch('/api/crossfit/classes')
      .then((r) => r.json())
      .then((d) => {
        setClasses(d.data ?? []);
        if (d.data?.length > 0 && !selectedClassId) {
          setSelectedClassId(d.data[0].id);
        }
      })
      .catch(() => toast.error('Failed to load classes'))
      .finally(() => setClassesLoading(false));
  }, [selectedClassId]);

  const openSession = useCallback(async (classId: string, date: string) => {
    if (!classId) return;
    setSessionLoading(true);
    setSessionId(null);
    setAttendance([]);
    try {
      const res = await fetch('/api/crossfit/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classId, date }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setSessionId(data.data.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to open session');
    } finally {
      setSessionLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedClassId && selectedDate) {
      openSession(selectedClassId, selectedDate);
    }
  }, [selectedClassId, selectedDate, openSession]);

  const fetchAttendance = useCallback(async (sid: string) => {
    setAttendanceLoading(true);
    try {
      const res = await fetch(`/api/crossfit/sessions/${sid}/attendance`);
      const data = await res.json();
      setAttendance(data.data ?? []);
    } catch {
      toast.error('Failed to load attendance');
    } finally {
      setAttendanceLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sessionId) fetchAttendance(sessionId);
  }, [sessionId, fetchAttendance]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (searchQuery.length < 2) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const params = new URLSearchParams({ q: searchQuery });
        if (selectedClassId) params.set('classId', selectedClassId);
        const res = await fetch(`/api/crossfit/clients/search?${params}`);
        const data = await res.json();
        setSearchResults(data.data ?? []);
        setShowDropdown(true);
      } catch {
        // silently fail
      } finally {
        setSearchLoading(false);
      }
    }, 300);
  }, [searchQuery, selectedClassId]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  async function markPresent(client: SearchResult) {
    if (!sessionId) return;
    setMarkingId(client.id);
    try {
      const res = await fetch(`/api/crossfit/sessions/${sessionId}/attendance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientProfileId: client.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      toast.success(`${client.name} marked present`);
      setSearchQuery('');
      setShowDropdown(false);
      await fetchAttendance(sessionId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to mark attendance');
    } finally {
      setMarkingId(null);
    }
  }

  async function removeAttendance(record: AttendanceRecord) {
    if (!sessionId) return;
    try {
      const res = await fetch(`/api/crossfit/sessions/${sessionId}/attendance/${record.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed');
      const name = record.client
        ? `${record.client.user.firstName} ${record.client.user.lastName}`
        : record.externalName;
      toast.success(`Removed ${name}`);
      await fetchAttendance(sessionId);
    } catch {
      toast.error('Failed to remove attendance');
    }
  }

  function adjustDate(days: number) {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() + days);
    setSelectedDate(format(d, 'yyyy-MM-dd'));
  }

  const alreadyMarkedIds = new Set(attendance.map((a) => a.clientProfileId).filter(Boolean));
  const selectedClass = classes.find((c) => c.id === selectedClassId);
  const filteredResults = searchResults.filter((r) => !alreadyMarkedIds.has(r.id));
  const today = format(new Date(), 'yyyy-MM-dd');

  return (
    <div className="flex flex-col min-h-full">
      {/* Sticky control bar */}
      <div className="sticky top-0 z-10 bg-background border-b border-border">
        {/* Class selector row */}
        <div className="px-3 pt-3 pb-2">
          {classesLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : classes.length === 0 ? (
            <p className="text-sm text-muted-foreground px-1">
              No classes assigned. Ask admin to assign a CrossFit class.
            </p>
          ) : (
            <Select
              value={selectedClassId}
              items={classes.map((c) => ({
                value: c.id,
                label: `${c.name} · ${DAY_LABEL[c.dayOfWeek]} ${c.startTime}`,
              }))}
              onValueChange={(v) => setSelectedClassId(v ?? '')}
            >
              <SelectTrigger className="w-full h-10 font-medium">
                <SelectValue placeholder="Select a class" />
              </SelectTrigger>
              <SelectContent>
                {classes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="font-medium">{c.name}</span>
                    <span className="text-muted-foreground ml-2">
                      {DAY_LABEL[c.dayOfWeek]} · {c.startTime} · {c._count.enrollments} enrolled
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Date nav row */}
        {selectedClassId && (
          <div className="flex items-center gap-1 px-3 pb-3">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={() => adjustDate(-1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <div className="flex-1 relative">
              <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                type="date"
                className="pl-8 h-9 text-sm text-center"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              />
            </div>

            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={() => adjustDate(1)}
              disabled={selectedDate >= today}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Attendance section */}
      {selectedClassId && (
        <div className="flex flex-col flex-1 px-3 pt-3 pb-4 gap-3">
          {/* Count + class/date label */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">
                {selectedClass?.name} ·{' '}
                {format(new Date(selectedDate + 'T00:00:00'), 'EEE, d MMM yyyy')}
              </p>
            </div>
            {!sessionLoading && (
              <Badge
                variant="secondary"
                className="bg-emerald-500/15 text-emerald-600 tabular-nums"
              >
                <UserCheck className="h-3 w-3 mr-1" />
                {attendance.length} present
              </Badge>
            )}
          </div>

          {/* Search */}
          {sessionLoading ? (
            <Skeleton className="h-11 w-full" />
          ) : (
            <div ref={searchRef} className="relative">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  className="pl-9 h-11 text-base"
                  placeholder="Search member by name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
                />
                {searchLoading && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                  </div>
                )}
              </div>

              {showDropdown && filteredResults.length > 0 && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-lg overflow-hidden">
                  {filteredResults.map((r) => (
                    <button
                      key={r.id}
                      className="w-full flex items-center gap-3 px-3 py-3 text-left hover:bg-accent active:bg-accent/70 transition-colors"
                      onClick={() => markPresent(r)}
                      disabled={markingId === r.id}
                    >
                      <Avatar className="h-9 w-9 shrink-0">
                        <AvatarImage src={r.profileImageUrl ?? undefined} />
                        <AvatarFallback className="text-xs">
                          {r.name
                            .split(' ')
                            .map((n) => n[0])
                            .join('')
                            .toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{r.name}</p>
                        {r.isEnrolled && <p className="text-xs text-blue-500">Enrolled</p>}
                      </div>
                      {markingId === r.id ? (
                        <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin shrink-0" />
                      ) : (
                        <span className="text-xs text-muted-foreground shrink-0">Tap to mark</span>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {showDropdown &&
                searchQuery.length >= 2 &&
                filteredResults.length === 0 &&
                !searchLoading && (
                  <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-lg px-3 py-3 text-sm text-muted-foreground">
                    No members found for &ldquo;{searchQuery}&rdquo;
                  </div>
                )}
            </div>
          )}

          {/* Attendance list */}
          {attendanceLoading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-xl" />
              ))}
            </div>
          ) : attendance.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-12 text-center">
              <UserCheck className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">No one marked yet.</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Search for a member above.</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {attendance.map((record, idx) => {
                const name = record.client
                  ? `${record.client.user.firstName} ${record.client.user.lastName}`
                  : (record.externalName ?? 'Unknown');
                const avatarSrc = record.client?.user.profileImageUrl ?? undefined;
                const initials = name
                  .split(' ')
                  .map((n) => n[0])
                  .join('')
                  .toUpperCase();
                const markedTime = format(new Date(record.markedAt), 'HH:mm');

                return (
                  <div
                    key={record.id}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-muted/40 border border-border/40"
                  >
                    <span className="text-xs text-muted-foreground w-4 shrink-0 text-center font-mono">
                      {idx + 1}
                    </span>
                    <Avatar className="h-9 w-9 shrink-0">
                      <AvatarImage src={avatarSrc} />
                      <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{name}</p>
                      <p className="text-xs text-muted-foreground">{markedTime}</p>
                    </div>
                    {!record.clientProfileId && (
                      <Badge variant="secondary" className="text-xs shrink-0">
                        Walk-in
                      </Badge>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                      onClick={() => removeAttendance(record)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
