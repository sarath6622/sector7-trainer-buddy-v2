'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, Pencil, Dumbbell, Users } from 'lucide-react';
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

interface CrossfitClass {
  id: string;
  trainerProfileId: string;
  name: string;
  dayOfWeek: string;
  startTime: string;
  durationMin: number;
  maxCapacity: number;
  isActive: boolean;
  trainer: Trainer;
  _count: { enrollments: number };
}

interface Enrollment {
  id: string;
  classId: string;
  clientProfileId: string | null;
  clientType: 'GYM_MEMBER' | 'EXTERNAL_ONLY';
  externalName: string | null;
  externalPhone: string | null;
  client: { user: { firstName: string; lastName: string; email: string } } | null;
  class: { name: string; dayOfWeek: string; startTime: string; durationMin: number };
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

export default function CrossfitPage() {
  const { confirm, ConfirmDialog } = useConfirm();
  const [classes, setClasses] = useState<CrossfitClass[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [trainers, setTrainers] = useState<TrainerOption[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(true);

  const [classFilter, setClassFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  // Class dialog
  const [classDialogOpen, setClassDialogOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<CrossfitClass | null>(null);
  const [classForm, setClassForm] = useState({
    trainerProfileId: '',
    name: '',
    dayOfWeek: 'MONDAY',
    startTime: '06:00',
    durationMin: 60,
    maxCapacity: 20,
  });
  const [classSubmitting, setClassSubmitting] = useState(false);

  // Enrollment dialog
  const [enrollDialogOpen, setEnrollDialogOpen] = useState(false);
  const [enrollForm, setEnrollForm] = useState({
    classId: '',
    clientType: 'GYM_MEMBER' as 'GYM_MEMBER' | 'EXTERNAL_ONLY',
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

  function openCreateClass() {
    setEditingClass(null);
    setClassForm({
      trainerProfileId: '',
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
      trainerProfileId: cls.trainerProfileId,
      name: cls.name,
      dayOfWeek: cls.dayOfWeek,
      startTime: cls.startTime,
      durationMin: cls.durationMin,
      maxCapacity: cls.maxCapacity,
    });
    setClassDialogOpen(true);
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
          ? {
              classId: enrollForm.classId,
              clientType: 'GYM_MEMBER',
              clientProfileId: enrollForm.clientProfileId,
            }
          : {
              classId: enrollForm.classId,
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
    if (classFilter && e.classId !== classFilter) return false;
    if (typeFilter && e.clientType !== typeFilter) return false;
    return true;
  });

  const dayLabel = (d: string) => d.charAt(0) + d.slice(1).toLowerCase();

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
        <TabsList className="grid w-full grid-cols-2 md:w-80">
          <TabsTrigger value="classes">Classes</TabsTrigger>
          <TabsTrigger value="enrollments">Enrollments</TabsTrigger>
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
                        <TableHead className="hidden md:table-cell">Trainer</TableHead>
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
                            {cls.trainer.user.firstName} {cls.trainer.user.lastName}
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
                    classId: '',
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
              <div className="flex flex-col sm:flex-row gap-3 mb-4">
                <Select
                  value={classFilter || 'all'}
                  items={[
                    { value: 'all', label: 'All classes' },
                    ...classes.map((c) => ({ value: c.id, label: c.name })),
                  ]}
                  onValueChange={(v) => setClassFilter(v === 'all' || !v ? '' : v)}
                >
                  <SelectTrigger className="w-full sm:w-48">
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
                <Select
                  value={typeFilter || 'all'}
                  items={[
                    { value: 'all', label: 'All types' },
                    { value: 'GYM_MEMBER', label: 'Gym Member' },
                    { value: 'EXTERNAL_ONLY', label: 'External' },
                  ]}
                  onValueChange={(v) => setTypeFilter(v === 'all' || !v ? '' : v)}
                >
                  <SelectTrigger className="w-full sm:w-48">
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All types</SelectItem>
                    <SelectItem value="GYM_MEMBER">Gym Member</SelectItem>
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
                        <TableHead className="hidden sm:table-cell">Class</TableHead>
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
                                  : 'bg-zinc-500/15 text-zinc-500'
                              }
                            >
                              {e.clientType === 'GYM_MEMBER' ? 'Gym Member' : 'External'}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                            {e.class.name} · {dayLabel(e.class.dayOfWeek)} {e.class.startTime}
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
            <div className="space-y-1.5">
              <Label>CrossFit Trainer</Label>
              <Select
                value={classForm.trainerProfileId || null}
                items={trainers.map((t) => ({
                  value: t.id,
                  label: `${t.user.firstName} ${t.user.lastName}`,
                }))}
                onValueChange={(v) => setClassForm((f) => ({ ...f, trainerProfileId: v ?? '' }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select trainer" />
                </SelectTrigger>
                <SelectContent>
                  {trainers.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.user.firstName} {t.user.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                disabled={classSubmitting || !classForm.name || !classForm.trainerProfileId}
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
            <div className="space-y-1.5">
              <Label>Class</Label>
              <Select
                value={enrollForm.classId || null}
                items={classes
                  .filter((c) => c.isActive)
                  .map((c) => ({
                    value: c.id,
                    label: `${c.name} · ${dayLabel(c.dayOfWeek)} ${c.startTime}`,
                  }))}
                onValueChange={(v) => setEnrollForm((f) => ({ ...f, classId: v ?? '' }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select class" />
                </SelectTrigger>
                <SelectContent>
                  {classes
                    .filter((c) => c.isActive)
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} · {dayLabel(c.dayOfWeek)} {c.startTime}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Member Type</Label>
              <Select
                value={enrollForm.clientType}
                items={[
                  { value: 'GYM_MEMBER', label: 'Gym Member (has app access)' },
                  { value: 'EXTERNAL_ONLY', label: 'External / Walk-in' },
                ]}
                onValueChange={(v) =>
                  setEnrollForm((f) => ({
                    ...f,
                    clientType: (v ?? 'GYM_MEMBER') as 'GYM_MEMBER' | 'EXTERNAL_ONLY',
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GYM_MEMBER">Gym Member (has app access)</SelectItem>
                  <SelectItem value="EXTERNAL_ONLY">External / Walk-in</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {enrollForm.clientType === 'GYM_MEMBER' ? (
              <div className="space-y-1.5">
                <Label>Client</Label>
                <Select
                  value={enrollForm.clientProfileId || null}
                  items={clients.map((c) => ({
                    value: c.id,
                    label: `${c.user.firstName} ${c.user.lastName}`,
                  }))}
                  onValueChange={(v) => setEnrollForm((f) => ({ ...f, clientProfileId: v ?? '' }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select client" />
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
                    placeholder="External member name"
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
                  !enrollForm.classId ||
                  (enrollForm.clientType === 'GYM_MEMBER' && !enrollForm.clientProfileId) ||
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
