'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { TrendingUp, Plus, ArrowLeft, Pencil } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import ProgressLineChart from '@/components/charts/ProgressLineChart';

interface ProgressEntry {
  id: string;
  recordedAt: string;
  weightKg: number | null;
  bodyFatPercent: number | null;
  muscleMass: number | null;
  chest: number | null;
  waist: number | null;
  hips: number | null;
  bicepLeft: number | null;
  bicepRight: number | null;
  thighLeft: number | null;
  thighRight: number | null;
  photoUrls: string[];
  notes: string | null;
}

interface ChartPoint {
  date: string;
  value: number | null;
  label: string;
}

interface FormData {
  weightKg: string;
  bodyFatPercent: string;
  muscleMass: string;
  chest: string;
  waist: string;
  hips: string;
  bicepLeft: string;
  bicepRight: string;
  thighLeft: string;
  thighRight: string;
  notes: string;
}

const emptyForm: FormData = {
  weightKg: '',
  bodyFatPercent: '',
  muscleMass: '',
  chest: '',
  waist: '',
  hips: '',
  bicepLeft: '',
  bicepRight: '',
  thighLeft: '',
  thighRight: '',
  notes: '',
};

function entryToForm(entry: ProgressEntry): FormData {
  return {
    weightKg: entry.weightKg?.toString() ?? '',
    bodyFatPercent: entry.bodyFatPercent?.toString() ?? '',
    muscleMass: entry.muscleMass?.toString() ?? '',
    chest: entry.chest?.toString() ?? '',
    waist: entry.waist?.toString() ?? '',
    hips: entry.hips?.toString() ?? '',
    bicepLeft: entry.bicepLeft?.toString() ?? '',
    bicepRight: entry.bicepRight?.toString() ?? '',
    thighLeft: entry.thighLeft?.toString() ?? '',
    thighRight: entry.thighRight?.toString() ?? '',
    notes: entry.notes ?? '',
  };
}

function formToPayload(form: FormData) {
  const payload: Record<string, number | string | undefined> = {};
  if (form.weightKg) payload.weightKg = parseFloat(form.weightKg);
  if (form.bodyFatPercent) payload.bodyFatPercent = parseFloat(form.bodyFatPercent);
  if (form.muscleMass) payload.muscleMass = parseFloat(form.muscleMass);
  if (form.chest) payload.chest = parseFloat(form.chest);
  if (form.waist) payload.waist = parseFloat(form.waist);
  if (form.hips) payload.hips = parseFloat(form.hips);
  if (form.bicepLeft) payload.bicepLeft = parseFloat(form.bicepLeft);
  if (form.bicepRight) payload.bicepRight = parseFloat(form.bicepRight);
  if (form.thighLeft) payload.thighLeft = parseFloat(form.thighLeft);
  if (form.thighRight) payload.thighRight = parseFloat(form.thighRight);
  if (form.notes) payload.notes = form.notes;
  return payload;
}

