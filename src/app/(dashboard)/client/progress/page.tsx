'use client';

import { useState, useEffect, useCallback } from 'react';
import { TrendingUp, Scale, Percent, Ruler } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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

export default function ClientProgressPage() {
  const [entries, setEntries] = useState<ProgressEntry[]>([]);
  const [weightChart, setWeightChart] = useState<ChartPoint[]>([]);
  const [bodyFatChart, setBodyFatChart] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [entriesRes, weightRes, bodyFatRes] = await Promise.all([
        fetch('/api/client/progress'),
        fetch('/api/client/progress/charts?metric=weight'),
        fetch('/api/client/progress/charts?metric=bodyFat'),
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
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function formatDate(dateStr: string) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  // Compute latest vs previous for summary cards
  const latest = entries[0];
  const previous = entries[1];

  function getDelta(current: number | null | undefined, prev: number | null | undefined) {
    if (current == null || prev == null) return null;
    return current - prev;
  }

  function formatDelta(delta: number | null, unit: string, invertColor = false) {
    if (delta == null) return null;
    const sign = delta > 0 ? '+' : '';
    const color = invertColor
      ? delta < 0
        ? 'text-green-500'
        : delta > 0
          ? 'text-red-500'
          : 'text-muted-foreground'
      : delta > 0
        ? 'text-green-500'
        : delta < 0
          ? 'text-red-500'
          : 'text-muted-foreground';
    return (
      <span className={`text-xs ${color}`}>
        {sign}
        {delta.toFixed(1)} {unit}
      </span>
    );
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
      <div className="flex items-center gap-2">
        <TrendingUp className="h-6 w-6" />
        <h1 className="text-2xl font-bold">My Progress</h1>
        <Badge variant="secondary" className="ml-2">
          {entries.length} entries
        </Badge>
      </div>

      {/* Summary Cards */}
      {latest && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-1">
                <Scale className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Weight</p>
              </div>
              <p className="text-2xl font-bold">
                {latest.weightKg != null ? `${latest.weightKg} kg` : '—'}
              </p>
              {formatDelta(getDelta(latest.weightKg, previous?.weightKg), 'kg')}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-1">
                <Percent className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Body Fat</p>
              </div>
              <p className="text-2xl font-bold">
                {latest.bodyFatPercent != null ? `${latest.bodyFatPercent}%` : '—'}
              </p>
              {formatDelta(getDelta(latest.bodyFatPercent, previous?.bodyFatPercent), '%', true)}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Muscle Mass</p>
              </div>
              <p className="text-2xl font-bold">
                {latest.muscleMass != null ? `${latest.muscleMass} kg` : '—'}
              </p>
              {formatDelta(getDelta(latest.muscleMass, previous?.muscleMass), 'kg')}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-1">
                <Ruler className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Waist</p>
              </div>
              <p className="text-2xl font-bold">
                {latest.waist != null ? `${latest.waist} cm` : '—'}
              </p>
              {formatDelta(getDelta(latest.waist, previous?.waist), 'cm', true)}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs: Charts / History */}
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
                    <CardTitle className="text-sm">{formatDate(entry.recordedAt)}</CardTitle>
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
    </div>
  );
}
