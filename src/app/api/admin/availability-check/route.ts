import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { toErrorResponse } from '@/lib/errors';

const DAYS_ORDER = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
] as const;
type DayOfWeek = (typeof DAYS_ORDER)[number];

const ENUM_TO_WEEK_OFFSET: Record<DayOfWeek, number> = {
  MONDAY: 0,
  TUESDAY: 1,
  WEDNESDAY: 2,
  THURSDAY: 3,
  FRIDAY: 4,
  SATURDAY: 5,
  SUNDAY: 6,
};

/**
 * Returns the Monday of the week that contains `date`.
 * Uses noon (12:00) to avoid DST boundary issues.
 */
function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(12, 0, 0, 0);
  const dow = d.getDay(); // 0 = Sunday
  const offset = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + offset);
  return d;
}

/**
 * Returns the actual calendar date for a given day within the week whose
 * Monday is `weekMonday`.
 */
function getWeekDateForDay(weekMonday: Date, day: DayOfWeek): Date {
  const d = new Date(weekMonday);
  d.setDate(weekMonday.getDate() + ENUM_TO_WEEK_OFFSET[day]);
  return d;
}

type ShiftRecord = {
  startTime: string;
  endTime: string;
  days: string[];
  effectiveFrom: Date;
  effectiveUntil: Date | null;
};

/**
 * Returns the shifts that are active on a specific date for a specific day.
 * A shift is active if: effectiveFrom <= date < effectiveUntil (or effectiveUntil is null).
 */
function getShiftsActiveOnDate(shifts: ShiftRecord[], day: DayOfWeek, date: Date): ShiftRecord[] {
  return shifts.filter(
    (s) =>
      (s.days as string[]).includes(day) &&
      s.effectiveFrom <= date &&
      (s.effectiveUntil === null || s.effectiveUntil > date),
  );
}

// Generate 30-min slots between two HH:MM times
function generateSlots(start: string, end: string): string[] {
  const slots: string[] = [];
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let cur = sh! * 60 + sm!;
  const endMin = eh! * 60 + em!;
  while (cur < endMin) {
    const h = Math.floor(cur / 60);
    const m = cur % 60;
    slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    cur += 30;
  }
  return slots;
}

