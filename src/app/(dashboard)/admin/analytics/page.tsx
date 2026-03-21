'use client';

import { useCallback, useEffect, useState } from 'react';
import { BarChart3, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

interface TrainerUtilization {
  trainerName: string;
  totalSessions: number;
  completedSessions: number;
  utilizationPercent: number;
}

interface ClientAttendance {
  clientName: string;
  totalSessions: number;
  attended: number;
  noShow: number;
  cancelled: number;
  attendancePercent: number;
}

interface SessionConsumption {
  clientName: string;
  sessionsPerMonth: number;
  completed: number;
  noShow: number;
  scheduled: number;
  cancelled: number;
  carryForward: number;
  consumptionPercent: number;
}

interface NoShowRate {
  trainerName: string;
  totalSessions: number;
  noShowCount: number;
  noShowPercent: number;
}

interface RevenueOverview {
  totalRevenue: number;
  paidCount: number;
  pendingCount: number;
  pendingAmount: number;
  byMethod: { method: string; amount: number; count: number }[];
}

const PIE_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
];

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export default function AnalyticsPage() {
  const [month, setMonth] = useState(getCurrentMonth());
  const [loading, setLoading] = useState(true);

  const [utilization, setUtilization] = useState<TrainerUtilization[]>([]);
  const [attendance, setAttendance] = useState<ClientAttendance[]>([]);
  const [consumption, setConsumption] = useState<SessionConsumption[]>([]);
  const [noShow, setNoShow] = useState<NoShowRate[]>([]);
  const [revenue, setRevenue] = useState<RevenueOverview | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const base = `/api/admin/analytics?month=${month}`;
      const [u, a, c, n, r] = await Promise.all([
        fetch(`${base}&report=trainer-utilization`).then((r) => r.json()),
        fetch(`${base}&report=client-attendance`).then((r) => r.json()),
        fetch(`${base}&report=session-consumption`).then((r) => r.json()),
        fetch(`${base}&report=no-show-rate`).then((r) => r.json()),
        fetch(`${base}&report=revenue`).then((r) => r.json()),
      ]);
      setUtilization(u.data ?? []);
      setAttendance(a.data ?? []);
      setConsumption(c.data ?? []);
      setNoShow(n.data ?? []);
      setRevenue(r.data ?? null);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  function handleExport(report: string) {
    window.open(`/api/admin/analytics/export?report=${report}&month=${month}`, '_blank');
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-40 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Analytics</h1>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-sm">Month:</Label>
          <Input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="w-[160px]"
          />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">₹{revenue?.totalRevenue.toLocaleString() ?? 0}</p>
            <p className="text-xs text-muted-foreground">
              {revenue?.paidCount ?? 0} paid, {revenue?.pendingCount ?? 0} pending
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Avg Utilization</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {utilization.length > 0
                ? Math.round(
                    utilization.reduce((s, u) => s + u.utilizationPercent, 0) / utilization.length,
                  )
                : 0}
              %
            </p>
            <p className="text-xs text-muted-foreground">{utilization.length} trainers</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Avg Attendance</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {attendance.length > 0
                ? Math.round(
                    attendance.reduce((s, a) => s + a.attendancePercent, 0) / attendance.length,
                  )
                : 0}
              %
            </p>
            <p className="text-xs text-muted-foreground">{attendance.length} clients</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total No-Shows</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{noShow.reduce((s, n) => s + n.noShowCount, 0)}</p>
            <p className="text-xs text-muted-foreground">this month</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="utilization">
        <TabsList>
          <TabsTrigger value="utilization">Utilization</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="consumption">Consumption</TabsTrigger>
          <TabsTrigger value="noshow">No-Shows</TabsTrigger>
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
        </TabsList>

        {/* Trainer Utilization */}
        <TabsContent value="utilization" className="space-y-4">
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => handleExport('trainer-utilization')}>
              <Download className="mr-2 h-4 w-4" /> Export
            </Button>
          </div>
          {utilization.length > 0 ? (
            <Card>
              <CardContent className="pt-6">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={utilization}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="trainerName" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar
                      dataKey="completedSessions"
                      name="Completed"
                      fill="hsl(var(--primary))"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="totalSessions"
                      name="Total"
                      fill="hsl(var(--muted))"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          ) : (
            <div className="py-8 text-center text-muted-foreground">No data for this month</div>
          )}
        </TabsContent>

        {/* Client Attendance */}
        <TabsContent value="attendance" className="space-y-4">
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => handleExport('client-attendance')}>
              <Download className="mr-2 h-4 w-4" /> Export
            </Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Attended</TableHead>
                <TableHead>No-Show</TableHead>
                <TableHead>Cancelled</TableHead>
                <TableHead>Rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {attendance.map((a) => (
                <TableRow key={a.clientName}>
                  <TableCell className="font-medium">{a.clientName}</TableCell>
                  <TableCell>{a.totalSessions}</TableCell>
                  <TableCell>{a.attended}</TableCell>
                  <TableCell>
                    {a.noShow > 0 ? <Badge variant="destructive">{a.noShow}</Badge> : 0}
                  </TableCell>
                  <TableCell>{a.cancelled}</TableCell>
                  <TableCell>
                    <Badge variant={a.attendancePercent >= 80 ? 'default' : 'secondary'}>
                      {a.attendancePercent}%
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {attendance.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No data
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TabsContent>

        {/* Session Consumption */}
        <TabsContent value="consumption" className="space-y-4">
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => handleExport('session-consumption')}>
              <Download className="mr-2 h-4 w-4" /> Export
            </Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Completed</TableHead>
                <TableHead>No-Show</TableHead>
                <TableHead>Scheduled</TableHead>
                <TableHead>CF</TableHead>
                <TableHead>Used %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {consumption.map((c) => (
                <TableRow key={c.clientName}>
                  <TableCell className="font-medium">{c.clientName}</TableCell>
                  <TableCell>{c.sessionsPerMonth}</TableCell>
                  <TableCell>{c.completed}</TableCell>
                  <TableCell>{c.noShow}</TableCell>
                  <TableCell>{c.scheduled}</TableCell>
                  <TableCell>
                    {c.carryForward > 0 ? <Badge variant="outline">{c.carryForward}</Badge> : 0}
                  </TableCell>
                  <TableCell>
                    <Badge variant={c.consumptionPercent >= 80 ? 'default' : 'secondary'}>
                      {c.consumptionPercent}%
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {consumption.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    No data
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TabsContent>

        {/* No-Show Rate */}
        <TabsContent value="noshow" className="space-y-4">
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => handleExport('no-show-rate')}>
              <Download className="mr-2 h-4 w-4" /> Export
            </Button>
          </div>
          {noShow.length > 0 ? (
            <Card>
              <CardContent className="pt-6">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={noShow}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="trainerName" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar
                      dataKey="noShowCount"
                      name="No-Shows"
                      fill="hsl(var(--destructive))"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          ) : (
            <div className="py-8 text-center text-muted-foreground">No data for this month</div>
          )}
        </TabsContent>

        {/* Revenue */}
        <TabsContent value="revenue" className="space-y-4">
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => handleExport('revenue')}>
              <Download className="mr-2 h-4 w-4" /> Export
            </Button>
          </div>
          {revenue && revenue.byMethod.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Revenue by Payment Method</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie
                        data={revenue.byMethod}
                        dataKey="amount"
                        nameKey="method"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        label={({ name, value }) => `${name}: ₹${value}`}
                      >
                        {revenue.byMethod.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Revenue</span>
                    <span className="font-bold">₹{revenue.totalRevenue.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Paid Payments</span>
                    <span>{revenue.paidCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Pending Amount</span>
                    <span className="text-destructive font-medium">
                      ₹{revenue.pendingAmount.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Pending Payments</span>
                    <span>{revenue.pendingCount}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">
              No payment data for this month
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
