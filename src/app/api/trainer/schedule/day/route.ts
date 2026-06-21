import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import { isTrainerAvailable } from '@/services/availability-override.service';
import { getEffectiveShiftsForDate } from '@/services/shift.service';

// Sun-indexed (Date.getDay()) → DayOfWeek enum.
const DAY_NAMES = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
] as const;

// Slot granularity for the "Available Slots" list (matches the agenda mockup).
const SLOT_MIN = 60;

// All-day fallback window when a trainer has neither shifts nor profile hours.
const DEFAULT_WINDOW = { start: '06:00', end: '22:00' };

const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h! * 60 + m!;
};
const fromMin = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/**
 * Day-view for the logged-in trainer's schedule page (mobile agenda).
 * Returns the day's booked sessions, the computed available 1h slots within
 * the trainer's working window(s), and a summary line.
 *
 * GET /api/trainer/schedule/day?date=YYYY-MM-DD
 */
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
    const branchId = session.user.branchId;

    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get('date'); // YYYY-MM-DD
    const now = new Date();
    const [y, m, d] = dateParam
      ? dateParam.split('-').map(Number)
      : [now.getFullYear(), now.getMonth() + 1, now.getDate()];
    // Local midnight — matches how sessions are stored (also local midnight).
    const dayStart = new Date(y!, m! - 1, d!);
    const dayEnd = new Date(y!, m! - 1, d!, 23, 59, 59, 999);
    const dayOfWeek = DAY_NAMES[dayStart.getDay()]!;

    // ── Booked sessions for the day (excluding cancelled) ──────────────────
    const instances = await prisma.sessionInstance.findMany({
      where: {
        branchId,
        trainerProfileId,
        scheduledDate: { gte: dayStart, lte: dayEnd },
        status: { not: 'CANCELLED' },
      },
      include: { client: { include: { user: { select: { firstName: true, lastName: true } } } } },
      orderBy: { scheduledTime: 'asc' },
    });

    const sessions = instances.map((s) => ({
      id: s.id,
      clientProfileId: s.clientProfileId,
      clientName: `${s.client.user.firstName} ${s.client.user.lastName}`,
      startTime: s.scheduledTime,
      durationMin: s.durationMin,
      status: s.status,
    }));

    // ── Is the trainer working this day? (override-aware) ──────────────────
    const availability = await isTrainerAvailable(trainerProfileId, branchId, dayStart);

    if (!availability.available) {
      return NextResponse.json({
        data: {
          date: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
          workingDay: false,
          sessions,
          availableSlots: [],
          summary: {
            sessionCount: sessions.length,
            bookedMin: sessions.reduce((sum, s) => sum + s.durationMin, 0),
            availableMin: 0,
          },
        },
      });
    }

    // ── Resolve the day's working window(s) ────────────────────────────────
    let windows: { start: string; end: string }[] = [];
    if (availability.startTime && availability.endTime) {
      // Date-specific override with custom hours.
      windows = [{ start: availability.startTime, end: availability.endTime }];
    } else {
      const shifts = await getEffectiveShiftsForDate(trainerProfileId, dayStart);
      const dayShifts = shifts.filter((s) => (s.days as string[]).includes(dayOfWeek));
      if (dayShifts.length > 0) {
        windows = dayShifts.map((s) => ({ start: s.startTime, end: s.endTime }));
      } else {
        const profile = await prisma.trainerProfile.findUnique({
          where: { id: trainerProfileId },
          select: { workingHoursStart: true, workingHoursEnd: true },
        });
        windows =
          profile?.workingHoursStart && profile.workingHoursEnd
            ? [{ start: profile.workingHoursStart, end: profile.workingHoursEnd }]
            : [DEFAULT_WINDOW];
      }
    }

    // ── Compute free windows (window minus booked) then slice into 1h slots ──
    const busy = sessions
      .map((s) => ({ s: toMin(s.startTime), e: toMin(s.startTime) + s.durationMin }))
      .sort((a, b) => a.s - b.s);

    // Merge overlapping/adjacent shift windows into disjoint intervals so the
    // same time range can't produce duplicate slots (trainers may have two
    // shifts that overlap on the same day).
    const merged: { s: number; e: number }[] = [];
    for (const w of [...windows].sort((a, b) => toMin(a.start) - toMin(b.start))) {
      const s = toMin(w.start);
      const e = toMin(w.end);
      const last = merged[merged.length - 1];
      if (last && s <= last.e) {
        last.e = Math.max(last.e, e);
      } else {
        merged.push({ s, e });
      }
    }

    const availableSlots: { startTime: string; endTime: string; durationMin: number }[] = [];
    for (const w of merged) {
      const overlapping = busy.filter((b) => b.s < w.e && b.e > w.s);

      let cursor = w.s;
      const freeWindows: { s: number; e: number }[] = [];
      for (const b of overlapping) {
        if (b.s > cursor) freeWindows.push({ s: cursor, e: b.s });
        cursor = Math.max(cursor, b.e);
      }
      if (cursor < w.e) freeWindows.push({ s: cursor, e: w.e });

      for (const fw of freeWindows) {
        for (let t = fw.s; t + SLOT_MIN <= fw.e; t += SLOT_MIN) {
          availableSlots.push({
            startTime: fromMin(t),
            endTime: fromMin(t + SLOT_MIN),
            durationMin: SLOT_MIN,
          });
        }
      }
    }
    availableSlots.sort((a, b) => a.startTime.localeCompare(b.startTime));

    return NextResponse.json({
      data: {
        date: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        workingDay: true,
        sessions,
        availableSlots,
        summary: {
          sessionCount: sessions.length,
          bookedMin: sessions.reduce((sum, s) => sum + s.durationMin, 0),
          availableMin: availableSlots.length * SLOT_MIN,
        },
      },
    });
  } catch (error) {
    console.error('[GET /api/trainer/schedule/day] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
