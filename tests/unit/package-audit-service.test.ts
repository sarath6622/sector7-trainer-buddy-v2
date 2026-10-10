import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    clientProfile: { findMany: vi.fn() },
    sessionInstance: { findMany: vi.fn() },
  },
}));

import { prisma } from '@/lib/prisma';
import { getPackageAudit } from '@/services/package-audit.service';

type Mock = ReturnType<typeof vi.fn>;
const BRANCH = 'branch-1';

beforeEach(() => vi.clearAllMocks());

const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
};

function client(over: Record<string, unknown> = {}) {
  return {
    id: 'cp-1',
    user: {
      firstName: 'Asha',
      lastName: 'Menon',
      email: 'asha@example.com',
      isActive: true,
      deletedAt: null,
    },
    ptPackages: [],
    ...over,
  };
}

function pkg(over: Record<string, unknown> = {}) {
  return {
    id: 'pkg-1',
    isActive: true,
    startDate: daysAgo(10),
    endDate: null,
    totalSessions: 12,
    sessionsPerMonth: 12,
    onboardingUsedSessions: 0,
    plan: null,
    trainer: { user: { firstName: 'Athul', lastName: 'Krishna' } },
    ...over,
  };
}

function session(over: Record<string, unknown> = {}) {
  return { clientProfileId: 'cp-1', status: 'COMPLETED', scheduledDate: daysAgo(5), ...over };
}