// Returns overlap minutes between [aStart, aStart+aDur) and [bStart, bStart+bDur)
function overlapMin(aStart: string, aDur: number, bStart: string, bDur: number): number {
  const toMin = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h! * 60 + m!;
  };
  const aS = toMin(aStart);
  const aE = aS + aDur;
  const bS = toMin(bStart);
  const bE = bS + bDur;
  return Math.max(0, Math.min(aE, bE) - Math.max(aS, bS));
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['SUPER_ADMIN', 'BRANCH_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const branchId = session.user.branchId;
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get('mode') ?? 'smart';
    const durationMin = Math.max(30, parseInt(searchParams.get('durationMin') ?? '60', 10));
    const trainerId = searchParams.get('trainerId');

    // weekOf: the reference date — we resolve shifts for the week containing this date.
    // Defaults to today so the existing behaviour (next-upcoming-week) is preserved
    // when no date is supplied.
    const weekOfParam = searchParams.get('weekOf');
    const weekOf = weekOfParam ? new Date(weekOfParam) : new Date();
    const weekMonday = getMondayOfWeek(weekOf);

    // Map each DayOfWeek to its actual calendar date in the selected week.
    const weekDateByDay = Object.fromEntries(
      DAYS_ORDER.map((day) => [day, getWeekDateForDay(weekMonday, day)]),
    ) as Record<DayOfWeek, Date>;

    const now = new Date();

    // Fetch all active trainers with all non-expired shifts as of the selected week's Monday.
    // Using weekMonday as the expiry boundary so that shifts expiring before the selected
    // week are excluded, while scheduled future shifts that will be active that week are included.
    const shiftCutoff = weekMonday < now ? weekMonday : now;
    const trainers = await prisma.trainerProfile.findMany({
      where: { branchId, user: { isActive: true } },
      include: {
        user: { select: { firstName: true, lastName: true } },
        shifts: {
          where: {
            OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: shiftCutoff } }],
          },
          orderBy: { effectiveFrom: 'asc' },
        },
      },
    });

    // Fetch all active schedules
    const schedules = await prisma.sessionSchedule.findMany({
      where: { branchId, isActive: true },
      select: {
        trainerProfileId: true,
        dayOfWeek: true,
        startTime: true,
        durationMin: true,
        client: { include: { user: { select: { firstName: true, lastName: true } } } },
      },
    });

    // Build map: trainerId -> dayOfWeek -> schedules
    const trainerDaySchedules = new Map<string, Map<DayOfWeek, typeof schedules>>();
    for (const t of trainers) {
      trainerDaySchedules.set(t.id, new Map());
    }
    for (const s of schedules) {
      const dayMap = trainerDaySchedules.get(s.trainerProfileId);
      if (!dayMap) continue;
      const existing = dayMap.get(s.dayOfWeek as DayOfWeek) ?? [];
      existing.push(s);
      dayMap.set(s.dayOfWeek as DayOfWeek, existing);
    }

    if (mode === 'daily') {
      // ── Daily snapshot — all trainers for one specific date ──────
      const dateParam = searchParams.get('date');
      const targetDate = dateParam ? new Date(`${dateParam}T12:00:00`) : new Date();
      const dow = targetDate.getDay(); // 0 = Sun
      const dayIndex = dow === 0 ? 6 : dow - 1; // 0 = Mon … 6 = Sun
      const day = DAYS_ORDER[dayIndex]!;

      const toMin = (t: string) => {
        const [h, m] = t.split(':').map(Number);
        return h! * 60 + m!;
      };
      const fromMin = (m: number) =>
        `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

      const trainerStatuses = trainers.map((trainer) => {
        const hasAnyShifts = trainer.shifts.length > 0;
        const dayShifts = hasAnyShifts
          ? getShiftsActiveOnDate(trainer.shifts, day, targetDate)
          : [
              {
                startTime: '06:00',
                endTime: '22:00',
                days: [day],
                effectiveFrom: now,
                effectiveUntil: null,
              },
            ];

        const isWorkingDay = dayShifts.length > 0;
        if (!isWorkingDay) {
          return {
            id: trainer.id,
            name: `${trainer.user.firstName} ${trainer.user.lastName}`,
            isWorkingDay: false,
            freeWindows: [] as { startTime: string; endTime: string; durationMin: number }[],
            bookedCount: 0,
          };
        }

        const workStart = dayShifts.map((s) => s.startTime).reduce((a, b) => (a < b ? a : b));
        const workEnd = dayShifts.map((s) => s.endTime).reduce((a, b) => (a > b ? a : b));

        const daySched = trainerDaySchedules.get(trainer.id)?.get(day) ?? [];
        const bookedSlots = daySched
          .map((s) => ({
            startTime: s.startTime,
            durationMin: s.durationMin,
            clientName: `${s.client.user.firstName} ${s.client.user.lastName}`,
          }))
          .sort((a, b) => a.startTime.localeCompare(b.startTime));

        const freeWindows: { startTime: string; endTime: string; durationMin: number }[] = [];
        for (const shiftWindow of dayShifts) {
          const startM = toMin(shiftWindow.startTime);
          const endM = toMin(shiftWindow.endTime);
          const busyIntervals = bookedSlots
            .map((s) => ({ s: toMin(s.startTime), e: toMin(s.startTime) + s.durationMin }))
            .filter((i) => i.s < endM && i.e > startM)
            .sort((a, b) => a.s - b.s);

          let cursor = startM;
          for (const interval of busyIntervals) {
            if (interval.s > cursor) {
              freeWindows.push({
                startTime: fromMin(cursor),
                endTime: fromMin(interval.s),
                durationMin: interval.s - cursor,
              });
            }
            cursor = Math.max(cursor, interval.e);
          }
          if (cursor < endM) {
            freeWindows.push({
              startTime: fromMin(cursor),
              endTime: fromMin(endM),
              durationMin: endM - cursor,
            });
          }
        }

        return {
          id: trainer.id,
          name: `${trainer.user.firstName} ${trainer.user.lastName}`,
          isWorkingDay: true,
          workStart,
          workEnd,
          freeWindows,
          bookedCount: bookedSlots.length,
        };
      });

      // Sort: working + has free windows first, then working + fully booked, then day off
      trainerStatuses.sort((a, b) => {
        const scoreA = a.isWorkingDay ? (a.freeWindows.length > 0 ? 2 : 1) : 0;
        const scoreB = b.isWorkingDay ? (b.freeWindows.length > 0 ? 2 : 1) : 0;
        return scoreB - scoreA;
      });

      return NextResponse.json({
        date: targetDate.toISOString().slice(0, 10),
        day,
        trainers: trainerStatuses,
      });
    }

    if (mode === 'trainer') {
      // ── Single trainer view ──────────────────────────────────────
      if (!trainerId) {
        return NextResponse.json(
          { error: 'trainerId required', code: 'VALIDATION_ERROR' },
          { status: 400 },
        );
      }

      const trainer = trainers.find((t) => t.id === trainerId);
      if (!trainer) {
        return NextResponse.json(
          { error: 'Trainer not found', code: 'NOT_FOUND' },
          { status: 404 },
        );
      }

      const toMin = (t: string) => {
        const [h, m] = t.split(':').map(Number);
        return h! * 60 + m!;
      };
      const fromMin = (m: number) =>
        `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

      const hasAnyShifts = trainer.shifts.length > 0;

      // Derive working days by checking which days have an active shift on their next date
      const workingDays: DayOfWeek[] = hasAnyShifts
        ? DAYS_ORDER.filter(
            (day) => getShiftsActiveOnDate(trainer.shifts, day, weekDateByDay[day]).length > 0,
          )
        : DAYS_ORDER.slice();

      // Overall earliest/latest across all currently-active shifts (for trainer summary card)
      const activeNowShifts = trainer.shifts.filter(
        (s) => s.effectiveFrom <= now && (s.effectiveUntil === null || s.effectiveUntil > now),
      );
      const summaryShifts = activeNowShifts.length > 0 ? activeNowShifts : trainer.shifts;
      const allStarts =
        summaryShifts.length > 0 ? summaryShifts.map((s) => s.startTime) : ['06:00'];
      const allEnds = summaryShifts.length > 0 ? summaryShifts.map((s) => s.endTime) : ['22:00'];
      const overallStart = allStarts.reduce((a, b) => (a < b ? a : b));
      const overallEnd = allEnds.reduce((a, b) => (a > b ? a : b));

      const dayMap = trainerDaySchedules.get(trainerId)!;
      const weekView = DAYS_ORDER.map((day) => {
        // Resolve shifts active on the next actual date for this day
        const nextDate = weekDateByDay[day];
        const dayShifts = hasAnyShifts
          ? getShiftsActiveOnDate(trainer.shifts, day, nextDate)
          : [
              {
                startTime: '06:00',
                endTime: '22:00',
                days: [day],
                effectiveFrom: now,
                effectiveUntil: null,
              },
            ];

        const isWorkingDay = dayShifts.length > 0;
        if (!isWorkingDay) return { day, isWorkingDay: false, bookedSlots: [], freeWindows: [] };

        // Use earliest start / latest end for the day's working window
        const workStart = dayShifts.map((s) => s.startTime).reduce((a, b) => (a < b ? a : b));
        const workEnd = dayShifts.map((s) => s.endTime).reduce((a, b) => (a > b ? a : b));

        const daySched = dayMap.get(day) ?? [];
        const bookedSlots = daySched
          .map((s) => ({
            startTime: s.startTime,
            durationMin: s.durationMin,
            clientName: `${s.client.user.firstName} ${s.client.user.lastName}`,
          }))
          .sort((a, b) => a.startTime.localeCompare(b.startTime));

        // Compute free windows within each shift's span
        const freeWindows: { startTime: string; endTime: string; durationMin: number }[] = [];
        for (const shiftWindow of dayShifts) {
          const startM = toMin(shiftWindow.startTime);
          const endM = toMin(shiftWindow.endTime);

          const busyIntervals = bookedSlots
            .map((s) => ({ s: toMin(s.startTime), e: toMin(s.startTime) + s.durationMin }))
            .filter((i) => i.s < endM && i.e > startM)
            .sort((a, b) => a.s - b.s);

          let cursor = startM;
          for (const interval of busyIntervals) {
            if (interval.s > cursor) {
              freeWindows.push({
                startTime: fromMin(cursor),
                endTime: fromMin(interval.s),
                durationMin: interval.s - cursor,
              });
            }
            cursor = Math.max(cursor, interval.e);
          }
          if (cursor < endM) {
            freeWindows.push({
              startTime: fromMin(cursor),
              endTime: fromMin(endM),
              durationMin: endM - cursor,
            });
          }
        }

        return {
          day,
          isWorkingDay: true,
          workStart,
          workEnd,
          shifts: dayShifts.map((s) => ({ startTime: s.startTime, endTime: s.endTime })),
          bookedSlots,
          freeWindows,
        };
      });

      const totalSessions = schedules.filter((s) => s.trainerProfileId === trainerId).length;

      return NextResponse.json({
        trainer: {
          id: trainer.id,
          name: `${trainer.user.firstName} ${trainer.user.lastName}`,
          workingDays,
          workStart: overallStart,
          workEnd: overallEnd,
          totalScheduledSessions: totalSessions,
        },
        weekView,
      });
    }

    // ── Smart slot finder ────────────────────────────────────────
    // For each day × each 30-min slot, score trainers
    const GYM_START = '05:00';
    const GYM_END = '21:00';
    const allSlots = generateSlots(GYM_START, GYM_END);

    // Count total sessions per trainer (workload)
    const trainerLoad = new Map<string, number>();
    for (const t of trainers) {
      trainerLoad.set(t.id, schedules.filter((s) => s.trainerProfileId === t.id).length);
    }
    const maxLoad = Math.max(1, ...Array.from(trainerLoad.values()));

    type SlotResult = {
      day: DayOfWeek;
      startTime: string;
      endTime: string;
      freeTrainers: { id: string; name: string; currentLoad: number }[];
      busyTrainerCount: number;
      score: number; // higher = better
    };

    const results: SlotResult[] = [];

    for (const day of DAYS_ORDER) {
      const nextDate = weekDateByDay[day];

      for (const slotStart of allSlots) {
        const [sh, sm] = slotStart.split(':').map(Number);
        const endMin = sh! * 60 + sm! + durationMin;
        if (endMin > 21 * 60) continue; // slot would go past gym closing

        const slotEnd = `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;

        const freeTrainers: SlotResult['freeTrainers'] = [];
        let busyCount = 0;

        for (const trainer of trainers) {
          // Resolve the shifts active for this trainer on the next occurrence of this day.
          // Zero shifts = all-day available (backward compat).
          if (trainer.shifts.length > 0) {
            const activeShifts = getShiftsActiveOnDate(trainer.shifts, day, nextDate);
            const fitsShift = activeShifts.some(
              (shift) => slotStart >= shift.startTime && slotEnd <= shift.endTime,
            );
            if (!fitsShift) continue;
          }

          // Check for conflicts in their schedule
          const daySchedules = trainerDaySchedules.get(trainer.id)?.get(day) ?? [];
          const isConflicted = daySchedules.some(
            (s) => overlapMin(slotStart, durationMin, s.startTime, s.durationMin) > 0,
          );

          if (isConflicted) {
            busyCount++;
          } else {
            const load = trainerLoad.get(trainer.id) ?? 0;
            freeTrainers.push({
              id: trainer.id,
              name: `${trainer.user.firstName} ${trainer.user.lastName}`,
              currentLoad: load,
            });
          }
        }

        if (freeTrainers.length === 0) continue;

        // Score: more free trainers = better; prefer less-loaded trainers
        const freeRatio = freeTrainers.length / Math.max(1, trainers.length);
        const avgLoadScore =
          freeTrainers.reduce((sum, t) => sum + (1 - t.currentLoad / maxLoad), 0) /
          freeTrainers.length;
        const score = freeRatio * 0.6 + avgLoadScore * 0.4;

        // Sort free trainers by load ascending (least busy first)
        freeTrainers.sort((a, b) => a.currentLoad - b.currentLoad);

        results.push({
          day,
          startTime: slotStart,
          endTime: slotEnd,
          freeTrainers,
          busyTrainerCount: busyCount,
          score,
        });
      }
    }

    // Group by day, take top 5 slots per day sorted by score desc
    const byDay: Partial<Record<DayOfWeek, SlotResult[]>> = {};
    for (const r of results) {
      if (!byDay[r.day]) byDay[r.day] = [];
      byDay[r.day]!.push(r);
    }

    const recommendations = DAYS_ORDER.map((day) => {
      const slots = (byDay[day] ?? []).sort((a, b) => b.score - a.score).slice(0, 5);
      return { day, slots };
    }).filter((d) => d.slots.length > 0);

    return NextResponse.json({
      durationMin,
      weekOf: weekMonday.toISOString().slice(0, 10),
      recommendations,
    });
  } catch (error) {
    console.error('[GET /api/admin/availability-check] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
