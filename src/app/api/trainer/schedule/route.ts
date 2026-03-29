import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['TRAINER', 'KICKBOXING_TRAINER'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const trainerProfileId = session.user.trainerProfileId;
    if (!trainerProfileId) {
      return NextResponse.json(
        { error: 'No trainer profile found', code: 'NO_PROFILE' },
        { status: 400 },
      );
    }

    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date'); // YYYY-MM-DD  — single day
    const month = searchParams.get('month'); // YYYY-MM     — full month
    const dateFrom = searchParams.get('dateFrom'); // YYYY-MM-DD  — range start
    const dateTo = searchParams.get('dateTo'); // YYYY-MM-DD  — range end

    const where: Record<string, unknown> = {
      branchId: session.user.branchId,
      trainerProfileId,
    };

    if (date) {
      const d = new Date(date);
      const dayEnd = new Date(date);
      dayEnd.setHours(23, 59, 59, 999);
      where.scheduledDate = { gte: d, lte: dayEnd };
    } else if (dateFrom || dateTo) {
      const range: Record<string, Date> = {};
      if (dateFrom) range.gte = new Date(dateFrom);
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        range.lte = end;
      }
      where.scheduledDate = range;
    } else if (month) {
      const [yearStr, monthStr] = month.split('-');
      const year = parseInt(yearStr!, 10);
      const m = parseInt(monthStr!, 10);
      where.scheduledDate = {
        gte: new Date(year, m - 1, 1),
        lte: new Date(year, m, 0, 23, 59, 59),
      };
    }

    const instances = await prisma.sessionInstance.findMany({
      where,
      include: {
        client: {
          include: { user: { select: { firstName: true, lastName: true } } },
        },
      },
      orderBy: [{ scheduledDate: 'asc' }, { scheduledTime: 'asc' }],
    });

    return NextResponse.json({ data: instances });
  } catch (error) {
    console.error('[GET /api/trainer/schedule] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
