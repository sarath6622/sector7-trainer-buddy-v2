import { NextResponse } from 'next/server';
import { toErrorResponse } from '@/lib/errors';
import * as carryforward from '@/services/carryforward.service';

/**
 * Cron entry point — daily Vercel Cron job.
 * Processes all expired-but-not-yet-processed PtPackage windows across every
 * branch. Auth is via the `CRON_SECRET` bearer token (see
 * `memory/architecture.md` "Secrets & Cron").
 *
 * Idempotent: re-running is a no-op for any package whose `lastProcessedAt`
 * is already past its `endDate`.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: 'CRON_SECRET not configured', code: 'MISCONFIGURED' },
      { status: 500 },
    );
  }

  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  try {
    const result = await carryforward.processCycleEndsForPackages(null, 'cron');
    return NextResponse.json({ data: result });
  } catch (error) {
    console.error('[POST /api/cron/process-cycles] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
