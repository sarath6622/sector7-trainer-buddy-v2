import { prisma } from '@/lib/prisma';

// ─── Helpers ────────────────────────────────────────

function getMonthRange(month: string) {
  const [yearStr, monthStr] = month.split('-');
  const year = parseInt(yearStr!, 10);
  const m = parseInt(monthStr!, 10);
  return {
    start: new Date(year, m - 1, 1),
    end: new Date(year, m, 0, 23, 59, 59),
  };
}

// ─── Trainer Utilization ────────────────────────────

export interface TrainerUtilization {
  trainerProfileId: string;
  trainerName: string;
  totalSessions: number;
  completedSessions: number;
  utilizationPercent: number;
}

export async function getTrainerUtilization(
  branchId: string,
  month: string,
  trainerId?: string,
): Promise<TrainerUtilization[]> {
  const { start, end } = getMonthRange(month);

  const where: Record<string, unknown> = { branchId };
  if (trainerId) where.id = trainerId;

  const trainers = await prisma.trainerProfile.findMany({
    where,
    include: { user: { select: { firstName: true, lastName: true } } },
  });

  const results: TrainerUtilization[] = [];

  for (const trainer of trainers) {
    const sessions = await prisma.sessionInstance.findMany({
      where: {
        branchId,
        trainerProfileId: trainer.id,
        scheduledDate: { gte: start, lte: end },
      },
      select: { status: true },
    });

    const total = sessions.length;
    const completed = sessions.filter((s) => s.status === 'COMPLETED').length;
    const utilizationPercent = total > 0 ? Math.round((completed / total) * 100) : 0;

    results.push({
      trainerProfileId: trainer.id,
      trainerName: `${trainer.user.firstName} ${trainer.user.lastName}`,
      totalSessions: total,
      completedSessions: completed,
      utilizationPercent,
    });
  }

  return results;
}

// ─── Client Attendance ──────────────────────────────

export interface ClientAttendance {
  clientProfileId: string;
  clientName: string;
  totalSessions: number;
  attended: number;
  noShow: number;
  cancelled: number;
  attendancePercent: number;
}

export async function getClientAttendance(
  branchId: string,
  month: string,
  clientId?: string,
): Promise<ClientAttendance[]> {
  const { start, end } = getMonthRange(month);

  const where: Record<string, unknown> = { branchId };
  if (clientId) where.id = clientId;

  const clients = await prisma.clientProfile.findMany({
    where,
    include: { user: { select: { firstName: true, lastName: true } } },
  });

  const results: ClientAttendance[] = [];

  for (const client of clients) {
    const sessions = await prisma.sessionInstance.findMany({
      where: {
        branchId,
        clientProfileId: client.id,
        scheduledDate: { gte: start, lte: end },
      },
      select: { status: true },
    });

    const total = sessions.length;
    const attended = sessions.filter((s) => s.status === 'COMPLETED').length;
    const noShow = sessions.filter((s) => s.status === 'NO_SHOW').length;
    const cancelled = sessions.filter((s) => s.status === 'CANCELLED').length;
    const attendancePercent = total > 0 ? Math.round((attended / total) * 100) : 0;

    results.push({
      clientProfileId: client.id,
      clientName: `${client.user.firstName} ${client.user.lastName}`,
      totalSessions: total,
      attended,
      noShow,
      cancelled,
      attendancePercent,
    });
  }

  return results;
}

// ─── Session Consumption ────────────────────────────

export interface SessionConsumption {
  clientProfileId: string;
  clientName: string;
  sessionsPerMonth: number;
  completed: number;
  noShow: number;
  scheduled: number;
  cancelled: number;
  carryForward: number;
  consumptionPercent: number;
}

export async function getSessionConsumption(
  branchId: string,
  month: string,
): Promise<SessionConsumption[]> {
  const { start, end } = getMonthRange(month);

  const packages = await prisma.ptPackage.findMany({
    where: { branchId, isActive: true },
    include: {
      client: {
        include: { user: { select: { firstName: true, lastName: true } } },
      },
    },
  });

  const results: SessionConsumption[] = [];

  for (const pkg of packages) {
    const sessions = await prisma.sessionInstance.findMany({
      where: {
        branchId,
        clientProfileId: pkg.clientProfileId,
        scheduledDate: { gte: start, lte: end },
      },
      select: { status: true, isCarryForward: true },
    });

    const completed = sessions.filter((s) => s.status === 'COMPLETED').length;
    const noShow = sessions.filter((s) => s.status === 'NO_SHOW').length;
    const scheduled = sessions.filter(
      (s) => s.status === 'SCHEDULED' || s.status === 'IN_PROGRESS',
    ).length;
    const cancelled = sessions.filter((s) => s.status === 'CANCELLED').length;
    const carryForward = sessions.filter((s) => s.isCarryForward).length;
    const used = completed + noShow;
    const consumptionPercent =
      pkg.sessionsPerMonth > 0 ? Math.round((used / pkg.sessionsPerMonth) * 100) : 0;

    results.push({
      clientProfileId: pkg.clientProfileId,
      clientName: `${pkg.client.user.firstName} ${pkg.client.user.lastName}`,
      sessionsPerMonth: pkg.sessionsPerMonth,
      completed,
      noShow,
      scheduled,
      cancelled,
      carryForward,
      consumptionPercent,
    });
  }

  return results;
}

