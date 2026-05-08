'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, Pencil, Activity, Users } from 'lucide-react';
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

interface KickboxingClass {
  id: string;
  name: string;
  trainerProfileId: string;
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
  client: {
    user: { firstName: string; lastName: string; email: string };
  } | null;
  class: { name: string; dayOfWeek: string; startTime: string; durationMin: number };
}

interface TrainerOption {
  id: string;
  userId: string;
  user: { firstName: string; lastName: string };
}

export default function KickboxingPage() {
  const { confirm, ConfirmDialog } = useConfirm();
  const [classes, setClasses] = useState<KickboxingClass[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [trainers, setTrainers] = useState<TrainerOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [classFilter, setClassFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  // Class dialog
  const [classDialogOpen, setClassDialogOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<KickboxingClass | null>(null);
  const [classSaving, setClassSaving] = useState(false);
  const [classForm, setClassForm] = useState({
    trainerProfileId: '',
    name: '',
    dayOfWeek: 'MONDAY',
    startTime: '18:00',
    durationMin: 60,
    maxCapacity: 20,
  });

  // Enrollment dialog
  const [enrollDialogOpen, setEnrollDialogOpen] = useState(false);
  const [enrollSaving, setEnrollSaving] = useState(false);
  const [enrollForm, setEnrollForm] = useState({
    classId: '',
    clientType: 'EXTERNAL_ONLY' as 'GYM_MEMBER' | 'EXTERNAL_ONLY',
    clientProfileId: '',
    externalName: '',
    externalPhone: '',
  });

  // Clients for GYM_MEMBER enrollment
  const [clients, setClients] = useState<
    { id: string; user: { firstName: string; lastName: string } }[]
  >([]);

  const fetchClasses = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/kickboxing/classes');
      if (res.ok) {
        const { data } = await res.json();
        setClasses(data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchEnrollments = useCallback(async () => {
    const params = new URLSearchParams();
    if (classFilter) params.set('classId', classFilter);
    if (typeFilter) params.set('clientType', typeFilter);

    const res = await fetch(`/api/admin/kickboxing/enrollments?${params}`);
    if (res.ok) {
      const { data } = await res.json();
      setEnrollments(data);
    }
  }, [classFilter, typeFilter]);

  const fetchTrainers = useCallback(async () => {
    const [res1, res2] = await Promise.all([
      fetch('/api/admin/users?role=KICKBOXING_TRAINER&pageSize=100'),
      fetch('/api/admin/users?role=TRAINER&pageSize=100'),
    ]);
    const seen = new Set<string>();
    const merged: TrainerOption[] = [];
    for (const res of [res1, res2]) {
      if (!res.ok) continue;
      const { data } = await res.json();
      for (const u of data) {
        const id = u.trainerProfile?.id;
        if (id && !seen.has(id)) {
          seen.add(id);
          merged.push({
            id,
            userId: u.trainerProfile.userId,
            user: { firstName: u.firstName, lastName: u.lastName },
          });
        }
      }
    }
    setTrainers(merged);
  }, []);

  const fetchClients = useCallback(async () => {
    const res = await fetch('/api/admin/users?role=CLIENT&pageSize=200');
    if (res.ok) {
      const { data } = await res.json();
      setClients(
        data
          .filter((u: { clientProfile: { id: string } | null }) => u.clientProfile)
          .map((u: { clientProfile: { id: string }; firstName: string; lastName: string }) => ({
            id: u.clientProfile.id,
            user: { firstName: u.firstName, lastName: u.lastName },
          })),
      );
    }
  }, []);

  useEffect(() => {
    fetchClasses();
    fetchTrainers();
    fetchClients();
  }, [fetchClasses, fetchTrainers, fetchClients]);

  useEffect(() => {
    fetchEnrollments();
  }, [fetchEnrollments]);

  // ─── Class handlers ───────────────────────────────────────────────────────

  function openCreateClass() {
    setEditingClass(null);
    setClassForm({
      trainerProfileId: trainers[0]?.id ?? '',
      name: '',
      dayOfWeek: 'MONDAY',
      startTime: '18:00',
      durationMin: 60,
      maxCapacity: 20,
    });
    setClassDialogOpen(true);
  }

  function openEditClass(cls: KickboxingClass) {
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

  async function handleSaveClass() {
    if (!classForm.name.trim()) {
      toast.error('Class name is required');
      return;
    }
    setClassSaving(true);
    try {
      const url = editingClass
        ? `/api/admin/kickboxing/classes/${editingClass.id}`
        : '/api/admin/kickboxing/classes';
      const method = editingClass ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(classForm),
      });

      if (res.ok) {
        toast.success(editingClass ? 'Class updated' : 'Class created');
        setClassDialogOpen(false);
        fetchClasses();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to save class');
      }
    } finally {
      setClassSaving(false);
    }
  }

  async function toggleClassActive(cls: KickboxingClass) {
    const res = await fetch(`/api/admin/kickboxing/classes/${cls.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !cls.isActive }),
    });
    if (res.ok) {
      toast.success(cls.isActive ? 'Class deactivated' : 'Class activated');
      fetchClasses();
    }
  }

  // ─── Enrollment handlers ───────────────────────────────────────────────────

  function openEnrollDialog() {
    setEnrollForm({
      classId: classes.find((c) => c.isActive)?.id ?? '',
      clientType: 'EXTERNAL_ONLY',
      clientProfileId: '',
      externalName: '',
      externalPhone: '',
    });
    setEnrollDialogOpen(true);
  }

  async function handleEnroll() {
    setEnrollSaving(true);
    try {
      const payload: Record<string, string | undefined> = {
        classId: enrollForm.classId,
        clientType: enrollForm.clientType,
      };

      if (enrollForm.clientType === 'GYM_MEMBER') {
        payload.clientProfileId = enrollForm.clientProfileId;
      } else {
        payload.externalName = enrollForm.externalName;
        payload.externalPhone = enrollForm.externalPhone || undefined;
      }

      const res = await fetch('/api/admin/kickboxing/enrollments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        toast.success('Enrolled successfully');
        setEnrollDialogOpen(false);
        fetchEnrollments();
        fetchClasses();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to enroll');
      }
    } finally {
      setEnrollSaving(false);
    }
  }

  async function handleRemoveEnrollment(id: string) {
    const ok = await confirm({
      title: 'Remove Enrollment',
      description: 'Remove this enrollment from the class?',
      confirmText: 'Remove',
      variant: 'destructive',
    });
    if (!ok) return;
    const res = await fetch(`/api/admin/kickboxing/enrollments/${id}`, { method: 'DELETE' });
    if (res.ok) {
      toast.success('Enrollment removed');
      fetchEnrollments();
      fetchClasses();
    }
  }

  function formatDay(day: string) {
    return day.charAt(0) + day.slice(1).toLowerCase();
  }

  if (loading) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {ConfirmDialog}

      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-red-500/10">
          <Activity className="h-5 w-5 text-red-500" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Kickboxing</h1>
          <p className="text-sm text-muted-foreground">Manage classes and enrollments</p>
        </div>
      </div>

      <Tabs defaultValue="classes">
        <TabsList className="grid w-full grid-cols-2 md:w-80">
          <TabsTrigger value="classes">Classes</TabsTrigger>
          <TabsTrigger value="enrollments">Enrollments</TabsTrigger>
        </TabsList>

        {/* ─── Classes Tab ─────────────────────────────────────────────────── */}
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
              {classes.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">
                  No kickboxing classes yet. Add one to get started.
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
                            {formatDay(cls.dayOfWeek)}
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">{cls.startTime}</TableCell>
                          <TableCell className="hidden md:table-cell">{cls.durationMin}m</TableCell>
                          <TableCell>
                            {cls._count.enrollments}/{cls.maxCapacity}
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-sm">
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

        {/* ─── Enrollments Tab ─────────────────────────────────────────────── */}
        <TabsContent value="enrollments" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Enrollments</CardTitle>
              <Button
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white"
                onClick={openEnrollDialog}
              >
                <Plus className="h-4 w-4 mr-1" /> Enroll Member
              </Button>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3 mb-4">
                <Select
                  value={classFilter || 'all'}
                  onValueChange={(v) => setClassFilter(v === 'all' ? '' : (v ?? ''))}
                >
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="All classes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Classes</SelectItem>
                    {classes.map((cls) => (
                      <SelectItem key={cls.id} value={cls.id}>
                        {cls.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={typeFilter || 'all'}
                  onValueChange={(v) => setTypeFilter(v === 'all' ? '' : (v ?? ''))}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="GYM_MEMBER">Gym Member</SelectItem>
                    <SelectItem value="EXTERNAL_ONLY">External</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {enrollments.length === 0 ? (
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
                        <TableHead className="hidden md:table-cell">Contact</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {enrollments.map((en) => (
                        <TableRow key={en.id}>
                          <TableCell className="font-medium">
                            {en.clientType === 'GYM_MEMBER' && en.client
                              ? `${en.client.user.firstName} ${en.client.user.lastName}`
                              : (en.externalName ?? '—')}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="secondary"
                              className={
                                en.clientType === 'GYM_MEMBER'
                                  ? 'bg-blue-500/15 text-blue-600'
                                  : 'bg-zinc-500/15 text-zinc-500'
                              }
                            >
                              {en.clientType === 'GYM_MEMBER' ? 'Member' : 'External'}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                            {en.class.name}
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                            {en.clientType === 'GYM_MEMBER' && en.client
                              ? en.client.user.email
                              : (en.externalPhone ?? '—')}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => handleRemoveEnrollment(en.id)}
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

      {/* ─── Create/Edit Class Dialog ─────────────────────────────────────── */}
      <Dialog open={classDialogOpen} onOpenChange={setClassDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingClass ? 'Edit Class' : 'Add Kickboxing Class'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Class Name *</Label>
              <Input
                placeholder="e.g. Monday 6PM Kickboxing"
                value={classForm.name}
                onChange={(e) => setClassForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Trainer *</Label>
              <Select
                value={classForm.trainerProfileId}
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
                <Label>Day *</Label>
                <Select
                  value={classForm.dayOfWeek}
                  onValueChange={(v) => setClassForm((f) => ({ ...f, dayOfWeek: v ?? 'MONDAY' }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAYS.map((d) => (
                      <SelectItem key={d} value={d}>
                        {formatDay(d)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Start Time *</Label>
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
                onClick={handleSaveClass}
                disabled={classSaving || !classForm.name.trim() || !classForm.trainerProfileId}
              >
                {classSaving ? 'Saving…' : editingClass ? 'Save Changes' : 'Create Class'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Enroll Dialog ────────────────────────────────────────────────── */}
      <Dialog open={enrollDialogOpen} onOpenChange={setEnrollDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Enroll in Kickboxing Class</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Class *</Label>
              <Select
                value={enrollForm.classId}
                onValueChange={(v) => setEnrollForm((f) => ({ ...f, classId: v ?? '' }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select class" />
                </SelectTrigger>
                <SelectContent>
                  {classes
                    .filter((c) => c.isActive)
                    .map((cls) => (
                      <SelectItem key={cls.id} value={cls.id}>
                        {cls.name} — {formatDay(cls.dayOfWeek)} {cls.startTime}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Member Type *</Label>
              <Select
                value={enrollForm.clientType}
                onValueChange={(v) =>
                  setEnrollForm((f) => ({
                    ...f,
                    clientType: (v ?? 'EXTERNAL_ONLY') as 'GYM_MEMBER' | 'EXTERNAL_ONLY',
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
                  <SelectItem value="GYM_MEMBER">PT Client (has app account)</SelectItem>
                  <SelectItem value="EXTERNAL_ONLY">External (no app account)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {enrollForm.clientType === 'GYM_MEMBER' ? (
              <div className="space-y-1.5">
                <Label>Client *</Label>
                <Select
                  value={enrollForm.clientProfileId || null}
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
                  <Label>Full Name *</Label>
                  <Input
                    placeholder="Walk-in / external name"
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
                onClick={handleEnroll}
                disabled={
                  enrollSaving ||
                  !enrollForm.classId ||
                  (enrollForm.clientType === 'GYM_MEMBER' && !enrollForm.clientProfileId) ||
                  (enrollForm.clientType === 'EXTERNAL_ONLY' && !enrollForm.externalName)
                }
              >
                {enrollSaving ? 'Enrolling…' : 'Enroll'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