describe('getPackageAudit', () => {
  it('scopes both queries to the caller branch', async () => {
    (prisma.clientProfile.findMany as Mock).mockResolvedValue([]);
    (prisma.sessionInstance.findMany as Mock).mockResolvedValue([]);

    await getPackageAudit(BRANCH);

    expect((prisma.clientProfile.findMany as Mock).mock.calls[0]![0].where).toEqual({
      branchId: BRANCH,
    });
    expect((prisma.sessionInstance.findMany as Mock).mock.calls[0]![0].where).toEqual({
      branchId: BRANCH,
    });
  });

  it('includes a client with no package at all', async () => {
    (prisma.clientProfile.findMany as Mock).mockResolvedValue([client()]);
    (prisma.sessionInstance.findMany as Mock).mockResolvedValue([]);

    const { data, summary } = await getPackageAudit(BRANCH);

    expect(data).toHaveLength(1);
    expect(data[0]!.hasActivePackage).toBe(false);
    expect(data[0]!.state).toBeNull();
    expect(data[0]!.currentPaid).toBe(0);
    expect(summary.byState.NO_PACKAGE).toBe(1);
    expect(summary.withActivePackage).toBe(0);
  });

  it('omits soft-deleted users', async () => {
    (prisma.clientProfile.findMany as Mock).mockResolvedValue([
      client({ user: { ...client().user, deletedAt: new Date() } }),
    ]);
    (prisma.sessionInstance.findMany as Mock).mockResolvedValue([]);

    const { data } = await getPackageAudit(BRANCH);

    expect(data).toHaveLength(0);
  });

  it('counts COMPLETED and NO_SHOW toward used, ignoring CANCELLED', async () => {
    (prisma.clientProfile.findMany as Mock).mockResolvedValue([client({ ptPackages: [pkg()] })]);
    (prisma.sessionInstance.findMany as Mock).mockResolvedValue([
      session({ status: 'COMPLETED' }),
      session({ status: 'COMPLETED' }),
      session({ status: 'NO_SHOW' }),
      session({ status: 'CANCELLED' }),
    ]);

    const { data } = await getPackageAudit(BRANCH);

    expect(data[0]!.currentUsed).toBe(3);
    expect(data[0]!.lifetimeUsed).toBe(3);
    expect(data[0]!.lifetimeSessionRows).toBe(3);
  });

  it('separates SCHEDULED into upcoming rather than used', async () => {
    (prisma.clientProfile.findMany as Mock).mockResolvedValue([client({ ptPackages: [pkg()] })]);
    (prisma.sessionInstance.findMany as Mock).mockResolvedValue([
      session({ status: 'COMPLETED' }),
      session({ status: 'SCHEDULED', scheduledDate: daysAgo(-3) }),
      session({ status: 'IN_PROGRESS' }),
    ]);

    const { data } = await getPackageAudit(BRANCH);

    expect(data[0]!.currentUsed).toBe(1);
    expect(data[0]!.currentUpcoming).toBe(2);
    expect(data[0]!.currentRemaining).toBe(12 - 1 - 2);
  });

  it('reports the onboarding offset separately while still counting it', async () => {
    (prisma.clientProfile.findMany as Mock).mockResolvedValue([
      client({ ptPackages: [pkg({ onboardingUsedSessions: 4 })] }),
    ]);
    (prisma.sessionInstance.findMany as Mock).mockResolvedValue([session(), session()]);

    const { data } = await getPackageAudit(BRANCH);

    expect(data[0]!.currentUsed).toBe(6); // 2 real + 4 offset
    expect(data[0]!.onboardingUsed).toBe(4);
    expect(data[0]!.lifetimeSessionRows).toBe(2); // real rows only
    expect(data[0]!.lifetimeUsed).toBe(6);
    expect(data[0]!.lifetimeOnboarding).toBe(4);
  });

  it('separates the current package from the lifetime total across renewals', async () => {
    // The Aiswarya shape: an old closed package plus a fresh one. The current
    // counter restarts; the lifetime total must not.
    const old = pkg({
      id: 'pkg-old',
      isActive: false,
      startDate: daysAgo(120),
      endDate: daysAgo(95),
      totalSessions: 13,
    });
    const fresh = pkg({ id: 'pkg-new', isActive: true, startDate: daysAgo(3), totalSessions: 14 });

    (prisma.clientProfile.findMany as Mock).mockResolvedValue([
      client({ ptPackages: [fresh, old] }),
    ]);
    (prisma.sessionInstance.findMany as Mock).mockResolvedValue([
      // 1 inside the new package
      session({ scheduledDate: daysAgo(1) }),
      // 5 long before it
      ...Array.from({ length: 5 }, () => session({ scheduledDate: daysAgo(100) })),
    ]);

    const { data } = await getPackageAudit(BRANCH);
    const row = data[0]!;

    expect(row.currentPaid).toBe(14);
    expect(row.currentUsed).toBe(1); // what the trainer card shows
    expect(row.lifetimePaid).toBe(27); // 14 + 13
    expect(row.lifetimeUsed).toBe(6); // what the client means
    expect(row.packageCount).toBe(2);
  });

  it('flags clients who have used more than they ever paid for', async () => {
    (prisma.clientProfile.findMany as Mock).mockResolvedValue([
      client({ ptPackages: [pkg({ totalSessions: 2 })] }),
    ]);
    (prisma.sessionInstance.findMany as Mock).mockResolvedValue(
      Array.from({ length: 9 }, () => session()),
    );

    const { data, summary } = await getPackageAudit(BRANCH);

    expect(data[0]!.lifetimeUsed).toBe(9);
    expect(data[0]!.lifetimePaid).toBe(2);
    expect(data[0]!.currentRemaining).toBe(0); // never negative
    expect(summary.overConsumed).toBe(1);
  });

  it('does not attribute sessions to a package that started after them', async () => {
    (prisma.clientProfile.findMany as Mock).mockResolvedValue([
      client({ ptPackages: [pkg({ startDate: daysAgo(5) })] }),
    ]);
    (prisma.sessionInstance.findMany as Mock).mockResolvedValue([
      session({ scheduledDate: daysAgo(60) }), // predates the package
      session({ scheduledDate: daysAgo(2) }),
    ]);

    const { data } = await getPackageAudit(BRANCH);

    expect(data[0]!.currentUsed).toBe(1); // only the in-package one
    expect(data[0]!.lifetimeUsed).toBe(2); // but lifetime sees both
  });

  it('sorts rows by client name and keeps per-client session grouping correct', async () => {
    (prisma.clientProfile.findMany as Mock).mockResolvedValue([
      client({ id: 'cp-z', user: { ...client().user, firstName: 'Zoya' }, ptPackages: [pkg()] }),
      client({ id: 'cp-a', user: { ...client().user, firstName: 'Amal' }, ptPackages: [pkg()] }),
    ]);
    (prisma.sessionInstance.findMany as Mock).mockResolvedValue([
      session({ clientProfileId: 'cp-z' }),
      session({ clientProfileId: 'cp-z' }),
      session({ clientProfileId: 'cp-a' }),
    ]);

    const { data } = await getPackageAudit(BRANCH);

    expect(data.map((r) => r.clientName)).toEqual(['Amal Menon', 'Zoya Menon']);
    expect(data[0]!.lifetimeUsed).toBe(1);
    expect(data[1]!.lifetimeUsed).toBe(2);
  });
});

