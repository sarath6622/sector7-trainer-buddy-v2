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
  class: { dayOfWeek: string; startTime: string; durationMin: number };
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
    const res = await fetch('/api/admin/users?role=KICKBOXING_TRAINER&pageSize=100');
    if (res.ok) {
      const { data } = await res.json();
      setTrainers(
        data
          .map((u: { trainerProfile: TrainerOption; firstName: string; lastName: string }) => ({
            id: u.trainerProfile?.id,
            userId: u.trainerProfile?.userId,
            user: { firstName: u.firstName, lastName: u.lastName },
          }))
          .filter((t: TrainerOption) => t.id),
      );
    }
    // Also fetch regular trainers as fallback
    const res2 = await fetch('/api/admin/users?role=TRAINER&pageSize=100');
    if (res2.ok) {
      const { data } = await res2.json();
      setTrainers((prev) => {
        const existingIds = new Set(prev.map((t) => t.id));
        const additional = data
          .map((u: { trainerProfile: TrainerOption; firstName: string; lastName: string }) => ({
            id: u.trainerProfile?.id,
            userId: u.trainerProfile?.userId,
            user: { firstName: u.firstName, lastName: u.lastName },
          }))
          .filter((t: TrainerOption) => t.id && !existingIds.has(t.id));
        return [...prev, ...additional];
      });
    }
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

  // ─── Class handlers ───────────────────────────────

  function openCreateClass() {
    setEditingClass(null);
    setClassForm({
      trainerProfileId: trainers[0]?.id ?? '',
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
      dayOfWeek: cls.dayOfWeek,
      startTime: cls.startTime,
      durationMin: cls.durationMin,
      maxCapacity: cls.maxCapacity,
    });
    setClassDialogOpen(true);
  }

  async function handleSaveClass() {
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
    if (res.ok) fetchClasses();
  }

  // ─── Enrollment handlers ──────────────────────────

  function openEnrollDialog() {
    setEnrollForm({
      classId: classes[0]?.id ?? '',
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
        setEnrollDialogOpen(false);
        fetchEnrollments();
        fetchClasses(); // refresh counts
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
      description: 'Remove this enrollment?',
      confirmText: 'Remove',
      variant: 'destructive',
    });
    if (!ok) return;
    const res = await fetch(`/api/admin/kickboxing/enrollments/${id}`, { method: 'DELETE' });
    if (res.ok) {
      fetchEnrollments();
      fetchClasses();
    }
  }

  function formatDay(day: string) {
    return day.charAt(0) + day.slice(1).toLowerCase();
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Activity className="h-6 w-6" />
        <h1 className="text-2xl font-bold">Kickboxing</h1>
      </div>

      <Tabs defaultValue="classes">
        <TabsList>
          <TabsTrigger value="classes">Classes</TabsTrigger>
          <TabsTrigger value="enrollments">Enrollments</TabsTrigger>
        </TabsList>

        {/* ─── Classes Tab ─────────────────────────── */}
        <TabsContent value="classes" className="space-y-4">
          <div className="flex justify-end">
            <Button
              onClick={openCreateClass}
              className="bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700"
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Class
            </Button>
          </div>

          {classes.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No kickboxing classes yet. Add one to get started.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {classes.map((cls) => (
                <Card key={cls.id} className={!cls.isActive ? 'opacity-60' : ''}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">
                        {formatDay(cls.dayOfWeek)} — {cls.startTime}
                      </CardTitle>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => openEditClass(cls)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {cls.trainer.user.firstName} {cls.trainer.user.lastName}
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-1">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <span>
                          {cls._count.enrollments} / {cls.maxCapacity}
                        </span>
                      </div>
                      <span className="text-muted-foreground">{cls.durationMin} min</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <Badge variant={cls.isActive ? 'default' : 'secondary'}>
                        {cls.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs"
                        onClick={() => toggleClassActive(cls)}
                      >
                        {cls.isActive ? 'Deactivate' : 'Activate'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ─── Enrollments Tab ─────────────────────── */}
        <TabsContent value="enrollments" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-3">
              <Select
                value={classFilter}
                onValueChange={(v) => setClassFilter(v === 'all' ? '' : (v ?? ''))}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Filter by class" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Classes</SelectItem>
                  {classes.map((cls) => (
                    <SelectItem key={cls.id} value={cls.id}>
                      {formatDay(cls.dayOfWeek)} {cls.startTime}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={typeFilter}
                onValueChange={(v) => setTypeFilter(v === 'all' ? '' : (v ?? ''))}
              >
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Client type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="GYM_MEMBER">Gym Member</SelectItem>
                  <SelectItem value="EXTERNAL_ONLY">External</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={openEnrollDialog}>
              <Plus className="mr-2 h-4 w-4" />
              Enroll
            </Button>
          </div>

          {enrollments.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">No enrollments found.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead className="w-[80px]">Actions</TableHead>
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
                      <Badge variant={en.clientType === 'GYM_MEMBER' ? 'default' : 'secondary'}>
                        {en.clientType === 'GYM_MEMBER' ? 'Member' : 'External'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {formatDay(en.class.dayOfWeek)} {en.class.startTime}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {en.clientType === 'GYM_MEMBER' && en.client
                        ? en.client.user.email
                        : (en.externalPhone ?? '—')}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleRemoveEnrollment(en.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>
      </Tabs>

      {/* ─── Create/Edit Class Dialog ────────────── */}
      <Dialog open={classDialogOpen} onOpenChange={setClassDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingClass ? 'Edit Class' : 'Add Kickboxing Class'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Trainer *</Label>
              <Select
                value={classForm.trainerProfileId}
                onValueChange={(v) => setClassForm({ ...classForm, trainerProfileId: v ?? '' })}
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
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Day *</Label>
                <Select
                  value={classForm.dayOfWeek}
                  onValueChange={(v) => setClassForm({ ...classForm, dayOfWeek: v ?? 'MONDAY' })}
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
              <div>
                <Label>Start Time *</Label>
                <Input
                  type="time"
                  value={classForm.startTime}
                  onChange={(e) => setClassForm({ ...classForm, startTime: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Duration (min)</Label>
                <Input
                  type="number"
                  value={classForm.durationMin}
                  onChange={(e) =>
                    setClassForm({ ...classForm, durationMin: Number(e.target.value) })
                  }
                />
              </div>
              <div>
                <Label>Max Capacity</Label>
                <Input
                  type="number"
                  value={classForm.maxCapacity}
                  onChange={(e) =>
                    setClassForm({ ...classForm, maxCapacity: Number(e.target.value) })
                  }
                />
              </div>
            </div>
            <Button
              className="w-full"
              onClick={handleSaveClass}
              disabled={classSaving || !classForm.trainerProfileId}
            >
              {classSaving ? 'Saving...' : editingClass ? 'Update Class' : 'Create Class'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Enroll Dialog ───────────────────────── */}
      <Dialog open={enrollDialogOpen} onOpenChange={setEnrollDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Enroll in Kickboxing Class</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Class *</Label>
              <Select
                value={enrollForm.classId}
                onValueChange={(v) => setEnrollForm({ ...enrollForm, classId: v ?? '' })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select class" />
                </SelectTrigger>
                <SelectContent>
                  {classes
                    .filter((c) => c.isActive)
                    .map((cls) => (
                      <SelectItem key={cls.id} value={cls.id}>
                        {formatDay(cls.dayOfWeek)} {cls.startTime} — {cls.trainer.user.firstName}{' '}
                        {cls.trainer.user.lastName}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Client Type *</Label>
              <Select
                value={enrollForm.clientType}
                onValueChange={(v) =>
                  setEnrollForm({
                    ...enrollForm,
                    clientType: (v ?? 'EXTERNAL_ONLY') as 'GYM_MEMBER' | 'EXTERNAL_ONLY',
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GYM_MEMBER">Gym Member</SelectItem>
                  <SelectItem value="EXTERNAL_ONLY">External (No Account)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {enrollForm.clientType === 'GYM_MEMBER' ? (
              <div>
                <Label>Client *</Label>
                <Select
                  value={enrollForm.clientProfileId}
                  onValueChange={(v) => setEnrollForm({ ...enrollForm, clientProfileId: v ?? '' })}
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
                <div>
                  <Label>Name *</Label>
                  <Input
                    value={enrollForm.externalName}
                    onChange={(e) => setEnrollForm({ ...enrollForm, externalName: e.target.value })}
                    placeholder="Full name"
                  />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input
                    value={enrollForm.externalPhone}
                    onChange={(e) =>
                      setEnrollForm({ ...enrollForm, externalPhone: e.target.value })
                    }
                    placeholder="Phone number"
                  />
                </div>
              </>
            )}

            <Button
              className="w-full"
              onClick={handleEnroll}
              disabled={
                enrollSaving ||
                !enrollForm.classId ||
                (enrollForm.clientType === 'GYM_MEMBER' && !enrollForm.clientProfileId) ||
                (enrollForm.clientType === 'EXTERNAL_ONLY' && !enrollForm.externalName)
              }
            >
              {enrollSaving ? 'Enrolling...' : 'Enroll'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {ConfirmDialog}
    </div>
  );
}
