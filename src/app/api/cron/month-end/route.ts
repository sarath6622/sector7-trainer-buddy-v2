import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import * as carryforwardService from '@/services/carryforward.service';

/**
 * GET /api/cron/month-end
 * Vercel Cron Job endpoint — runs on the last day of each month.
 * Processes month-end carry-forward for ALL active branches.
 *
 * Secured via CRON_SECRET env variable.
 *
 * vercel.json config:
 * {
 *   "crons": [{
 *     "path": "/api/cron/month-end",
 *     "schedule": "0 23 28-31 * *"
 *   }]
 * }
 */
export async function GET(req: Request) {
  try {
    // Verify cron secret
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Determine current month
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // Only run on the last day of the month
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (tomorrow.getMonth() === now.getMonth()) {
      return NextResponse.json({
        message: `Not the last day of the month. Current: ${now.getDate()}`,
        skipped: true,
      });
    }

    // Process all active branches
    const branches = await prisma.branch.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
    });

    const results = [];
    for (const branch of branches) {
      try {
        const result = await carryforwardService.processMonthEnd(branch.id, month, 'SYSTEM_CRON');
        results.push({ branchId: branch.id, branchName: branch.name, ...result });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        results.push({ branchId: branch.id, branchName: branch.name, error: message });
      }
    }

    return NextResponse.json({
      message: `Month-end processed for ${month}`,
      branches: results,
    });
  } catch (error) {
    console.error('[Cron] Month-end processing failed:', error);
    return NextResponse.json(
      { error: 'Internal error during month-end processing' },
      { status: 500 },
    );
  }
}