describe('getPackageAudit — package history (drawer)', () => {
  it('returns one history entry per package, newest first', async () => {
    const old = pkg({
      id: 'p-old',
      isActive: false,
      startDate: daysAgo(120),
      endDate: daysAgo(95),
    });
    const mid = pkg({ id: 'p-mid', isActive: false, startDate: daysAgo(90), endDate: daysAgo(65) });
    const cur = pkg({ id: 'p-cur', isActive: true, startDate: daysAgo(10) });
    (prisma.clientProfile.findMany as Mock).mockResolvedValue([
      client({ ptPackages: [cur, mid, old] }),
    ]);
    (prisma.sessionInstance.findMany as Mock).mockResolvedValue([]);

    const { data } = await getPackageAudit(BRANCH);

    expect(data[0]!.packages.map((p) => p.id)).toEqual(['p-cur', 'p-mid', 'p-old']);
    expect(data[0]!.packages[0]!.isActive).toBe(true);
  });

  it('attributes each session to the package in force that day, never twice', async () => {
    const first = pkg({ id: 'p1', isActive: false, startDate: daysAgo(60), endDate: daysAgo(31) });
    const second = pkg({ id: 'p2', isActive: true, startDate: daysAgo(30) });
    (prisma.clientProfile.findMany as Mock).mockResolvedValue([
      client({ ptPackages: [second, first] }),
    ]);
    (prisma.sessionInstance.findMany as Mock).mockResolvedValue([
      session({ scheduledDate: daysAgo(50) }), // first
      session({ scheduledDate: daysAgo(40) }), // first
      session({ scheduledDate: daysAgo(20) }), // second
      session({ scheduledDate: daysAgo(2) }), // second
    ]);

    const { data } = await getPackageAudit(BRANCH);
    const byId = Object.fromEntries(data[0]!.packages.map((p) => [p.id, p]));

    expect(byId.p1!.sessionRows).toBe(2);
    expect(byId.p2!.sessionRows).toBe(2);
    // The invariant the drawer relies on.
    expect(data[0]!.packages.reduce((a, p) => a + p.used, 0) + data[0]!.unattributedUsed).toBe(
      data[0]!.lifetimeUsed,
    );
  });

  it('reports sessions predating every package as unattributed', async () => {
    (prisma.clientProfile.findMany as Mock).mockResolvedValue([
      client({ ptPackages: [pkg({ startDate: daysAgo(10) })] }),
    ]);
    (prisma.sessionInstance.findMany as Mock).mockResolvedValue([
      session({ scheduledDate: daysAgo(90) }),
      session({ scheduledDate: daysAgo(80) }),
      session({ scheduledDate: daysAgo(2) }),
    ]);

    const { data } = await getPackageAudit(BRANCH);

    expect(data[0]!.unattributedUsed).toBe(2);
    expect(data[0]!.packages[0]!.sessionRows).toBe(1);
    expect(data[0]!.packages.reduce((a, p) => a + p.used, 0) + data[0]!.unattributedUsed).toBe(
      data[0]!.lifetimeUsed,
    );
  });

  it('flags a client whose active package is not the latest-starting one', async () => {
    // Prod shape (Sosu Alex): an active package plus a later-starting row that
    // was closed out of order.
    const active = pkg({ id: 'p-active', isActive: true, startDate: daysAgo(40) });
    const laterClosed = pkg({
      id: 'p-later',
      isActive: false,
      startDate: daysAgo(35),
      endDate: daysAgo(38), // ends BEFORE it starts — corrupt
    });
    (prisma.clientProfile.findMany as Mock).mockResolvedValue([
      client({ ptPackages: [laterClosed, active] }),
    ]);
    (prisma.sessionInstance.findMany as Mock).mockResolvedValue([]);

    const { data } = await getPackageAudit(BRANCH);

    expect(data[0]!.packagesOverlap).toBe(true);
    expect(data[0]!.packages.find((p) => p.id === 'p-later')!.windowInvalid).toBe(true);
    expect(data[0]!.packages.find((p) => p.id === 'p-active')!.windowInvalid).toBe(false);
  });

  it('does not report overlap for a normal renewal chain', async () => {
    const old = pkg({ id: 'p-old', isActive: false, startDate: daysAgo(60), endDate: daysAgo(31) });
    const cur = pkg({ id: 'p-cur', isActive: true, startDate: daysAgo(30) });
    (prisma.clientProfile.findMany as Mock).mockResolvedValue([client({ ptPackages: [cur, old] })]);
    (prisma.sessionInstance.findMany as Mock).mockResolvedValue([]);

    const { data } = await getPackageAudit(BRANCH);

    expect(data[0]!.packagesOverlap).toBe(false);
  });

  it('keeps the drawer current package in step with the table columns', async () => {
    // A GRACE package: time elapsed, sessions still pending. The history entry
    // must not re-derive the window from its own `used` — doing so flipped it to
    // EXHAUSTED and silently dropped sessions.
    (prisma.clientProfile.findMany as Mock).mockResolvedValue([
      client({ ptPackages: [pkg({ startDate: daysAgo(70), totalSessions: 12 })] }),
    ]);
    (prisma.sessionInstance.findMany as Mock).mockResolvedValue(
      Array.from({ length: 15 }, (_, i) => session({ scheduledDate: daysAgo(65 - i * 4) })),
    );

    const { data } = await getPackageAudit(BRANCH);
    const row = data[0]!;

    expect(row.packages[0]!.used).toBe(row.currentUsed);
    expect(row.packages[0]!.used).toBe(15);
  });
});
