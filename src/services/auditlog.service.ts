import { prisma } from '@/lib/prisma';

interface ListAuditLogsInput {
  branchId: string;
  action?: string;
  actorId?: string;
  subjectType?: string;
  subjectId?: string;
  dateFrom?: string;
  dateTo?: string;
  page: number;
  pageSize: number;
}

export async function listAuditLogs(input: ListAuditLogsInput) {
  const where: Record<string, unknown> = { branchId: input.branchId };

  if (input.action) where.action = input.action;
  if (input.actorId) where.actorId = input.actorId;
  if (input.subjectType) where.subjectType = input.subjectType;
  if (input.subjectId) where.subjectId = input.subjectId;

  if (input.dateFrom || input.dateTo) {
    const createdAt: Record<string, Date> = {};
    if (input.dateFrom) createdAt.gte = new Date(input.dateFrom);
    if (input.dateTo) {
      const to = new Date(input.dateTo);
      to.setHours(23, 59, 59, 999);
      createdAt.lte = to;
    }
    where.createdAt = createdAt;
  }

  const [data, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: {
        actor: { select: { id: true, firstName: true, lastName: true, email: true, roles: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    data,
    pagination: {
      page: input.page,
      pageSize: input.pageSize,
      total,
      totalPages: Math.ceil(total / input.pageSize),
    },
  };
}

export async function getDistinctActions(branchId: string): Promise<string[]> {
  const results = await prisma.auditLog.findMany({
    where: { branchId },
    select: { action: true },
    distinct: ['action'],
    orderBy: { action: 'asc' },
  });
  return results.map((r) => r.action);
}

export async function getDistinctSubjectTypes(branchId: string): Promise<string[]> {
  const results = await prisma.auditLog.findMany({
    where: { branchId },
    select: { subjectType: true },
    distinct: ['subjectType'],
    orderBy: { subjectType: 'asc' },
  });
  return results.map((r) => r.subjectType);
}
