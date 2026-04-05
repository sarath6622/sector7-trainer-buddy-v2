'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import {
  CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  Search,
  UserCheck,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

  // Client search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load trainer's classes
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

  // Open/get session when class + date changes
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

  // Load attendance when session is set
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

  // Client search with debounce
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

  // Close dropdown on outside click
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

  // Filter out already-marked clients from search results
  const filteredResults = searchResults.filter((r) => !alreadyMarkedIds.has(r.id));

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-orange-500/10">
          <Dumbbell className="h-5 w-5 text-orange-500" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">CrossFit Attendance</h1>
          <p className="text-sm text-muted-foreground">Mark attendance for your classes</p>
        </div>
      </div>

      {/* Step 1: Class selector */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Select Class
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {classesLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : classes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No classes assigned to you yet. Ask admin to assign a CrossFit class.
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
              <SelectTrigger className="w-full">
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
        </CardContent>
      </Card>

      {/* Step 2: Date picker */}
      {selectedClassId && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Date
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10 shrink-0"
                onClick={() => adjustDate(-1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="flex-1 relative">
                <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  type="date"
                  className="pl-9 h-10 text-base"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                />
              </div>
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10 shrink-0"
                onClick={() => adjustDate(1)}
                disabled={selectedDate >= format(new Date(), 'yyyy-MM-dd')}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Attendance */}
      {selectedClassId && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  Attendance
                </CardTitle>
                {selectedClass && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {selectedClass.name} ·{' '}
                    {format(new Date(selectedDate + 'T00:00:00'), 'EEE, d MMM yyyy')}
                  </p>
                )}
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
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
            {sessionLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <>
                {/* Search combobox */}
                <div ref={searchRef} className="relative">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                      className="pl-9 h-10 text-base"
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

                  {/* Dropdown results */}
                  {showDropdown && filteredResults.length > 0 && (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-lg overflow-hidden">
                      {filteredResults.map((r) => (
                        <button
                          key={r.id}
                          className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-accent transition-colors"
                          onClick={() => markPresent(r)}
                          disabled={markingId === r.id}
                        >
                          <Avatar className="h-8 w-8 shrink-0">
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
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {r.isEnrolled && (
                              <Badge
                                variant="secondary"
                                className="bg-blue-500/15 text-blue-600 text-xs"
                              >
                                Enrolled
                              </Badge>
                            )}
                            {markingId === r.id ? (
                              <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                            ) : (
                              <span className="text-xs text-muted-foreground">Tap to mark</span>
                            )}
                          </div>
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

                {/* Attendance list */}
                {attendanceLoading ? (
                  <div className="space-y-2">
                    {[...Array(3)].map((_, i) => (
                      <Skeleton key={i} className="h-14 w-full" />
                    ))}
                  </div>
                ) : attendance.length === 0 ? (
                  <div className="py-6 text-center">
                    <UserCheck className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">
                      No one marked yet. Search for a member above.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
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
                          className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 border border-border/50"
                        >
                          <span className="text-xs text-muted-foreground w-5 shrink-0 text-center font-mono">
                            {idx + 1}
                          </span>
                          <Avatar className="h-9 w-9 shrink-0">
                            <AvatarImage src={avatarSrc} />
                            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{name}</p>
                            <p className="text-xs text-muted-foreground">Marked at {markedTime}</p>
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
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
