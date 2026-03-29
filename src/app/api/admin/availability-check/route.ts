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

    // Fetch all active trainers
    const trainers = await prisma.trainerProfile.findMany({
      where: { branchId, user: { isActive: true } },
      include: { user: { select: { firstName: true, lastName: true } } },
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

      const workStart = trainer.workingHoursStart ?? '06:00';
      const workEnd = trainer.workingHoursEnd ?? '21:00';
      const workingDays =
        trainer.workingDays.length > 0 ? (trainer.workingDays as DayOfWeek[]) : DAYS_ORDER.slice();

      const dayMap = trainerDaySchedules.get(trainerId)!;
      const weekView = DAYS_ORDER.map((day) => {
        const isWorkingDay = workingDays.includes(day);
        if (!isWorkingDay) return { day, isWorkingDay: false, bookedSlots: [], freeWindows: [] };

        const daySched = dayMap.get(day) ?? [];
        const bookedSlots = daySched
          .map((s) => ({
            startTime: s.startTime,
            durationMin: s.durationMin,
            clientName: `${s.client.user.firstName} ${s.client.user.lastName}`,
          }))
          .sort((a, b) => a.startTime.localeCompare(b.startTime));

        // Compute free windows within working hours
        const toMin = (t: string) => {
          const [h, m] = t.split(':').map(Number);
          return h! * 60 + m!;
        };
        const fromMin = (m: number) =>
          `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
        const startM = toMin(workStart);
        const endM = toMin(workEnd);

        const busyIntervals = bookedSlots
          .map((s) => ({
            s: toMin(s.startTime),
            e: toMin(s.startTime) + s.durationMin,
          }))
          .sort((a, b) => a.s - b.s);

        const freeWindows: { startTime: string; endTime: string; durationMin: number }[] = [];
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

        return { day, isWorkingDay: true, workStart, workEnd, bookedSlots, freeWindows };
      });

      const totalSessions = schedules.filter((s) => s.trainerProfileId === trainerId).length;

      return NextResponse.json({
        trainer: {
          id: trainer.id,
          name: `${trainer.user.firstName} ${trainer.user.lastName}`,
          workingDays: workingDays,
          workStart,
          workEnd,
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
      for (const slotStart of allSlots) {
        const [sh, sm] = slotStart.split(':').map(Number);
        const endMin = sh! * 60 + sm! + durationMin;
        if (endMin > 21 * 60) continue; // slot would go past gym closing

        const slotEnd = `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;

        const freeTrainers: SlotResult['freeTrainers'] = [];
        let busyCount = 0;

        for (const trainer of trainers) {
          // Check trainer works this day
          const worksThisDay =
            trainer.workingDays.length === 0 || trainer.workingDays.includes(day as never);
          if (!worksThisDay) continue;

          // Check slot is within trainer's working hours
          const wStart = trainer.workingHoursStart ?? GYM_START;
          const wEnd = trainer.workingHoursEnd ?? GYM_END;
          if (slotStart < wStart || slotEnd > wEnd) continue;

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
        // Normalize: freeRatio + avgIdleness bonus
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

    return NextResponse.json({ durationMin, recommendations });
  } catch (error) {
    console.error('[GET /api/admin/availability-check] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
