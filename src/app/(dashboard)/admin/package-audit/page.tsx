'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Download, Loader2, Search, UserCheck, Users, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { SearchSelect } from '@/components/ui/search-select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

/** One package in a client's history — mirrors PackageHistoryEntry. */
interface HistoryEntry {
  id: string;
  isActive: boolean;
  planName: string | null;
  trainerName: string | null;
  sessionsPerMonth: number;
  totalSessions: number;
  onboardingUsed: number;
  startDate: string;
  endDate: string | null;
  windowStart: string;
  windowEnd: string;
  state: string;
  used: number;
  upcoming: number;
  remaining: number;
  sessionRows: number;
  windowInvalid: boolean;
}

/** One client's reconciliation row — mirrors PackageAuditRow. */
interface AuditRow {
  clientProfileId: string;
  clientName: string;
  email: string;
  isActive: boolean;
  trainerName: string | null;

  hasActivePackage: boolean;
  planName: string | null;
  sessionsPerMonth: number;
  durationDays: number;
  packageStart: string | null;
  hardEndDate: string | null;
  state: string | null;
  cycleLabel: string | null;
  currentPaid: number;
  currentUsed: number;
  currentUpcoming: number;
  currentRemaining: number;
  onboardingUsed: number;

  packageCount: number;
  lifetimePaid: number;
  lifetimeUsed: number;
  lifetimeSessionRows: number;
  lifetimeOnboarding: number;
  lastSessionDate: string | null;

  packages: HistoryEntry[];
  unattributedUsed: number;
  packagesOverlap: boolean;
  currentCountDiffers: boolean;
}

interface AuditSummary {
  clients: number;
  withActivePackage: number;
  byState: Record<string, number>;
  lifetimePaid: number;
  lifetimeUsed: number;
  overConsumed: number;
}

const STATE_TONE: Record<string, string> = {
  ACTIVE: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20',
  GRACE: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-amber-500/20',
  EXHAUSTED: 'bg-red-500/10 text-red-600 dark:text-red-400 ring-red-500/20',
  CLOSED: 'bg-zinc-500/10 text-zinc-500 ring-zinc-500/20',
  NO_PACKAGE: 'bg-zinc-500/10 text-zinc-500 ring-zinc-500/20',
};

const STATE_HELP: Record<string, string> = {
  ACTIVE: 'Inside the paid window with sessions left.',
  GRACE: 'The month has elapsed but sessions are still owed — still counting.',
  EXHAUSTED: 'Every paid session has been used.',
  CLOSED: 'An admin set a hard end date and it has passed.',
  NO_PACKAGE: 'No package has ever been assigned.',
};

type SortKey =
  | 'clientName'
  | 'planName'
  | 'currentPaid'
  | 'currentUsed'
  | 'currentRemaining'
  | 'lifetimePaid'
  | 'lifetimeUsed'
  | 'lastSessionDate';

const ALL = '__all__';

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** "14 Aug 2026 – 13 Sep 2026" */
function fmtRange(a: string, b: string): string {
  return `${fmtDate(a)} – ${fmtDate(b)}`;
}

