'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Plus,
  Trash2,
  Pencil,
  Dumbbell,
  Users,
  X,
  Search,
  CheckCircle2,
  UserCheck,
  CalendarDays,
} from 'lucide-react';
import { DateRangePickerModal } from '@/components/ui/date-range-picker-modal';
import { toast } from 'sonner';
import { useConfirm } from '@/hooks/use-confirm';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';

const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

interface Trainer {
  id: string;
  user: { firstName: string; lastName: string };
}

interface CrossfitClassTrainer {
  id: string;
  trainerProfileId: string;
  trainer: Trainer;
}

interface CrossfitClass {
  id: string;
  name: string;
  dayOfWeek: string;
  startTime: string;
  durationMin: number;
  maxCapacity: number;
  isActive: boolean;
  trainers: CrossfitClassTrainer[];
  _count: { enrollments: number };
}

interface Enrollment {
  id: string;
  clientProfileId: string | null;
  clientType: 'GYM_MEMBER' | 'GYM_ONLY' | 'EXTERNAL_ONLY';
  externalName: string | null;
  externalPhone: string | null;
  enrolledAt: string;
  client: { user: { firstName: string; lastName: string; email: string } } | null;
}

interface TrainerOption {
  id: string;
  userId: string;
  user: { firstName: string; lastName: string };
}

interface ClientOption {
  id: string;
  user: { firstName: string; lastName: string };
}

interface AttendanceRow {
  id: string;
  date: string; // YYYY-MM-DD
  class: { id: string; name: string; startTime: string };
  member: {
    type: 'GYM_MEMBER' | 'EXTERNAL';
    name: string;
    profileImageUrl: string | null;
  };
  markedAt: string; // ISO
  markedByName: string;
}

