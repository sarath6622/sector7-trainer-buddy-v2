import { NextResponse } from 'next/server';
import { toErrorResponse } from '@/lib/errors';
import { processOverrunReminders } from '@/services/session.service';

/**
 * Cron entry point — session overrun reminders + 24h auto-close.
 *
 * Nudges trainers whose session is still IN_PROGRESS past its booked duration
 * (once at the planned end, once 15 minutes later) and force-closes anything
 * still open after 24h. Scans every branch, like `/api/cron/process-cycles`.
 *
 * Driven by an **external ~15 minute pinger** (cron-job.org), not Vercel Cron:
 * the Hobby plan caps Vercel crons at once per day, which is useless for a
 * reminder that should land minutes after the session's end. Auth is the same
 * `CRON_SECRET` bearer token every other cron route uses.
 *
 * Idempotent — reminders dedupe against `notification_logs` and auto-close
 * takes the row out of IN_PROGRESS, so re-running a pass is a no-op.
 */
async function handle(req: Request) {
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
    const result = await processOverrunReminders();
    return NextResponse.json({ data: result });
  } catch (error) {
    console.error('[/api/cron/session-overrun-reminders] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}

// GET as well as POST — cron-job.org defaults to GET, and the handler is
// idempotent so there is no harm in either verb.
export const GET = handle;
export const POST = handle;