export default function PackageAuditPage() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [summary, setSummary] = useState<AuditSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState<string | null>(null);
  const [trainerFilter, setTrainerFilter] = useState<string>(ALL);
  const [clientFilter, setClientFilter] = useState<string>(ALL);

  const [sortKey, setSortKey] = useState<SortKey>('clientName');
  const [sortAsc, setSortAsc] = useState(true);
  const [selected, setSelected] = useState<AuditRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/package-audit');
      if (!res.ok) {
        setError('Could not load the audit. Try again.');
        return;
      }
      const json = await res.json();
      setRows(json.data ?? []);
      setSummary(json.summary ?? null);
    } catch {
      setError('Could not load the audit. Try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Trainer options come from the current package's trainer, matching the column.
  const trainerOptions = useMemo(() => {
    const names = new Set<string>();
    for (const r of rows) if (r.trainerName) names.add(r.trainerName);
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  // Client options cascade from the trainer filter, so picking a trainer first
  // turns a 229-name list into just their roster.
  const clientOptions = useMemo(() => {
    return rows
      .filter((r) => trainerFilter === ALL || r.trainerName === trainerFilter)
      .map((r) => ({
        id: r.clientProfileId,
        name: r.clientName,
        // Searchable second line, so typing a trainer's name inside the client
        // picker narrows to their roster without touching the trainer filter.
        hint: r.trainerName ?? 'No trainer',
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows, trainerFilter]);

  // If the chosen client is not in the trainer's roster any more, release it.
  useEffect(() => {
    if (clientFilter === ALL) return;
    if (!clientOptions.some((c) => c.id === clientFilter)) setClientFilter(ALL);
  }, [clientOptions, clientFilter]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const terms = q ? q.split(/\s+/) : [];

    const filtered = rows.filter((r) => {
      if (clientFilter !== ALL && r.clientProfileId !== clientFilter) return false;
      if (trainerFilter !== ALL && r.trainerName !== trainerFilter) return false;
      if (stateFilter && (r.state ?? 'NO_PACKAGE') !== stateFilter) return false;
      if (terms.length === 0) return true;
      const haystack =
        `${r.clientName} ${r.email} ${r.trainerName ?? ''} ${r.planName ?? 'custom'}`.toLowerCase();
      return terms.every((t) => haystack.includes(t));
    });

    const dir = sortAsc ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av === null) return 1;
      if (bv === null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [rows, search, stateFilter, trainerFilter, clientFilter, sortKey, sortAsc]);

  const hasFilters =
    search !== '' || stateFilter !== null || trainerFilter !== ALL || clientFilter !== ALL;

  function resetFilters() {
    setSearch('');
    setStateFilter(null);
    setTrainerFilter(ALL);
    setClientFilter(ALL);
  }

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(key === 'clientName' || key === 'planName');
    }
  }

  function exportCsv() {
    const header = [
      'Client',
      'Email',
      'Trainer',
      'Plan',
      'Sessions/month',
      'Cycle',
      'State',
      'Paid (current)',
      'Used (current)',
      'Upcoming',
      'Remaining',
      'Onboarding offset',
      'Packages',
      'Lifetime paid',
      'Lifetime used',
      'Real sessions',
      'Lifetime onboarding',
      'Last session',
    ];
    const esc = (v: string | number | null) => {
      const s = v === null ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = visible.map((r) =>
      [
        r.clientName,
        r.email,
        r.trainerName ?? '',
        r.planName ?? 'Custom',
        r.sessionsPerMonth || '',
        r.cycleLabel ?? '',
        r.state ?? 'NO_PACKAGE',
        r.currentPaid,
        r.currentUsed,
        r.currentUpcoming,
        r.currentRemaining,
        r.onboardingUsed,
        r.packageCount,
        r.lifetimePaid,
        r.lifetimeUsed,
        r.lifetimeSessionRows,
        r.lifetimeOnboarding,
        r.lastSessionDate ? r.lastSessionDate.slice(0, 10) : '',
      ]
        .map(esc)
        .join(','),
    );
    const csv = [header.join(','), ...lines].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `package-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const stateKeys = ['ACTIVE', 'GRACE', 'EXHAUSTED', 'CLOSED', 'NO_PACKAGE'];

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Package Audit</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Paid-for versus used sessions for every client, in one place.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={visible.length === 0}>
          <Download className="mr-1.5 h-3.5 w-3.5" />
          Export CSV
        </Button>
      </div>

      {summary && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-xl bg-card px-3.5 py-3 ring-1 ring-border/50">
            <p className="text-xs font-medium text-muted-foreground">Clients</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{summary.clients}</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              {summary.withActivePackage} with a package
            </p>
          </div>
          {stateKeys.map((key) => {
            const count = summary.byState[key] ?? 0;
            const active = stateFilter === key;
            return (
              <button
                key={key}
                onClick={() => setStateFilter(active ? null : key)}
                aria-pressed={active}
                title={STATE_HELP[key]}
                className={cn(
                  'rounded-xl bg-card px-3.5 py-3 text-left ring-1 ring-border/50 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md',
                  active && 'ring-2 ring-foreground/40',
                  count === 0 && !active && 'opacity-50',
                )}
              >
                <p className="text-xs font-medium capitalize text-muted-foreground">
                  {key === 'NO_PACKAGE' ? 'No package' : key.toLowerCase()}
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums">{count}</p>
              </button>
            );
          })}
        </div>
      )}

      {summary && summary.overConsumed > 0 && (
        <div className="flex items-start gap-2 rounded-xl bg-amber-500/10 px-3.5 py-3 text-sm text-amber-600 ring-1 ring-amber-500/20 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            <span className="font-semibold">{summary.overConsumed}</span> client
            {summary.overConsumed === 1 ? ' has' : 's have'} used more sessions than they have ever
            paid for ({summary.lifetimeUsed.toLocaleString()} used against{' '}
            {summary.lifetimePaid.toLocaleString()} paid, branch-wide). Sort by{' '}
            <span className="font-medium">Used (all time)</span> to review them.
          </p>
        </div>
      )}

      {/* Filters: trainer narrows the client list, so a 229-name dropdown
          becomes one trainer's roster. */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_14rem_16rem_auto]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search client, email, trainer or plan…"
            className="pl-9"
          />
        </div>

        <SearchSelect
          options={[
            { value: ALL, label: `All trainers (${trainerOptions.length})` },
            ...trainerOptions.map((t) => ({ value: t, label: t })),
          ]}
          value={trainerFilter}
          onChange={setTrainerFilter}
          leadingLabel="Trainer: "
          icon={UserCheck}
          searchPlaceholder="Search trainers…"
          emptyLabel="No trainers match"
        />

        <SearchSelect
          options={[
            { value: ALL, label: `All clients (${clientOptions.length})` },
            ...clientOptions.map((c) => ({ value: c.id, label: c.name, hint: c.hint })),
          ]}
          value={clientFilter}
          onChange={setClientFilter}
          leadingLabel="Client: "
          icon={Users}
          searchPlaceholder="Search clients…"
          emptyLabel="No clients match"
          showInitials
        />

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={resetFilters} className="justify-self-start">
            <X className="mr-1.5 h-3.5 w-3.5" />
            Reset
          </Button>
        )}
      </div>

      <p className="text-sm text-muted-foreground">
        Showing <span className="font-semibold text-foreground">{visible.length}</span> of{' '}
        {rows.length} clients
        <span className="ml-2 text-xs">· select a row to see every package they have held</span>
      </p>

      {error && (
        <div className="rounded-xl bg-red-500/10 px-3.5 py-3 text-sm text-red-500 ring-1 ring-red-500/20">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center rounded-2xl bg-card py-16 ring-1 ring-border/50">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl bg-card py-16 text-center text-sm text-muted-foreground ring-1 ring-border/50">
          No clients match these filters.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-card ring-1 ring-border/50">
          <table className="w-full min-w-[1150px] text-sm">
            <thead>
              <tr className="border-b border-border/50 text-left text-xs text-muted-foreground">
                <Th
                  onClick={() => toggleSort('clientName')}
                  active={sortKey === 'clientName'}
                  asc={sortAsc}
                >
                  Client
                </Th>
                <Th
                  onClick={() => toggleSort('planName')}
                  active={sortKey === 'planName'}
                  asc={sortAsc}
                >
                  Plan
                </Th>
                <th className="px-3 py-2 font-medium">Cycle</th>
                <th className="px-3 py-2 font-medium">State</th>
                <Th
                  numeric
                  onClick={() => toggleSort('currentPaid')}
                  active={sortKey === 'currentPaid'}
                  asc={sortAsc}
                >
                  Paid
                </Th>
                <Th
                  numeric
                  onClick={() => toggleSort('currentUsed')}
                  active={sortKey === 'currentUsed'}
                  asc={sortAsc}
                >
                  Used
                </Th>
                <th className="px-3 py-2 text-right font-medium">Booked</th>
                <Th
                  numeric
                  onClick={() => toggleSort('currentRemaining')}
                  active={sortKey === 'currentRemaining'}
                  asc={sortAsc}
                >
                  Left
                </Th>
                <Th
                  numeric
                  onClick={() => toggleSort('lifetimePaid')}
                  active={sortKey === 'lifetimePaid'}
                  asc={sortAsc}
                >
                  Paid (all time)
                </Th>
                <Th
                  numeric
                  onClick={() => toggleSort('lifetimeUsed')}
                  active={sortKey === 'lifetimeUsed'}
                  asc={sortAsc}
                >
                  Used (all time)
                </Th>
                <Th
                  onClick={() => toggleSort('lastSessionDate')}
                  active={sortKey === 'lastSessionDate'}
                  asc={sortAsc}
                >
                  Last session
                </Th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const stateKey = r.state ?? 'NO_PACKAGE';
                const over = r.lifetimePaid > 0 && r.lifetimeUsed > r.lifetimePaid;
                return (
                  <tr
                    key={r.clientProfileId}
                    onClick={() => setSelected(r)}
                    className="cursor-pointer border-b border-border/30 last:border-0 hover:bg-muted/30"
                  >
                    <td className="px-3 py-2">
                      <p className="font-medium">{r.clientName}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.trainerName ?? 'No trainer'}
                        {!r.isActive && ' · inactive'}
                      </p>
                    </td>
                    <td className="px-3 py-2">
                      <span className={cn(!r.planName && 'text-muted-foreground')}>
                        {r.planName ?? 'Custom'}
                      </span>
                      {r.sessionsPerMonth > 0 && (
                        <p className="text-xs text-muted-foreground">
                          {r.sessionsPerMonth}/month
                          {r.packageCount > 1 && ` · ${r.packageCount} packages`}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {r.cycleLabel ?? '—'}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        title={STATE_HELP[stateKey]}
                        className={cn(
                          'rounded px-1.5 py-0.5 text-[10px] font-medium ring-1',
                          STATE_TONE[stateKey],
                        )}
                      >
                        {stateKey === 'NO_PACKAGE' ? 'none' : stateKey.toLowerCase()}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.currentPaid || '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.currentUsed || '—'}
                      {r.onboardingUsed > 0 && (
                        <span
                          className="ml-1 text-[10px] text-amber-500"
                          title={`${r.onboardingUsed} of these are an onboarding adjustment with no session records`}
                        >
                          +{r.onboardingUsed}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {r.currentUpcoming || '—'}
                    </td>
                    <td
                      className={cn(
                        'px-3 py-2 text-right font-medium tabular-nums',
                        r.hasActivePackage && r.currentRemaining === 0 && 'text-red-500',
                      )}
                    >
                      {r.hasActivePackage ? r.currentRemaining : '—'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {r.lifetimePaid || '—'}
                    </td>
                    <td
                      className={cn(
                        'px-3 py-2 text-right font-medium tabular-nums',
                        over && 'text-amber-500',
                      )}
                      title={
                        r.lifetimeOnboarding > 0
                          ? `${r.lifetimeSessionRows} recorded sessions + ${r.lifetimeOnboarding} onboarding adjustment`
                          : `${r.lifetimeSessionRows} recorded sessions`
                      }
                    >
                      {r.lifetimeUsed || '—'}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {fmtDate(r.lastSessionDate)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs leading-relaxed text-muted-foreground">
        <span className="font-medium">Reading this table:</span> the first group of columns is the
        package the client is paying for <em>now</em>. The “all time” columns cover every package
        they have ever held — a renewal starts a fresh package, so the current count restarts while
        the all-time total keeps climbing. An amber <span className="text-amber-500">+n</span> next
        to Used is an onboarding adjustment: sessions recorded before the app, which count toward
        the total but have no session records behind them.
      </p>

      <PackageHistoryDrawer row={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

/** Right-hand drawer listing every package a client has ever held, newest first. */
function PackageHistoryDrawer({ row, onClose }: { row: AuditRow | null; onClose: () => void }) {
  return (
    <Sheet open={row != null} onOpenChange={(open) => !open && onClose()}>
      {/* gap-0: the sheet's own flex gap would fight the body's space-y rhythm. */}
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-lg">
        {row && (
          <>
            {/* pr-10 keeps a long name clear of the absolutely-positioned close button. */}
            <SheetHeader className="gap-1 border-b border-border/50 pr-10 pb-4">
              <SheetTitle className="text-lg leading-tight">{row.clientName}</SheetTitle>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {row.email}
                {row.trainerName && ` · ${row.trainerName}`}
              </p>
            </SheetHeader>

            {/* Body padding matches the header's, so nothing sits proud of the title. */}
            <div className="space-y-5 px-4 pt-5 pb-8">
              {/* Lifetime totals — the figure a client disputes */}
              <div className="grid grid-cols-3 divide-x divide-border/60 overflow-hidden rounded-xl border border-border/60 bg-muted/30">
                <Stat label="Packages" value={row.packageCount} />
                <Stat label="Paid, all time" value={row.lifetimePaid} />
                <Stat
                  label="Used, all time"
                  value={row.lifetimeUsed}
                  tone={
                    row.lifetimePaid > 0 && row.lifetimeUsed > row.lifetimePaid
                      ? 'text-amber-500'
                      : undefined
                  }
                />
              </div>

              {(row.lifetimeOnboarding > 0 ||
                (row.currentCountDiffers && !row.packagesOverlap) ||
                row.packagesOverlap) && (
                <div className="space-y-2.5">
                  {row.lifetimeOnboarding > 0 && (
                    <p className="rounded-lg bg-amber-500/10 px-3.5 py-3 text-xs leading-relaxed text-amber-600 dark:text-amber-400">
                      {row.lifetimeSessionRows} of those are recorded sessions;{' '}
                      {row.lifetimeOnboarding} are an onboarding adjustment entered by an admin with
                      no session records behind them.
                    </p>
                  )}

                  {row.currentCountDiffers && !row.packagesOverlap && (
                    <div className="flex items-start gap-2.5 rounded-lg bg-amber-500/10 px-3.5 py-3 text-xs leading-relaxed text-amber-600 ring-1 ring-amber-500/20 dark:text-amber-400">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>
                        The current package below shows more sessions than the table&rsquo;s{' '}
                        <span className="font-medium">Used</span> column. Its allowance is already
                        spent, so billing stopped counting at the end of the paid month — but
                        sessions kept being delivered after that. The figure below is what actually
                        happened.
                      </span>
                    </div>
                  )}

                  {row.packagesOverlap && (
                    <div className="flex items-start gap-2.5 rounded-lg bg-red-500/10 px-3.5 py-3 text-xs leading-relaxed text-red-500 ring-1 ring-red-500/20">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>
                        This client&rsquo;s packages overlap — the active one is not the most
                        recently started. The per-package figures below and the current-package
                        columns in the table are both correct for their own rule, but they cannot
                        agree while the data contradicts itself. Worth untangling before relying on
                        either.
                      </span>
                    </div>
                  )}
                </div>
              )}

              {row.packages.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  This client has never had a package.
                </p>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Package history
                  </p>

                  {row.packages.map((p) => (
                    <div
                      key={p.id}
                      className={cn(
                        'rounded-xl border border-border/60 p-4',
                        p.isActive ? 'bg-card ring-1 ring-emerald-500/20' : 'bg-muted/20',
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold leading-tight">
                            {p.planName ?? 'Custom'}
                            <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                              {p.sessionsPerMonth}/month
                            </span>
                          </p>
                          <p className="mt-1.5 text-xs text-muted-foreground">
                            {fmtRange(p.windowStart, p.windowEnd)}
                          </p>
                          {p.windowInvalid && (
                            <p className="mt-1.5 text-[11px] font-medium leading-relaxed text-red-500">
                              End date is before the start date — this row is corrupt.
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                          {p.isActive && (
                            <span className="rounded px-2 py-0.5 text-[10px] font-medium bg-emerald-500/10 text-emerald-500 ring-1 ring-emerald-500/20">
                              current
                            </span>
                          )}
                          <span
                            title={STATE_HELP[p.state]}
                            className={cn(
                              'rounded px-2 py-0.5 text-[10px] font-medium ring-1',
                              STATE_TONE[p.state],
                            )}
                          >
                            {p.state.toLowerCase()}
                          </span>
                        </div>
                      </div>

                      <div className="mt-3.5 grid grid-cols-4 gap-2 text-center">
                        <MiniStat label="Paid" value={p.totalSessions} />
                        <MiniStat label="Used" value={p.used} />
                        <MiniStat label="Booked" value={p.upcoming} muted />
                        <MiniStat
                          label="Left"
                          value={p.remaining}
                          tone={p.remaining === 0 ? 'text-red-500' : 'text-emerald-500'}
                        />
                      </div>

                      <div className="mt-3.5 space-y-1.5 border-t border-border/40 pt-3 text-[11px] leading-relaxed text-muted-foreground">
                        {p.onboardingUsed > 0 && (
                          <p>
                            {p.sessionRows} recorded ·{' '}
                            <span className="text-amber-500">
                              +{p.onboardingUsed} onboarding adjustment
                            </span>
                          </p>
                        )}
                        {p.trainerName && <p>Trainer: {p.trainerName}</p>}
                        {p.endDate ? (
                          <p>Admin end date: {fmtDate(p.endDate)}</p>
                        ) : (
                          <p>No end date set — counts until renewed or closed.</p>
                        )}
                      </div>
                    </div>
                  ))}

                  {row.unattributedUsed > 0 && (
                    <div className="rounded-xl border border-dashed border-border/60 bg-muted/10 p-4">
                      <p className="text-sm font-semibold leading-tight text-amber-500">
                        {row.unattributedUsed} session{row.unattributedUsed === 1 ? '' : 's'}{' '}
                        outside every package
                      </p>
                      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                        Completed before this client&rsquo;s first package began, or in a gap
                        between one package ending and the next starting. They were delivered but no
                        package was open to charge them to — usually a renewal that was recorded
                        late.
                      </p>
                    </div>
                  )}

                  <p className="border-t border-border/50 pt-4 text-[11px] leading-relaxed text-muted-foreground">
                    Each session counts toward exactly one package, so nothing is counted twice.{' '}
                    {row.packages.reduce((a, p) => a + p.used, 0)} across the packages
                    {row.unattributedUsed > 0 && ` + ${row.unattributedUsed} outside them`} ={' '}
                    {row.lifetimeUsed} all time.
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="px-2 py-3.5 text-center">
      <p className={cn('text-xl font-bold leading-none tabular-nums', tone)}>{value}</p>
      <p className="mt-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone,
  muted,
}: {
  label: string;
  value: number;
  tone?: string;
  muted?: boolean;
}) {
  return (
    <div className="rounded-lg bg-background/60 py-2.5">
      <p
        className={cn(
          'text-sm font-bold leading-none tabular-nums',
          tone,
          muted && 'text-muted-foreground',
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}

/** Sortable header cell. */
function Th({
  children,
  onClick,
  active,
  asc,
  numeric,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active: boolean;
  asc: boolean;
  numeric?: boolean;
}) {
  return (
    <th className={cn('px-3 py-2 font-medium', numeric && 'text-right')}>
      <button
        onClick={onClick}
        className={cn(
          'inline-flex items-center gap-1 hover:text-foreground',
          active && 'text-foreground',
        )}
      >
        {children}
        {active && <span aria-hidden>{asc ? '↑' : '↓'}</span>}
      </button>
    </th>
  );
}
