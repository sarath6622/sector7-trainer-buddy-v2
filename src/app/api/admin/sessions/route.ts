import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { listSessionsSchema } from '@/lib/validators';
import { toErrorResponse } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';

export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['SUPER_ADMIN', 'BRANCH_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const parsed = listSessionsSchema.safeParse({
      date: searchParams.get('date') ?? undefined,
      dateFrom: searchParams.get('dateFrom') ?? undefined,
      dateTo: searchParams.get('dateTo') ?? undefined,
      trainerId: searchParams.get('trainerId') ?? undefined,
      clientId: searchParams.get('clientId') ?? undefined,
      status: searchParams.get('status') ?? undefined,
      search: searchParams.get('search') ?? undefined,
      page: searchParams.get('page') ?? undefined,
      pageSize: searchParams.get('pageSize') ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { date, dateFrom, dateTo, trainerId, clientId, status, search, page, pageSize } =
      parsed.data;

    const where: Prisma.SessionInstanceWhereInput = {
      branchId: session.user.branchId,
    };
    if (date) {
      const d = new Date(date);
      const dayEnd = new Date(date);
      dayEnd.setHours(23, 59, 59, 999);
      where.scheduledDate = { gte: d, lte: dayEnd };
    } else if (dateFrom || dateTo) {
      where.scheduledDate = {};
      if (dateFrom) (where.scheduledDate as Record<string, Date>).gte = new Date(dateFrom);
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        (where.scheduledDate as Record<string, Date>).lte = end;
      }
    }
    if (trainerId) where.trainerProfileId = trainerId;
    if (clientId) where.clientProfileId = clientId;
    if (search) {
      where.OR = [
        { client: { user: { firstName: { contains: search, mode: 'insensitive' } } } },
        { client: { user: { lastName: { contains: search, mode: 'insensitive' } } } },
        { trainer: { user: { firstName: { contains: search, mode: 'insensitive' } } } },
        { trainer: { user: { lastName: { contains: search, mode: 'insensitive' } } } },
      ];
    }

    // Stats are counted over the full filtered range but WITHOUT the status
    // filter, so the breakdown always shows every status (see api-contracts.md).
    const statsWhere: Prisma.SessionInstanceWhereInput = { ...where };
    if (status) where.status = status;

    const [total, statusGroups, data] = await Promise.all([
      prisma.sessionInstance.count({ where }),
      prisma.sessionInstance.groupBy({
        by: ['status'],
        where: statsWhere,
        _count: { _all: true },
      }),
      prisma.sessionInstance.findMany({
        where,
        include: {
          client: {
            include: { user: { select: { firstName: true, lastName: true, email: true } } },
          },
          trainer: {
            include: { user: { select: { firstName: true, lastName: true, email: true } } },
          },
        },
        orderBy: [{ scheduledDate: 'asc' }, { scheduledTime: 'asc' }],
        skip: ((page ?? 1) - 1) * (pageSize ?? 20),
        take: pageSize ?? 20,
      }),
    ]);

    const byStatus: Record<string, number> = {};
    let statsTotal = 0;
    for (const group of statusGroups) {
      byStatus[group.status] = group._count._all;
      statsTotal += group._count._all;
    }

    return NextResponse.json({
      data,
      stats: { total: statsTotal, byStatus },
      pagination: {
        page: page ?? 1,
        pageSize: pageSize ?? 20,
        total,
        totalPages: Math.ceil(total / (pageSize ?? 20)),
      },
    });
  } catch (error) {
    console.error('[GET /api/admin/sessions] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