// ─── No-Show Rate ───────────────────────────────────

export interface NoShowRate {
  trainerProfileId: string;
  trainerName: string;
  totalSessions: number;
  noShowCount: number;
  noShowPercent: number;
}

export async function getNoShowRate(branchId: string, month: string): Promise<NoShowRate[]> {
  const { start, end } = getMonthRange(month);

  const trainers = await prisma.trainerProfile.findMany({
    where: { branchId },
    include: { user: { select: { firstName: true, lastName: true } } },
  });

  const results: NoShowRate[] = [];

  for (const trainer of trainers) {
    const sessions = await prisma.sessionInstance.findMany({
      where: {
        branchId,
        trainerProfileId: trainer.id,
        scheduledDate: { gte: start, lte: end },
      },
      select: { status: true },
    });

    const total = sessions.length;
    const noShowCount = sessions.filter((s) => s.status === 'NO_SHOW').length;
    const noShowPercent = total > 0 ? Math.round((noShowCount / total) * 100) : 0;

    results.push({
      trainerProfileId: trainer.id,
      trainerName: `${trainer.user.firstName} ${trainer.user.lastName}`,
      totalSessions: total,
      noShowCount,
      noShowPercent,
    });
  }

  return results;
}

// ─── Revenue Overview ───────────────────────────────

export interface RevenueOverview {
  totalRevenue: number;
  paidCount: number;
  pendingCount: number;
  pendingAmount: number;
  byMethod: { method: string; amount: number; count: number }[];
}

export async function getRevenueOverview(
  branchId: string,
  month: string,
): Promise<RevenueOverview> {
  const { start, end } = getMonthRange(month);

  const payments = await prisma.paymentRecord.findMany({
    where: {
      branchId,
      createdAt: { gte: start, lte: end },
    },
    select: { amount: true, status: true, method: true },
  });

  const paid = payments.filter((p) => p.status === 'PAID');
  const pending = payments.filter((p) => p.status === 'PENDING');

  const totalRevenue = paid.reduce((sum, p) => sum + p.amount, 0);
  const pendingAmount = pending.reduce((sum, p) => sum + p.amount, 0);

  // Group by method
  const methodMap = new Map<string, { amount: number; count: number }>();
  for (const p of paid) {
    const existing = methodMap.get(p.method) ?? { amount: 0, count: 0 };
    existing.amount += p.amount;
    existing.count += 1;
    methodMap.set(p.method, existing);
  }

  const byMethod = Array.from(methodMap.entries()).map(([method, data]) => ({
    method,
    ...data,
  }));

  return {
    totalRevenue,
    paidCount: paid.length,
    pendingCount: pending.length,
    pendingAmount,
    byMethod,
  };
}

// ─── Trainer Personal Analytics ─────────────────────

export interface TrainerAnalytics {
  clientAttendanceRate: number;
  sessionCompletionRate: number;
  utilization: number;
  totalClients: number;
  totalSessionsThisMonth: number;
  completedThisMonth: number;
  noShowThisMonth: number;
}

export async function getTrainerAnalytics(
  trainerProfileId: string,
  branchId: string,
): Promise<TrainerAnalytics> {
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const { start, end } = getMonthRange(month);

  const totalClients = await prisma.ptPackage.count({
    where: { branchId, trainerProfileId, isActive: true },
  });

  const sessions = await prisma.sessionInstance.findMany({
    where: {
      branchId,
      trainerProfileId,
      scheduledDate: { gte: start, lte: end },
    },
    select: { status: true },
  });

  const total = sessions.length;
  const completed = sessions.filter((s) => s.status === 'COMPLETED').length;
  const noShow = sessions.filter((s) => s.status === 'NO_SHOW').length;
  const attended = completed;
  const conductedOrAttempted = completed + noShow;

  return {
    clientAttendanceRate:
      conductedOrAttempted > 0 ? Math.round((attended / conductedOrAttempted) * 100) : 0,
    sessionCompletionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
    utilization: total > 0 ? Math.round((completed / total) * 100) : 0,
    totalClients,
    totalSessionsThisMonth: total,
    completedThisMonth: completed,
    noShowThisMonth: noShow,
  };
}