export default function TrainerClientProgressPage() {
  const { id: clientProfileId } = useParams<{ id: string }>();
  const router = useRouter();
  const [entries, setEntries] = useState<ProgressEntry[]>([]);
  const [weightChart, setWeightChart] = useState<ChartPoint[]>([]);
  const [bodyFatChart, setBodyFatChart] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<ProgressEntry | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [entriesRes, weightRes, bodyFatRes] = await Promise.all([
        fetch(`/api/trainer/clients/${clientProfileId}/progress`),
        fetch(`/api/client/progress/charts?metric=weight`),
        fetch(`/api/client/progress/charts?metric=bodyFat`),
      ]);

      if (entriesRes.ok) {
        const { data } = await entriesRes.json();
        setEntries(data);
      }
      if (weightRes.ok) {
        const { data } = await weightRes.json();
        setWeightChart(data);
      }
      if (bodyFatRes.ok) {
        const { data } = await bodyFatRes.json();
        setBodyFatChart(data);
      }
    } finally {
      setLoading(false);
    }
  }, [clientProfileId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function openCreate() {
    setEditingEntry(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(entry: ProgressEntry) {
    setEditingEntry(entry);
    setForm(entryToForm(entry));
    setDialogOpen(true);
  }

  function updateField(field: keyof FormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit() {
    setSaving(true);
    try {
      const payload = formToPayload(form);

      if (editingEntry) {
        // Update
        const res = await fetch(`/api/trainer/progress/${editingEntry.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          setDialogOpen(false);
          fetchData();
        }
      } else {
        // Create
        const res = await fetch(`/api/trainer/clients/${clientProfileId}/progress`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          setDialogOpen(false);
          fetchData();
        }
      }
    } finally {
      setSaving(false);
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
          <Button variant="ghost" size="icon" onClick={() => router.push('/trainer/clients')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <TrendingUp className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Client Progress</h1>
          <Badge variant="secondary">{entries.length} entries</Badge>
        </div>
        <Button onClick={openCreate} size="sm">
          <Plus className="h-4 w-4 mr-1" />
          Record Progress
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Charts</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Weight Trend</CardTitle>
              </CardHeader>
              <CardContent>
                <ProgressLineChart data={weightChart} yAxisLabel="kg" color="hsl(var(--primary))" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Body Fat % Trend</CardTitle>
              </CardHeader>
              <CardContent>
                <ProgressLineChart
                  data={bodyFatChart}
                  yAxisLabel="%"
                  color="hsl(var(--destructive))"
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          {entries.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-muted-foreground">No progress entries recorded yet.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {entries.map((entry) => (
                <Card key={entry.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm">{formatDate(entry.recordedAt)}</CardTitle>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(entry)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                      {entry.weightKg != null && (
                        <div>
                          <p className="text-muted-foreground text-xs">Weight</p>
                          <p className="font-medium">{entry.weightKg} kg</p>
                        </div>
                      )}
                      {entry.bodyFatPercent != null && (
                        <div>
                          <p className="text-muted-foreground text-xs">Body Fat</p>
                          <p className="font-medium">{entry.bodyFatPercent}%</p>
                        </div>
                      )}
                      {entry.muscleMass != null && (
                        <div>
                          <p className="text-muted-foreground text-xs">Muscle Mass</p>
                          <p className="font-medium">{entry.muscleMass} kg</p>
                        </div>
                      )}
                      {entry.chest != null && (
                        <div>
                          <p className="text-muted-foreground text-xs">Chest</p>
                          <p className="font-medium">{entry.chest} cm</p>
                        </div>
                      )}
                      {entry.waist != null && (
                        <div>
                          <p className="text-muted-foreground text-xs">Waist</p>
                          <p className="font-medium">{entry.waist} cm</p>
                        </div>
                      )}
                      {entry.hips != null && (
                        <div>
                          <p className="text-muted-foreground text-xs">Hips</p>
                          <p className="font-medium">{entry.hips} cm</p>
                        </div>
                      )}
                      {entry.bicepLeft != null && (
                        <div>
                          <p className="text-muted-foreground text-xs">Bicep (L)</p>
                          <p className="font-medium">{entry.bicepLeft} cm</p>
                        </div>
                      )}
                      {entry.bicepRight != null && (
                        <div>
                          <p className="text-muted-foreground text-xs">Bicep (R)</p>
                          <p className="font-medium">{entry.bicepRight} cm</p>
                        </div>
                      )}
                      {entry.thighLeft != null && (
                        <div>
                          <p className="text-muted-foreground text-xs">Thigh (L)</p>
                          <p className="font-medium">{entry.thighLeft} cm</p>
                        </div>
                      )}
                      {entry.thighRight != null && (
                        <div>
                          <p className="text-muted-foreground text-xs">Thigh (R)</p>
                          <p className="font-medium">{entry.thighRight} cm</p>
                        </div>
                      )}
                    </div>
                    {entry.notes && (
                      <p className="mt-2 text-xs text-muted-foreground">{entry.notes}</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingEntry ? 'Edit Progress Entry' : 'Record Progress'}</DialogTitle>
            <DialogDescription>
              {editingEntry
                ? 'Update the measurements below.'
                : "Enter the client's latest measurements."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="weightKg">Weight (kg)</Label>
              <Input
                id="weightKg"
                type="number"
                step="0.1"
                value={form.weightKg}
                onChange={(e) => updateField('weightKg', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bodyFatPercent">Body Fat (%)</Label>
              <Input
                id="bodyFatPercent"
                type="number"
                step="0.1"
                value={form.bodyFatPercent}
                onChange={(e) => updateField('bodyFatPercent', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="muscleMass">Muscle Mass (kg)</Label>
              <Input
                id="muscleMass"
                type="number"
                step="0.1"
                value={form.muscleMass}
                onChange={(e) => updateField('muscleMass', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="chest">Chest (cm)</Label>
              <Input
                id="chest"
                type="number"
                step="0.1"
                value={form.chest}
                onChange={(e) => updateField('chest', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="waist">Waist (cm)</Label>
              <Input
                id="waist"
                type="number"
                step="0.1"
                value={form.waist}
                onChange={(e) => updateField('waist', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hips">Hips (cm)</Label>
              <Input
                id="hips"
                type="number"
                step="0.1"
                value={form.hips}
                onChange={(e) => updateField('hips', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bicepLeft">Bicep Left (cm)</Label>
              <Input
                id="bicepLeft"
                type="number"
                step="0.1"
                value={form.bicepLeft}
                onChange={(e) => updateField('bicepLeft', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bicepRight">Bicep Right (cm)</Label>
              <Input
                id="bicepRight"
                type="number"
                step="0.1"
                value={form.bicepRight}
                onChange={(e) => updateField('bicepRight', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="thighLeft">Thigh Left (cm)</Label>
              <Input
                id="thighLeft"
                type="number"
                step="0.1"
                value={form.thighLeft}
                onChange={(e) => updateField('thighLeft', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="thighRight">Thigh Right (cm)</Label>
              <Input
                id="thighRight"
                type="number"
                step="0.1"
                value={form.thighRight}
                onChange={(e) => updateField('thighRight', e.target.value)}
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Input
                id="notes"
                value={form.notes}
                onChange={(e) => updateField('notes', e.target.value)}
                placeholder="Optional notes..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving ? 'Saving...' : editingEntry ? 'Update' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
