'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  Search,
  X,
  Play,
  StopCircle,
  ChevronLeft,
  CheckCircle2,
  Circle,
  UserPlus,
  Dumbbell,
  CalendarDays,
} from 'lucide-react';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CrossfitClassTrainer {
  trainerProfileId: string;
  trainer: { user: { firstName: string; lastName: string } };
}

interface CrossfitClass {
  id: string;
  name: string;
  dayOfWeek: string;
  startTime: string;
  durationMin: number;
  trainers: CrossfitClassTrainer[];
  _count: { enrollments: number };
}

interface CrossfitSession {
  id: string;
  status: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED';
  startedAt: string | null;
  _count: { attendances: number };
}

interface TodayItem {
  class: CrossfitClass;
  session: CrossfitSession | null;
}

interface EnrolledMember {
  enrollmentId: string;
  clientProfileId: string | null;
  externalName: string | null;
  name: string;
  profileImageUrl: string | null;
  clientType: 'GYM_MEMBER' | 'GYM_ONLY' | 'EXTERNAL_ONLY';
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DAY_LABEL: Record<string, string> = {
  MONDAY: 'Mon',
  TUESDAY: 'Tue',
  WEDNESDAY: 'Wed',
  THURSDAY: 'Thu',
  FRIDAY: 'Fri',
  SATURDAY: 'Sat',
  SUNDAY: 'Sun',
};

function formatTime12(t: string) {
  const [h = '0', m = '00'] = t.split(':');
  const hour = parseInt(h, 10);
  return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`;
}

function initials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function CrossfitTrainerPage() {
  const router = useRouter();
  const today = format(new Date(), 'yyyy-MM-dd');

  // ── View mode ──
  // 'pick'       → show today's class cards (initial view)
  // 'attendance' → roll-call view for a specific class + date
  const [mode, setMode] = useState<'pick' | 'attendance'>('pick');

  // ── Today's classes ──
  const [todayItems, setTodayItems] = useState<TodayItem[]>([]);
  const [todayLoading, setTodayLoading] = useState(true);
  const [startingClassId, setStartingClassId] = useState<string | null>(null);

  // ── All classes (for "other date" class switcher) ──
  const [allClasses, setAllClasses] = useState<CrossfitClass[]>([]);

  // ── Attendance mode state ──
  const [activeClass, setActiveClass] = useState<CrossfitClass | null>(null);
  const [activeDate, setActiveDate] = useState(today);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionStatus, setSessionStatus] = useState<string | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);

  const [enrolled, setEnrolled] = useState<EnrolledMember[]>([]);
  const [enrolledLoading, setEnrolledLoading] = useState(false);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);

  // ── Walk-in search ──
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [endingSession, setEndingSession] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // ── Load today's classes ──────────────────────────────────────────────────

  const fetchToday = useCallback(async () => {
    setTodayLoading(true);
    try {
      const res = await fetch('/api/crossfit/sessions/today');
      const data = await res.json();
      const items: TodayItem[] = data.data ?? [];
      setTodayItems(items);

      // Auto-jump to attendance if there's already an in-progress session
      const live = items.find((i) => i.session?.status === 'IN_PROGRESS');
      if (live) {
        enterAttendanceMode(live.class, today);
      }
    } catch {
      // silent
    } finally {
      setTodayLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchToday();
    // Fetch all classes for the class switcher (historical dates)
    fetch('/api/crossfit/classes')
      .then((r) => r.json())
      .then((d) => setAllClasses(d.data ?? []))
      .catch(() => {});
  }, [fetchToday]);

  // ── Enter attendance mode ────────────────────────────────────────────────

  function enterAttendanceMode(cls: CrossfitClass, date: string) {
    setActiveClass(cls);
    setActiveDate(date);
    setMode('attendance');
    setShowSearch(false);
    setSearchQuery('');
  }

  // ── Open/get session ─────────────────────────────────────────────────────

  const openSession = useCallback(async (classId: string, date: string) => {
    setSessionLoading(true);
    setSessionId(null);
    setSessionStatus(null);
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
      setSessionStatus(data.data.status);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to open session');
    } finally {
      setSessionLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mode === 'attendance' && activeClass && activeDate) {
      openSession(activeClass.id, activeDate);
    }
  }, [mode, activeClass, activeDate, openSession]);

  // ── Load enrolled members ────────────────────────────────────────────────

  useEffect(() => {
    if (mode === 'attendance' && activeClass) {
      setEnrolledLoading(true);
      fetch(`/api/crossfit/classes/${activeClass.id}/enrollments`)
        .then((r) => r.json())
        .then((d) => setEnrolled(d.data ?? []))
        .catch(() => toast.error('Failed to load enrolled members'))
        .finally(() => setEnrolledLoading(false));
    }
  }, [mode, activeClass]);

  // ── Load attendance ──────────────────────────────────────────────────────

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

  // ── Walk-in search ───────────────────────────────────────────────────────

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
        if (activeClass) params.set('classId', activeClass.id);
        const res = await fetch(`/api/crossfit/clients/search?${params}`);
        const data = await res.json();
        setSearchResults(data.data ?? []);
        setShowDropdown(true);
      } catch {
        // silent
      } finally {
        setSearchLoading(false);
      }
    }, 300);
  }, [searchQuery, activeClass]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Actions ───────────────────────────────────────────────────────────────

  async function handleStart(item: TodayItem) {
    setStartingClassId(item.class.id);
    try {
      const sessionRes = await fetch('/api/crossfit/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classId: item.class.id, date: today }),
      });
      const sessionData = await sessionRes.json();
      if (!sessionRes.ok) throw new Error(sessionData.error ?? 'Failed');
      const sid = sessionData.data.id;

      const startRes = await fetch(`/api/crossfit/sessions/${sid}/start`, { method: 'POST' });
      if (!startRes.ok) {
        const err = await startRes.json();
        if (err.code !== 'CONFLICT') throw new Error(err.error ?? 'Failed to start');
      }
      enterAttendanceMode(item.class, today);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start session');
    } finally {
      setStartingClassId(null);
    }
  }

  async function markPresent(member: EnrolledMember) {
    if (!sessionId) return;
    const markingKey = member.clientProfileId ?? member.externalName ?? member.enrollmentId;
    setMarkingId(markingKey);
    try {
      const body = member.clientProfileId
        ? { clientProfileId: member.clientProfileId }
        : { externalName: member.externalName };
      const res = await fetch(`/api/crossfit/sessions/${sessionId}/attendance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      await fetchAttendance(sessionId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Failed to mark ${member.name}`);
    } finally {
      setMarkingId(null);
    }
  }

  async function markWalkIn(client: SearchResult) {
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
      toast.success(`${client.name} added`);
      setSearchQuery('');
      setShowDropdown(false);
      await fetchAttendance(sessionId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    } finally {
      setMarkingId(null);
    }
  }

  async function removeAttendance(record: AttendanceRecord) {
    if (!sessionId) return;
    try {
      await fetch(`/api/crossfit/sessions/${sessionId}/attendance/${record.id}`, {
        method: 'DELETE',
      });
      await fetchAttendance(sessionId);
    } catch {
      toast.error('Failed to remove');
    }
  }

  async function handleEndSession() {
    if (!sessionId) return;
    setEndingSession(true);
    setShowEndConfirm(false);
    try {
      const res = await fetch(`/api/crossfit/sessions/${sessionId}/end`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to end session');
      setSessionStatus('COMPLETED');
      toast.success('Session ended — attendance locked');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to end session');
    } finally {
      setEndingSession(false);
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  // Build lookup maps for both gym members (by clientProfileId) and externals (by externalName)
  const markedByClientId = new Map(
    attendance.filter((a) => a.clientProfileId).map((a) => [a.clientProfileId!, a]),
  );
  const markedByExternalName = new Map(
    attendance.filter((a) => !a.clientProfileId && a.externalName).map((a) => [a.externalName!, a]),
  );

  function getAttendanceRecord(member: EnrolledMember): AttendanceRecord | undefined {
    if (member.clientProfileId) return markedByClientId.get(member.clientProfileId);
    if (member.externalName) return markedByExternalName.get(member.externalName);
    return undefined;
  }

  const enrolledCount = enrolled.length;
  const markedEnrolledCount = enrolled.filter((e) => !!getAttendanceRecord(e)).length;
  const walkIns = attendance.filter((a) =>
    a.clientProfileId === null
      ? !enrolled.some((e) => e.externalName === a.externalName)
      : !enrolled.some((e) => e.clientProfileId === a.clientProfileId),
  );
  const isLive = sessionStatus === 'IN_PROGRESS';
  const isCompleted = sessionStatus === 'COMPLETED';

  // Sort: unmarked first, marked at bottom
  const sortedEnrolled = [...enrolled].sort((a, b) => {
    const aMarked = !!getAttendanceRecord(a) ? 1 : 0;
    const bMarked = !!getAttendanceRecord(b) ? 1 : 0;
    return aMarked - bMarked;
  });

  const searchFilteredResults = searchResults.filter((r) => !markedByClientId.has(r.id));

  // ── Render: pick mode ────────────────────────────────────────────────────

  if (mode === 'pick') {
    return (
      <div className="flex flex-col min-h-full">
        {/* Header */}
        <div className="px-4 pt-4 pb-3">
          <div className="flex items-center gap-2 mb-1">
            <Dumbbell className="h-5 w-5 text-orange-500" />
            <h1 className="text-lg font-bold">CrossFit</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            {new Date().toLocaleDateString('en-IN', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </p>
        </div>

        {/* Today's classes */}
        <div className="px-4 space-y-3 flex-1">
          {todayLoading ? (
            <>
              <Skeleton className="h-28 w-full rounded-2xl" />
              <Skeleton className="h-28 w-full rounded-2xl" />
            </>
          ) : todayItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted mb-4">
                <Dumbbell className="h-7 w-7 text-muted-foreground/40" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">No CrossFit classes today</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Your assigned classes will appear here
              </p>
            </div>
          ) : (
            todayItems.map((item) => {
              const isInProgress = item.session?.status === 'IN_PROGRESS';
              const isCompleted = item.session?.status === 'COMPLETED';
              const isStarting = startingClassId === item.class.id;

              return (
                <div
                  key={item.class.id}
                  className={`rounded-2xl p-4 ring-1 ${
                    isInProgress ? 'bg-emerald-500/8 ring-emerald-500/25' : 'bg-card ring-border/50'
                  }`}
                >
                  {/* Class info */}
                  <div className="flex items-start gap-3 mb-4">
                    <div
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                        isInProgress ? 'bg-emerald-500/15' : 'bg-orange-500/10'
                      }`}
                    >
                      <Dumbbell
                        className={`h-5 w-5 ${isInProgress ? 'text-emerald-500' : 'text-orange-500'}`}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-base leading-tight">{item.class.name}</p>
                        {isInProgress && (
                          <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-500 shrink-0">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Live
                          </span>
                        )}
                        {isCompleted && (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground shrink-0">
                            Done
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {formatTime12(item.class.startTime)} · {item.class.durationMin} min
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {item.class._count.enrollments} enrolled
                      </p>
                    </div>
                  </div>

                  {/* Action button */}
                  {isCompleted ? (
                    <button
                      onClick={() => enterAttendanceMode(item.class, today)}
                      className="w-full flex items-center justify-center gap-2 rounded-xl bg-muted py-3 text-sm font-semibold text-muted-foreground hover:bg-muted/80 transition-colors"
                    >
                      View Attendance
                    </button>
                  ) : isInProgress ? (
                    <button
                      onClick={() => enterAttendanceMode(item.class, today)}
                      className="relative overflow-hidden w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors"
                    >
                      <span className="absolute inset-0 rounded-xl animate-ping bg-emerald-400 opacity-20" />
                      <CheckCircle2 className="relative h-4 w-4" />
                      <span className="relative">Mark Attendance</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => handleStart(item)}
                      disabled={isStarting}
                      className="w-full flex items-center justify-center gap-2 rounded-xl bg-orange-500 py-3 text-sm font-semibold text-white hover:bg-orange-600 transition-colors disabled:opacity-50"
                    >
                      <Play className="h-4 w-4" />
                      {isStarting ? 'Starting…' : 'Start Class'}
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Historical / other date link */}
        {allClasses.length > 0 && (
          <div className="px-4 pt-4 pb-6">
            <button
              onClick={() => {
                const first = allClasses[0];
                if (first) enterAttendanceMode(first, today);
              }}
              className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <CalendarDays className="h-4 w-4" />
              View other dates
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── Render: attendance mode ──────────────────────────────────────────────

  return (
    <div className="flex flex-col min-h-full">
      {/* ── Sticky header ── */}
      <div className="sticky top-0 z-20 bg-background border-b border-border/60">
        {/* Class name row */}
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            onClick={() => router.push('/trainer')}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-muted transition-colors"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-base truncate">{activeClass?.name}</p>
              {isLive && (
                <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-500 shrink-0">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  LIVE
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <p className="text-xs text-muted-foreground">
                {activeClass &&
                  `${DAY_LABEL[activeClass.dayOfWeek]} · ${formatTime12(activeClass.startTime)}`}
              </p>
              {/* Date switcher (compact) */}
              <button
                onClick={() => {
                  const d = new Date(activeDate + 'T00:00:00');
                  const newDate = prompt('Enter date (YYYY-MM-DD)', format(d, 'yyyy-MM-dd'));
                  if (newDate) setActiveDate(newDate);
                }}
                className="text-xs text-muted-foreground/60 hover:text-foreground transition-colors"
              >
                · {format(new Date(activeDate + 'T00:00:00'), 'd MMM yyyy')}
              </button>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        {!sessionLoading && enrolledCount > 0 && (
          <div className="px-4 pb-3">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground tabular-nums">
                  {markedEnrolledCount}
                </span>
                {' / '}
                <span className="tabular-nums">{enrolledCount}</span>
                {' enrolled checked in'}
                {walkIns.length > 0 && (
                  <span className="text-muted-foreground/60">
                    {' '}
                    · +{walkIns.length} walk-in{walkIns.length !== 1 ? 's' : ''}
                  </span>
                )}
              </p>
              <p className="text-xs font-semibold tabular-nums">
                {enrolledCount > 0 ? Math.round((markedEnrolledCount / enrolledCount) * 100) : 0}%
              </p>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                style={{
                  width:
                    enrolledCount > 0 ? `${(markedEnrolledCount / enrolledCount) * 100}%` : '0%',
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Start banner (if session not started yet) ── */}
      {!sessionLoading && sessionStatus === 'SCHEDULED' && (
        <div className="mx-4 mt-3 rounded-2xl bg-orange-500/10 ring-1 ring-orange-500/25 p-4">
          <p className="text-sm font-semibold text-orange-500 mb-0.5">Class not started yet</p>
          <p className="text-xs text-muted-foreground mb-3">
            Start the class to begin marking attendance.
          </p>
          <button
            onClick={async () => {
              if (!sessionId) return;
              const res = await fetch(`/api/crossfit/sessions/${sessionId}/start`, {
                method: 'POST',
              });
              if (res.ok) setSessionStatus('IN_PROGRESS');
              else toast.error('Failed to start class');
            }}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-orange-500 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 transition-colors"
          >
            <Play className="h-4 w-4" />
            Start Class
          </button>
        </div>
      )}

      {/* ── Enrolled member roll call ── */}
      <div className="flex-1 px-4 pt-3 pb-4">
        {/* Enrolled list label */}
        {enrolledCount > 0 && (
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">
            Enrolled Members · {enrolledCount}
          </p>
        )}

        {enrolledLoading || sessionLoading || attendanceLoading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-2xl" />
            ))}
          </div>
        ) : enrolledCount === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted mb-3">
              <Dumbbell className="h-6 w-6 text-muted-foreground/30" />
            </div>
            <p className="text-sm text-muted-foreground">No enrolled members</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Use walk-in to add members</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sortedEnrolled.map((member) => {
              const record = getAttendanceRecord(member);
              const isMarked = !!record;
              const markingKey =
                member.clientProfileId ?? member.externalName ?? member.enrollmentId;
              const isMarkingThis = markingId === markingKey;
              const markedTime = record ? format(new Date(record.markedAt), 'HH:mm') : null;

              return (
                <button
                  key={member.enrollmentId}
                  onClick={() => {
                    if (isMarkingThis || isCompleted) return;
                    if (isMarked && record) {
                      removeAttendance(record);
                    } else {
                      markPresent(member);
                    }
                  }}
                  disabled={isMarkingThis || (!isLive && !isMarked)}
                  className={`w-full flex items-center gap-3 rounded-2xl px-3 py-3 text-left transition-all active:scale-[0.98] ${
                    isMarked
                      ? 'bg-emerald-500/10 ring-1 ring-emerald-500/25'
                      : isLive
                        ? 'bg-card ring-1 ring-border/50 hover:ring-border'
                        : 'bg-card ring-1 ring-border/30 opacity-60'
                  } disabled:cursor-default`}
                >
                  {/* Avatar */}
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarImage src={member.profileImageUrl ?? undefined} />
                    <AvatarFallback
                      className={`text-xs font-semibold ${isMarked ? 'bg-emerald-500/20 text-emerald-600' : 'bg-muted'}`}
                    >
                      {initials(member.name)}
                    </AvatarFallback>
                  </Avatar>

                  {/* Name + time */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium truncate">{member.name}</p>
                      {member.clientType === 'GYM_ONLY' && (
                        <span className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold bg-emerald-500/15 text-emerald-600">
                          GEN
                        </span>
                      )}
                      {member.clientType === 'EXTERNAL_ONLY' && (
                        <span className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold bg-zinc-500/15 text-zinc-400">
                          EXT
                        </span>
                      )}
                    </div>
                    {isMarked && markedTime && (
                      <p className="text-xs text-emerald-600">Checked in · {markedTime}</p>
                    )}
                    {!isMarked && (
                      <p className="text-xs text-muted-foreground">
                        {member.clientType === 'GYM_MEMBER'
                          ? 'PT Client'
                          : member.clientType === 'GYM_ONLY'
                            ? 'General'
                            : 'External'}
                      </p>
                    )}
                  </div>

                  {/* Status icon */}
                  <div className="shrink-0">
                    {isMarkingThis ? (
                      <div className="h-5 w-5 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
                    ) : isMarked ? (
                      <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                    ) : (
                      <Circle className="h-6 w-6 text-border" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* ── Walk-ins ── */}
        {walkIns.length > 0 && (
          <div className="mt-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">
              Walk-ins · {walkIns.length}
            </p>
            <div className="space-y-2">
              {walkIns.map((record) => {
                const name = record.client
                  ? `${record.client.user.firstName} ${record.client.user.lastName}`
                  : (record.externalName ?? 'Unknown');
                const avatarSrc = record.client?.user.profileImageUrl ?? undefined;
                const markedTime = format(new Date(record.markedAt), 'HH:mm');

                return (
                  <div
                    key={record.id}
                    className="flex items-center gap-3 rounded-2xl bg-blue-500/8 ring-1 ring-blue-500/20 px-3 py-3"
                  >
                    <Avatar className="h-10 w-10 shrink-0">
                      <AvatarImage src={avatarSrc} />
                      <AvatarFallback className="text-xs bg-blue-500/15 text-blue-600">
                        {initials(name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{name}</p>
                      <p className="text-xs text-blue-600">Walk-in · {markedTime}</p>
                    </div>
                    <button
                      onClick={() => removeAttendance(record)}
                      className="h-8 w-8 flex items-center justify-center rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Completed banner ── */}
        {isCompleted && (
          <div className="mt-4 rounded-2xl bg-muted/40 ring-1 ring-border/50 px-4 py-3 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-muted-foreground shrink-0" />
            <p className="text-sm text-muted-foreground">Session ended · Attendance is locked</p>
          </div>
        )}

        {/* ── Add walk-in ── */}
        {isLive && (
          <div className="mt-4" ref={searchRef}>
            {!showSearch ? (
              <button
                onClick={() => {
                  setShowSearch(true);
                  setTimeout(() => searchInputRef.current?.focus(), 50);
                }}
                className="w-full flex items-center justify-center gap-2 rounded-2xl border border-dashed border-border py-3.5 text-sm text-muted-foreground hover:border-foreground/30 hover:text-foreground transition-colors"
              >
                <UserPlus className="h-4 w-4" />
                Add walk-in
              </button>
            ) : (
              <div className="rounded-2xl bg-card ring-1 ring-border overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-3 border-b border-border/40">
                  <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                  <input
                    ref={searchInputRef}
                    className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                    placeholder="Search member name…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
                  />
                  {searchLoading ? (
                    <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin shrink-0" />
                  ) : (
                    <button
                      onClick={() => {
                        setShowSearch(false);
                        setSearchQuery('');
                        setShowDropdown(false);
                      }}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {showDropdown && searchFilteredResults.length > 0 && (
                  <div>
                    {searchFilteredResults.map((r) => (
                      <button
                        key={r.id}
                        className="w-full flex items-center gap-3 px-3 py-3 text-left hover:bg-muted/50 active:bg-muted transition-colors border-b border-border/30 last:border-0"
                        onClick={() => markWalkIn(r)}
                        disabled={markingId === r.id}
                      >
                        <Avatar className="h-9 w-9 shrink-0">
                          <AvatarImage src={r.profileImageUrl ?? undefined} />
                          <AvatarFallback className="text-xs">{initials(r.name)}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{r.name}</p>
                          {r.isEnrolled && (
                            <p className="text-xs text-blue-500">Already enrolled</p>
                          )}
                        </div>
                        {markingId === r.id ? (
                          <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin shrink-0" />
                        ) : (
                          <UserPlus className="h-4 w-4 text-muted-foreground shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {showDropdown &&
                  searchQuery.length >= 2 &&
                  searchFilteredResults.length === 0 &&
                  !searchLoading && (
                    <p className="px-3 py-3 text-sm text-muted-foreground">
                      No members found for &ldquo;{searchQuery}&rdquo;
                    </p>
                  )}

                {searchQuery.length < 2 && (
                  <p className="px-3 py-3 text-xs text-muted-foreground">
                    Type at least 2 characters to search
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── End Session sticky bottom bar ── */}
      {isLive && (
        <div className="sticky bottom-0 px-4 pb-5 pt-3 bg-gradient-to-t from-background via-background/95 to-transparent">
          <button
            onClick={() => setShowEndConfirm(true)}
            disabled={endingSession}
            className="w-full flex items-center justify-center gap-2 rounded-2xl bg-red-500 py-3.5 text-sm font-semibold text-white hover:bg-red-600 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            <StopCircle className="h-4 w-4" />
            {endingSession ? 'Ending session…' : 'End Session'}
          </button>
        </div>
      )}

      {/* ── End session confirmation modal ── */}
      {showEndConfirm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl bg-card ring-1 ring-border/60 p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-red-500/10">
                <StopCircle className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="font-semibold">End this session?</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {attendance.length} member{attendance.length !== 1 ? 's' : ''} marked present ·
                  Attendance will be locked
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowEndConfirm(false)}
                className="flex-1 rounded-xl bg-muted py-2.5 text-sm font-semibold text-muted-foreground hover:bg-muted/80 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleEndSession}
                className="flex-1 rounded-xl bg-red-500 py-2.5 text-sm font-semibold text-white hover:bg-red-600 transition-colors"
              >
                End Session
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