export default function CrossfitPage() {
  const { confirm, ConfirmDialog } = useConfirm();
  const [classes, setClasses] = useState<CrossfitClass[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [trainers, setTrainers] = useState<TrainerOption[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(true);

  const [typeFilter, setTypeFilter] = useState('');

  // Class dialog
  const [classDialogOpen, setClassDialogOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<CrossfitClass | null>(null);
  const [classForm, setClassForm] = useState({
    trainerProfileIds: [] as string[],
    name: '',
    dayOfWeek: 'MONDAY',
    startTime: '06:00',
    durationMin: 60,
    maxCapacity: 20,
  });
  const [classSubmitting, setClassSubmitting] = useState(false);

  // Attendance tab state
  const todayYMD = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const weekAgoYMD = () => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const [attendanceDateFrom, setAttendanceDateFrom] = useState(weekAgoYMD());
  const [attendanceDateTo, setAttendanceDateTo] = useState(todayYMD());
  const [attendanceClassId, setAttendanceClassId] = useState('');
  const [attendanceSearch, setAttendanceSearch] = useState('');
  const [attendancePage, setAttendancePage] = useState(1);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceRows, setAttendanceRows] = useState<AttendanceRow[]>([]);
  const [attendanceTotal, setAttendanceTotal] = useState(0);
  const [attendanceStats, setAttendanceStats] = useState<{
    totalAttendances: number;
    uniqueMembers: number;
    sessionsHeld: number;
    totalDurationMin: number;
  } | null>(null);
  const ATTENDANCE_PAGE_SIZE = 25;

  // Enrollment dialog
  const [enrollDialogOpen, setEnrollDialogOpen] = useState(false);
  const [enrollForm, setEnrollForm] = useState({
    clientType: 'GYM_MEMBER' as 'GYM_MEMBER' | 'GYM_ONLY' | 'EXTERNAL_ONLY',
    clientProfileId: '',
    externalName: '',
    externalPhone: '',
  });
  const [enrollSubmitting, setEnrollSubmitting] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [classRes, enrollRes, trainerRes, clientRes] = await Promise.all([
        fetch('/api/admin/crossfit/classes'),
        fetch('/api/admin/crossfit/enrollments'),
        fetch('/api/admin/users?role=CROSSFIT_TRAINER&pageSize=100'),
        fetch('/api/admin/users?role=CLIENT&pageSize=200'),
      ]);
      const [classData, enrollData, trainerData, clientData] = await Promise.all([
        classRes.json(),
        enrollRes.json(),
        trainerRes.json(),
        clientRes.json(),
      ]);
      setClasses(classData.data ?? []);
      setEnrollments(enrollData.data ?? []);
      setTrainers(
        (trainerData.data ?? [])
          .map((u: { trainerProfile: TrainerOption; firstName: string; lastName: string }) => ({
            id: u.trainerProfile?.id,
            userId: u.trainerProfile?.userId,
            user: { firstName: u.firstName, lastName: u.lastName },
          }))
          .filter((t: TrainerOption) => t.id),
      );
      setClients(
        (clientData.data ?? [])
          .map((u: { clientProfile: { id: string }; firstName: string; lastName: string }) => ({
            id: u.clientProfile?.id,
            user: { firstName: u.firstName, lastName: u.lastName },
          }))
          .filter((c: ClientOption) => c.id),
      );
    } catch {
      toast.error('Failed to load CrossFit data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Fetch attendance whenever any filter changes. Debounced via a small
  // setTimeout so typing in the search box doesn't fire a request per keystroke.
  useEffect(() => {
    const handle = setTimeout(() => {
      const qs = new URLSearchParams({
        dateFrom: attendanceDateFrom,
        dateTo: attendanceDateTo,
        page: String(attendancePage),
        pageSize: String(ATTENDANCE_PAGE_SIZE),
      });
      if (attendanceClassId) qs.set('classId', attendanceClassId);
      if (attendanceSearch.trim()) qs.set('search', attendanceSearch.trim());

      setAttendanceLoading(true);
      fetch(`/api/admin/crossfit/attendance?${qs.toString()}`)
        .then((r) => r.json())
        .then((res) => {
          setAttendanceRows(res.data ?? []);
          setAttendanceTotal(res.pagination?.total ?? 0);
          setAttendanceStats(res.stats ?? null);
        })
        .catch(() => toast.error('Failed to load attendance'))
        .finally(() => setAttendanceLoading(false));
    }, 250);
    return () => clearTimeout(handle);
  }, [attendanceDateFrom, attendanceDateTo, attendanceClassId, attendanceSearch, attendancePage]);

  // Resetting page when filters change keeps the user from landing on an empty page.
  useEffect(() => {
    setAttendancePage(1);
  }, [attendanceDateFrom, attendanceDateTo, attendanceClassId, attendanceSearch]);

  function openCreateClass() {
    setEditingClass(null);
    setClassForm({
      trainerProfileIds: [],
      name: '',
      dayOfWeek: 'MONDAY',
      startTime: '06:00',
      durationMin: 60,
      maxCapacity: 20,
    });
    setClassDialogOpen(true);
  }

  function openEditClass(cls: CrossfitClass) {
    setEditingClass(cls);
    setClassForm({
      trainerProfileIds: cls.trainers.map((t) => t.trainerProfileId),
      name: cls.name,
      dayOfWeek: cls.dayOfWeek,
      startTime: cls.startTime,
      durationMin: cls.durationMin,
      maxCapacity: cls.maxCapacity,
    });
    setClassDialogOpen(true);
  }

  function toggleTrainer(trainerId: string) {
    setClassForm((f) => ({
      ...f,
      trainerProfileIds: f.trainerProfileIds.includes(trainerId)
        ? f.trainerProfileIds.filter((id) => id !== trainerId)
        : [...f.trainerProfileIds, trainerId],
    }));
  }

  async function submitClass() {
    setClassSubmitting(true);
    try {
      const url = editingClass
        ? `/api/admin/crossfit/classes/${editingClass.id}`
        : '/api/admin/crossfit/classes';
      const method = editingClass ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(classForm),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Failed');
      }
      toast.success(editingClass ? 'Class updated' : 'Class created');
      setClassDialogOpen(false);
      fetchAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save class');
    } finally {
      setClassSubmitting(false);
    }
  }

  async function toggleClassActive(cls: CrossfitClass) {
    try {
      const res = await fetch(`/api/admin/crossfit/classes/${cls.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !cls.isActive }),
      });
      if (!res.ok) throw new Error('Failed');
      toast.success(cls.isActive ? 'Class deactivated' : 'Class activated');
      fetchAll();
    } catch {
      toast.error('Failed to update class');
    }
  }

  async function submitEnrollment() {
    setEnrollSubmitting(true);
    try {
      const body =
        enrollForm.clientType === 'GYM_MEMBER'
          ? { clientType: 'GYM_MEMBER', clientProfileId: enrollForm.clientProfileId }
          : enrollForm.clientType === 'GYM_ONLY'
            ? {
                clientType: 'GYM_ONLY',
                externalName: enrollForm.externalName,
                externalPhone: enrollForm.externalPhone,
              }
            : {
                clientType: 'EXTERNAL_ONLY',
                externalName: enrollForm.externalName,
                externalPhone: enrollForm.externalPhone,
              };

      const res = await fetch('/api/admin/crossfit/enrollments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Failed');
      }
      toast.success('Enrollment created');
      setEnrollDialogOpen(false);
      fetchAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to enroll');
    } finally {
      setEnrollSubmitting(false);
    }
  }

  async function removeEnrollment(id: string) {
    const ok = await confirm({
      title: 'Remove enrollment?',
      description: 'This will remove the client from this CrossFit class.',
      confirmText: 'Remove',
      variant: 'destructive',
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/admin/crossfit/enrollments/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed');
      toast.success('Enrollment removed');
      fetchAll();
    } catch {
      toast.error('Failed to remove enrollment');
    }
  }

  const filteredEnrollments = enrollments.filter((e) => {
    if (typeFilter && e.clientType !== typeFilter) return false;
    return true;
  });

  const dayLabel = (d: string) => d.charAt(0) + d.slice(1).toLowerCase();

  function trainerNames(cls: CrossfitClass) {
    return cls.trainers
      .map((t) => `${t.trainer.user.firstName} ${t.trainer.user.lastName}`)
      .join(', ');
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {ConfirmDialog}

      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-orange-500/10">
          <Dumbbell className="h-5 w-5 text-orange-500" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">CrossFit</h1>
          <p className="text-sm text-muted-foreground">Manage classes and enrollments</p>
        </div>
      </div>

      <Tabs defaultValue="classes">
        <TabsList className="grid w-full grid-cols-3 md:w-[30rem]">
          <TabsTrigger value="classes">Classes</TabsTrigger>
          <TabsTrigger value="enrollments">Enrollments</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
        </TabsList>

        {/* ── CLASSES TAB ── */}
        <TabsContent value="classes" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Class Schedule</CardTitle>
              <Button
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white"
                onClick={openCreateClass}
              >
                <Plus className="h-4 w-4 mr-1" /> Add Class
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-4 space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : classes.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">
                  No classes yet. Add one to get started.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Class</TableHead>
                        <TableHead className="hidden sm:table-cell">Day</TableHead>
                        <TableHead className="hidden sm:table-cell">Time</TableHead>
                        <TableHead className="hidden md:table-cell">Duration</TableHead>
                        <TableHead>
                          <Users className="h-4 w-4" />
                        </TableHead>
                        <TableHead className="hidden md:table-cell">Trainers</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {classes.map((cls) => (
                        <TableRow key={cls.id}>
                          <TableCell className="font-medium">{cls.name}</TableCell>
                          <TableCell className="hidden sm:table-cell">
                            {dayLabel(cls.dayOfWeek)}
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">{cls.startTime}</TableCell>
                          <TableCell className="hidden md:table-cell">{cls.durationMin}m</TableCell>
                          <TableCell>
                            {cls._count.enrollments}/{cls.maxCapacity}
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            <span className="text-sm">{trainerNames(cls)}</span>
                            {cls.trainers.length > 1 && (
                              <span className="ml-1 text-xs text-muted-foreground">
                                ({cls.trainers.length})
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="secondary"
                              className={
                                cls.isActive
                                  ? 'bg-emerald-500/15 text-emerald-600'
                                  : 'bg-zinc-500/15 text-zinc-500'
                              }
                            >
                              {cls.isActive ? 'Active' : 'Inactive'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => openEditClass(cls)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 text-xs"
                                onClick={() => toggleClassActive(cls)}
                              >
                                {cls.isActive ? 'Deactivate' : 'Activate'}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── ENROLLMENTS TAB ── */}
        <TabsContent value="enrollments" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Enrollments</CardTitle>
              <Button
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white"
                onClick={() => {
                  setEnrollForm({
                    clientType: 'GYM_MEMBER',
                    clientProfileId: '',
                    externalName: '',
                    externalPhone: '',
                  });
                  setEnrollDialogOpen(true);
                }}
              >
                <Plus className="h-4 w-4 mr-1" /> Enroll Member
              </Button>
            </CardHeader>
            <CardContent>
              <div className="flex gap-3 mb-4">
                <Select
                  value={typeFilter || 'all'}
                  items={[
                    { value: 'all', label: 'All types' },
                    { value: 'GYM_MEMBER', label: 'PT Client' },
                    { value: 'GYM_ONLY', label: 'General' },
                    { value: 'EXTERNAL_ONLY', label: 'External' },
                  ]}
                  onValueChange={(v) => setTypeFilter(v === 'all' || !v ? '' : v)}
                >
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All types</SelectItem>
                    <SelectItem value="GYM_MEMBER">PT Client</SelectItem>
                    <SelectItem value="GYM_ONLY">General</SelectItem>
                    <SelectItem value="EXTERNAL_ONLY">External</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {loading ? (
                <div className="space-y-3">
                  {[...Array(4)].map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : filteredEnrollments.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground text-sm">
                  No enrollments found.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Member</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="hidden sm:table-cell text-muted-foreground">
                          Enrolled
                        </TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredEnrollments.map((e) => (
                        <TableRow key={e.id}>
                          <TableCell className="font-medium">
                            {e.clientType === 'GYM_MEMBER' && e.client
                              ? `${e.client.user.firstName} ${e.client.user.lastName}`
                              : e.externalName}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="secondary"
                              className={
                                e.clientType === 'GYM_MEMBER'
                                  ? 'bg-blue-500/15 text-blue-600'
                                  : e.clientType === 'GYM_ONLY'
                                    ? 'bg-emerald-500/15 text-emerald-600'
                                    : 'bg-zinc-500/15 text-zinc-500'
                              }
                            >
                              {e.clientType === 'GYM_MEMBER'
                                ? 'PT Client'
                                : e.clientType === 'GYM_ONLY'
                                  ? 'General'
                                  : 'External'}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                            {new Date(e.enrolledAt).toLocaleDateString('en-IN', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => removeEnrollment(e.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── ATTENDANCE TAB ── */}
        <TabsContent value="attendance" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Attendance log</CardTitle>
            </CardHeader>
            <CardContent>
              {/* Stat cards — reflect the same filter context as the table below */}
              <div className="grid gap-3 mb-4 grid-cols-1 sm:grid-cols-3">
                <StatCard
                  icon={CheckCircle2}
                  iconBg="bg-emerald-500/15"
                  iconColor="text-emerald-600"
                  label="Attendances"
                  value={attendanceStats ? attendanceStats.totalAttendances.toString() : '—'}
                  loading={attendanceLoading && !attendanceStats}
                />
                <StatCard
                  icon={UserCheck}
                  iconBg="bg-blue-500/15"
                  iconColor="text-blue-600"
                  label="Unique members"
                  value={attendanceStats ? attendanceStats.uniqueMembers.toString() : '—'}
                  loading={attendanceLoading && !attendanceStats}
                />
                <StatCard
                  icon={CalendarDays}
                  iconBg="bg-orange-500/15"
                  iconColor="text-orange-600"
                  label="Sessions held"
                  value={attendanceStats ? attendanceStats.sessionsHeld.toString() : '—'}
                  loading={attendanceLoading && !attendanceStats}
                />
              </div>

              <div className="grid gap-3 mb-4 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Date range</Label>
                  <DateRangePickerModal
                    from={attendanceDateFrom}
                    to={attendanceDateTo}
                    onChange={({ from, to }) => {
                      setAttendanceDateFrom(from);
                      setAttendanceDateTo(to);
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Class</Label>
                  <Select
                    value={attendanceClassId || 'all'}
                    items={[
                      { value: 'all', label: 'All classes' },
                      ...classes.map((c) => ({ value: c.id, label: c.name })),
                    ]}
                    onValueChange={(v) => setAttendanceClassId(v === 'all' || !v ? '' : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All classes" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All classes</SelectItem>
                      {classes.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="att-search" className="text-xs text-muted-foreground">
                    Member
                  </Label>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      id="att-search"
                      placeholder="Search by name"
                      value={attendanceSearch}
                      onChange={(e) => setAttendanceSearch(e.target.value)}
                      className="pl-8"
                    />
                  </div>
                </div>
              </div>

              {attendanceLoading ? (
                <div className="space-y-3">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : attendanceRows.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground text-sm">
                  No attendance recorded for this filter.
                </div>
              ) : (
                <>
                  {/* Mobile card list — stacks per row, no horizontal scroll */}
                  <div className="space-y-2 sm:hidden">
                    {attendanceRows.map((r) => (
                      <div key={r.id} className="rounded-xl bg-card p-3 ring-1 ring-border/50">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium truncate">{r.member.name}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground truncate">
                              {new Date(r.date).toLocaleDateString('en-IN', {
                                day: 'numeric',
                                month: 'short',
                              })}
                              {' · '}
                              {r.class.name} · {r.class.startTime}
                            </p>
                            <p className="mt-0.5 text-[11px] text-muted-foreground/80 truncate">
                              Marked{' '}
                              {new Date(r.markedAt).toLocaleTimeString('en-IN', {
                                hour: '2-digit',
                                minute: '2-digit',
                                hour12: false,
                              })}{' '}
                              · by {r.markedByName}
                            </p>
                          </div>
                          <Badge
                            variant="secondary"
                            className={
                              r.member.type === 'GYM_MEMBER'
                                ? 'bg-blue-500/15 text-blue-600 shrink-0'
                                : 'bg-zinc-500/15 text-zinc-500 shrink-0'
                            }
                          >
                            {r.member.type === 'GYM_MEMBER' ? 'Member' : 'Walk-in'}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Desktop table */}
                  <div className="hidden sm:block overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Class</TableHead>
                          <TableHead>Member</TableHead>
                          <TableHead className="hidden sm:table-cell">Type</TableHead>
                          <TableHead className="hidden md:table-cell">Marked at</TableHead>
                          <TableHead className="hidden lg:table-cell">By</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {attendanceRows.map((r) => (
                          <TableRow key={r.id}>
                            <TableCell className="whitespace-nowrap text-sm">
                              {new Date(r.date).toLocaleDateString('en-IN', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </TableCell>
                            <TableCell className="text-sm">
                              <span className="font-medium">{r.class.name}</span>
                              <span className="ml-1.5 text-xs text-muted-foreground">
                                {r.class.startTime}
                              </span>
                            </TableCell>
                            <TableCell className="font-medium">{r.member.name}</TableCell>
                            <TableCell className="hidden sm:table-cell">
                              <Badge
                                variant="secondary"
                                className={
                                  r.member.type === 'GYM_MEMBER'
                                    ? 'bg-blue-500/15 text-blue-600'
                                    : 'bg-zinc-500/15 text-zinc-500'
                                }
                              >
                                {r.member.type === 'GYM_MEMBER' ? 'Member' : 'Walk-in'}
                              </Badge>
                            </TableCell>
                            <TableCell className="hidden md:table-cell text-muted-foreground text-sm whitespace-nowrap">
                              {new Date(r.markedAt).toLocaleTimeString('en-IN', {
                                hour: '2-digit',
                                minute: '2-digit',
                                hour12: false,
                              })}
                            </TableCell>
                            <TableCell className="hidden lg:table-cell text-muted-foreground text-sm">
                              {r.markedByName}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="mt-4 flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      Showing {(attendancePage - 1) * ATTENDANCE_PAGE_SIZE + 1}
                      {'–'}
                      {Math.min(attendancePage * ATTENDANCE_PAGE_SIZE, attendanceTotal)} of{' '}
                      {attendanceTotal}
                    </span>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={attendancePage <= 1}
                        onClick={() => setAttendancePage((p) => Math.max(1, p - 1))}
                      >
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={attendancePage * ATTENDANCE_PAGE_SIZE >= attendanceTotal}
                        onClick={() => setAttendancePage((p) => p + 1)}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── CLASS DIALOG ── */}
      <Dialog open={classDialogOpen} onOpenChange={setClassDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingClass ? 'Edit Class' : 'Add CrossFit Class'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Class Name</Label>
              <Input
                placeholder="e.g. Monday 6AM WOD"
                value={classForm.name}
                onChange={(e) => setClassForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>

            {/* Multi-trainer selector */}
            <div className="space-y-1.5">
              <Label>CrossFit Trainers</Label>
              {classForm.trainerProfileIds.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {classForm.trainerProfileIds.map((tid) => {
                    const t = trainers.find((tr) => tr.id === tid);
                    if (!t) return null;
                    return (
                      <span
                        key={tid}
                        className="inline-flex items-center gap-1 rounded-full bg-blue-500/15 text-blue-600 px-2.5 py-0.5 text-xs font-medium"
                      >
                        {t.user.firstName} {t.user.lastName}
                        <button
                          type="button"
                          onClick={() => toggleTrainer(tid)}
                          className="hover:opacity-70"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
              <Select
                value={null}
                items={trainers
                  .filter((t) => !classForm.trainerProfileIds.includes(t.id))
                  .map((t) => ({
                    value: t.id,
                    label: `${t.user.firstName} ${t.user.lastName}`,
                  }))}
                onValueChange={(v) => v && toggleTrainer(v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Add a trainer…" />
                </SelectTrigger>
                <SelectContent>
                  {trainers
                    .filter((t) => !classForm.trainerProfileIds.includes(t.id))
                    .map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.user.firstName} {t.user.lastName}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {classForm.trainerProfileIds.length === 0 && (
                <p className="text-xs text-destructive">At least one trainer is required</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Day</Label>
                <Select
                  value={classForm.dayOfWeek}
                  items={DAYS.map((d) => ({ value: d, label: dayLabel(d) }))}
                  onValueChange={(v) => setClassForm((f) => ({ ...f, dayOfWeek: v ?? 'MONDAY' }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAYS.map((d) => (
                      <SelectItem key={d} value={d}>
                        {dayLabel(d)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Start Time</Label>
                <Input
                  type="time"
                  value={classForm.startTime}
                  onChange={(e) => setClassForm((f) => ({ ...f, startTime: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Duration (min)</Label>
                <Input
                  type="number"
                  min={15}
                  max={180}
                  value={classForm.durationMin}
                  onChange={(e) =>
                    setClassForm((f) => ({ ...f, durationMin: parseInt(e.target.value) || 60 }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Max Capacity</Label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={classForm.maxCapacity}
                  onChange={(e) =>
                    setClassForm((f) => ({ ...f, maxCapacity: parseInt(e.target.value) || 20 }))
                  }
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setClassDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                className="bg-blue-600 hover:bg-blue-700 text-white"
                onClick={submitClass}
                disabled={
                  classSubmitting || !classForm.name || classForm.trainerProfileIds.length === 0
                }
              >
                {classSubmitting ? 'Saving...' : editingClass ? 'Save Changes' : 'Create Class'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── ENROLLMENT DIALOG ── */}
      <Dialog open={enrollDialogOpen} onOpenChange={setEnrollDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Enroll Member</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              CrossFit enrollment is monthly — the member can attend any scheduled class.
            </p>
            <div className="space-y-1.5">
              <Label>Member Type</Label>
              <Select
                value={enrollForm.clientType}
                items={[
                  { value: 'GYM_MEMBER', label: 'PT Client' },
                  { value: 'GYM_ONLY', label: 'General (gym member, no PT)' },
                  { value: 'EXTERNAL_ONLY', label: 'External (walk-in, not a gym member)' },
                ]}
                onValueChange={(v) =>
                  setEnrollForm((f) => ({
                    ...f,
                    clientType: (v ?? 'GYM_MEMBER') as 'GYM_MEMBER' | 'GYM_ONLY' | 'EXTERNAL_ONLY',
                    clientProfileId: '',
                    externalName: '',
                    externalPhone: '',
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GYM_MEMBER">PT Client</SelectItem>
                  <SelectItem value="GYM_ONLY">General (gym member, no PT)</SelectItem>
                  <SelectItem value="EXTERNAL_ONLY">
                    External (walk-in, not a gym member)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            {enrollForm.clientType === 'GYM_MEMBER' ? (
              <div className="space-y-1.5">
                <Label>PT Client</Label>
                <Select
                  value={enrollForm.clientProfileId || null}
                  items={clients.map((c) => ({
                    value: c.id,
                    label: `${c.user.firstName} ${c.user.lastName}`,
                  }))}
                  onValueChange={(v) => setEnrollForm((f) => ({ ...f, clientProfileId: v ?? '' }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select PT client" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.user.firstName} {c.user.lastName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label>Full Name</Label>
                  <Input
                    placeholder={
                      enrollForm.clientType === 'GYM_ONLY' ? 'Gym member name' : 'Walk-in name'
                    }
                    value={enrollForm.externalName}
                    onChange={(e) => setEnrollForm((f) => ({ ...f, externalName: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Phone (optional)</Label>
                  <Input
                    placeholder="+91..."
                    value={enrollForm.externalPhone}
                    onChange={(e) =>
                      setEnrollForm((f) => ({ ...f, externalPhone: e.target.value }))
                    }
                  />
                </div>
              </>
            )}
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setEnrollDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                className="bg-blue-600 hover:bg-blue-700 text-white"
                onClick={submitEnrollment}
                disabled={
                  enrollSubmitting ||
                  (enrollForm.clientType === 'GYM_MEMBER' && !enrollForm.clientProfileId) ||
                  (enrollForm.clientType === 'GYM_ONLY' && !enrollForm.externalName) ||
                  (enrollForm.clientType === 'EXTERNAL_ONLY' && !enrollForm.externalName)
                }
              >
                {enrollSubmitting ? 'Enrolling...' : 'Enroll'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({
  icon: Icon,
  iconBg,
  iconColor,
  label,
  value,
  loading,
}: {
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string;
  loading: boolean;
}) {
  return (
    <div className="rounded-xl bg-card p-3 ring-1 ring-border/50">
      <div className="flex items-center gap-3">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
          <Icon className={`h-4 w-4 ${iconColor}`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground truncate">{label}</p>
          {loading ? (
            <Skeleton className="mt-1 h-5 w-12" />
          ) : (
            <p className="text-lg font-semibold leading-tight">{value}</p>
          )}
        </div>
      </div>
    </div>
  );
}
