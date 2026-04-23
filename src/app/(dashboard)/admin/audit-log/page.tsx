'use client';

import { useCallback, useEffect, useState } from 'react';
import { FileText, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DatePickerModal } from '@/components/ui/date-picker-modal';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface AuditLogEntry {
  id: string;
  action: string;
  subjectType: string;
  subjectId: string;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actor: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: string;
  };
}

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

const ACTION_COLORS: Record<string, string> = {
  CREATED: 'bg-green-500/10 text-green-600 dark:text-green-400',
  UPDATED: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  DELETED: 'bg-red-500/10 text-red-600 dark:text-red-400',
  STATUS_CHANGE: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
};

function getActionColor(action: string): string {
  for (const [key, color] of Object.entries(ACTION_COLORS)) {
    if (action.includes(key)) return color;
  }
  return 'bg-muted text-muted-foreground';
}

export default function AdminAuditLogPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    action: '',
    subjectType: '',
    dateFrom: '',
    dateTo: '',
  });
  const [filterOptions, setFilterOptions] = useState<{ actions: string[]; subjectTypes: string[] }>(
    {
      actions: [],
      subjectTypes: [],
    },
  );
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);

  const fetchFilters = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/audit-logs/filters');
      if (res.ok) {
        const { data } = await res.json();
        setFilterOptions(data);
      }
    } catch {
      // ignore
    }
  }, []);

  const fetchLogs = useCallback(
    async (page = 1) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ page: String(page), pageSize: '20' });
        if (filters.action) params.set('action', filters.action);
        if (filters.subjectType) params.set('subjectType', filters.subjectType);
        if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
        if (filters.dateTo) params.set('dateTo', filters.dateTo);

        const res = await fetch(`/api/admin/audit-logs?${params}`);
        if (res.ok) {
          const json = await res.json();
          setLogs(json.data);
          setPagination(json.pagination);
        }
      } finally {
        setLoading(false);
      }
    },
    [filters],
  );

  useEffect(() => {
    fetchFilters();
  }, [fetchFilters]);

  useEffect(() => {
    fetchLogs(1);
  }, [fetchLogs]);

  const handleSearch = () => fetchLogs(1);
  const handleClear = () => {
    setFilters({ action: '', subjectType: '', dateFrom: '', dateTo: '' });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <FileText className="h-6 w-6" />
        <h1 className="text-2xl font-bold">Audit Log</h1>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Select
              value={filters.action || undefined}
              onValueChange={(v) =>
                setFilters({ ...filters, action: (v ?? '') === '__all__' ? '' : (v ?? '') })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Actions</SelectItem>
                {filterOptions.actions.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={filters.subjectType || undefined}
              onValueChange={(v) =>
                setFilters({ ...filters, subjectType: (v ?? '') === '__all__' ? '' : (v ?? '') })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Subject Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Types</SelectItem>
                {filterOptions.subjectTypes.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <DatePickerModal
              value={filters.dateFrom}
              onChange={(v) => setFilters({ ...filters, dateFrom: v })}
              placeholder="From"
            />

            <DatePickerModal
              value={filters.dateTo}
              onChange={(v) => setFilters({ ...filters, dateTo: v })}
              placeholder="To"
              minDate={filters.dateFrom}
            />

            <div className="flex gap-2">
              <Button
                onClick={handleSearch}
                size="sm"
                className="flex-1 bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
              >
                <Search className="mr-1 h-4 w-4" />
                Search
              </Button>
              <Button onClick={handleClear} variant="outline" size="sm">
                Clear
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : logs.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              No audit log entries found.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead className="text-right">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {new Date(log.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={getActionColor(log.action)}>
                        {log.action}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm font-medium">{log.subjectType}</span>
                      <span className="ml-1 text-xs text-muted-foreground">
                        {log.subjectId.slice(0, 8)}…
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {log.actor.firstName} {log.actor.lastName}
                      </div>
                      <div className="text-xs text-muted-foreground">{log.actor.role}</div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => setSelectedLog(log)}>
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(pagination.page - 1) * pagination.pageSize + 1}–
            {Math.min(pagination.page * pagination.pageSize, pagination.total)} of{' '}
            {pagination.total}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page <= 1}
              onClick={() => fetchLogs(pagination.page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => fetchLogs(pagination.page + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Audit Log Detail</DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="font-medium text-muted-foreground">Action</p>
                  <Badge variant="secondary" className={getActionColor(selectedLog.action)}>
                    {selectedLog.action}
                  </Badge>
                </div>
                <div>
                  <p className="font-medium text-muted-foreground">Timestamp</p>
                  <p>{new Date(selectedLog.createdAt).toLocaleString()}</p>
                </div>
                <div>
                  <p className="font-medium text-muted-foreground">Actor</p>
                  <p>
                    {selectedLog.actor.firstName} {selectedLog.actor.lastName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {selectedLog.actor.email} ({selectedLog.actor.role})
                  </p>
                </div>
                <div>
                  <p className="font-medium text-muted-foreground">Subject</p>
                  <p>{selectedLog.subjectType}</p>
                  <p className="text-xs text-muted-foreground font-mono">{selectedLog.subjectId}</p>
                </div>
              </div>

              {selectedLog.oldValue && (
                <div>
                  <p className="mb-1 text-sm font-medium text-muted-foreground">Old Value</p>
                  <pre className="rounded-md bg-muted p-3 text-xs overflow-x-auto">
                    {JSON.stringify(selectedLog.oldValue, null, 2)}
                  </pre>
                </div>
              )}

              {selectedLog.newValue && (
                <div>
                  <p className="mb-1 text-sm font-medium text-muted-foreground">New Value</p>
                  <pre className="rounded-md bg-muted p-3 text-xs overflow-x-auto">
                    {JSON.stringify(selectedLog.newValue, null, 2)}
                  </pre>
                </div>
              )}

              {selectedLog.metadata && (
                <div>
                  <p className="mb-1 text-sm font-medium text-muted-foreground">Metadata</p>
                  <pre className="rounded-md bg-muted p-3 text-xs overflow-x-auto">
                    {JSON.stringify(selectedLog.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
