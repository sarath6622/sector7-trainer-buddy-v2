import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';
import { AppError } from '@/lib/errors';
import type { Prisma } from '@prisma/client';
import type { RoutineInput, RoutineProgramInput } from '@/lib/validators';

/**
 * Training routines (ADR-053) — Hevy-style routines grouped into programs.
 *
 * A LIBRARY program (`clientProfileId = null`) is a branch template that
 * trainers and admins author. ASSIGNING deep-copies it into a CLIENT COPY
 * (`clientProfileId` set); library edits never reach existing copies, and a
 * client has at most one active copy. A trainer applies one of the client's
 * routines to an in-progress session, which links the session
 * (`SessionInstance.routineId`) and adds the routine's exercises as zero-set
 * WorkoutLogs — the logger then shows the targets beside each card.
 */

const STAFF_ROLES = ['TRAINER', 'BRANCH_ADMIN', 'SUPER_ADMIN'];
const ADMIN_ROLES = ['BRANCH_ADMIN', 'SUPER_ADMIN'];

export interface RoutineActor {
  userId: string;
  roles: string[];
  trainerProfileId: string | null;
  clientProfileId: string | null;
}

/** Maps the NextAuth session user onto the actor the service authorizes. */
export function toRoutineActor(user: {
  id: string;
  role?: string;
  roles?: string[];
  trainerProfileId?: string | null;
  clientProfileId?: string | null;
}): RoutineActor {
  return {
    userId: user.id,
    // Older tokens may carry only the primary role.
    roles: user.roles && user.roles.length > 0 ? user.roles : user.role ? [user.role] : [],
    trainerProfileId: user.trainerProfileId ?? null,
    clientProfileId: user.clientProfileId ?? null,
  };
}

function hasAnyRole(roles: string[], allowed: string[]): boolean {
  return roles.some((r) => allowed.includes(r));
}

export function isRoutineStaff(roles: string[]): boolean {
  return hasAnyRole(roles, STAFF_ROLES);
}

// ─── Selects ─────────────────────────────────────────────────────────────────

const ROUTINE_SET_SELECT = {
  setNumber: true,
  setType: true,
  targetRepsMin: true,
  targetRepsMax: true,
  targetWeightKg: true,
  targetDurationSec: true,
  targetStepsCount: true,
  targetDistance: true,
} satisfies Prisma.RoutineSetSelect;

const PROGRAM_DETAIL_SELECT = {
  id: true,
  name: true,
  notes: true,
  clientProfileId: true,
  sourceProgramId: true,
  isActive: true,
  isArchived: true,
  updatedAt: true,
  routines: {
    orderBy: { orderIndex: 'asc' },
    select: {
      id: true,
      name: true,
      notes: true,
      orderIndex: true,
      exercises: {
        orderBy: { orderIndex: 'asc' },
        select: {
          id: true,
          exerciseId: true,
          orderIndex: true,
          restSec: true,
          notes: true,
          exercise: {
            select: {
              id: true,
              name: true,
              targetMuscleGroup: true,
              category: true,
              exerciseType: true,
              secondaryMetric: true,
            },
          },
          sets: { orderBy: { setNumber: 'asc' }, select: ROUTINE_SET_SELECT },
        },
      },
    },
  },
} satisfies Prisma.RoutineProgramSelect;

/**
 * The `routine` block both session read paths (trainer + client) embed so the
 * WorkoutLogger can render targets on either device after any reload.
 * Routine notes are coaching cues — client-visible by design (unlike the
 * trainer-private WorkoutLog.notes, ADR-052).
 */
export const SESSION_ROUTINE_SELECT = {
  id: true,
  name: true,
  notes: true,
  exercises: {
    orderBy: { orderIndex: 'asc' },
    select: {
      exerciseId: true,
      orderIndex: true,
      restSec: true,
      notes: true,
      sets: { orderBy: { setNumber: 'asc' }, select: ROUTINE_SET_SELECT },
    },
  },
} satisfies Prisma.RoutineSelect;

export type ProgramDetail = Prisma.RoutineProgramGetPayload<{
  select: typeof PROGRAM_DETAIL_SELECT;
}>;

// ─── Pure helpers ────────────────────────────────────────────────────────────

/**
 * "Next up" rotation (operator decision 2026-10-18 — rotation, not fixed
 * weekdays). The routine after the last one used, wrapping around; the first
 * routine when none has been used yet or the last-used one no longer exists.
 */
export function pickNextRoutineId(
  routines: { id: string; orderIndex: number }[],
  lastUsedRoutineId: string | null,
): string | null {
  if (routines.length === 0) return null;
  const ordered = [...routines].sort((a, b) => a.orderIndex - b.orderIndex);
  const first = ordered[0];
  if (!first) return null;
  const idx = lastUsedRoutineId ? ordered.findIndex((r) => r.id === lastUsedRoutineId) : -1;
  if (idx === -1) return first.id;
  return ordered[(idx + 1) % ordered.length]?.id ?? first.id;
}

function blankToNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function routineExercisesCreate(
  routine: RoutineInput,
): Prisma.RoutineExerciseUncheckedCreateWithoutRoutineInput[] {
  return routine.exercises.map((ex, exIdx) => ({
    exerciseId: ex.exerciseId,
    orderIndex: exIdx,
    restSec: ex.restSec ?? null,
    notes: blankToNull(ex.notes),
    sets: {
      create: ex.sets.map((s, setIdx) => ({
        setNumber: setIdx + 1,
        setType: s.setType ?? 'NORMAL',
        targetRepsMin: s.targetRepsMin ?? null,
        targetRepsMax: s.targetRepsMax ?? null,
        targetWeightKg: s.targetWeightKg ?? null,
        targetDurationSec: s.targetDurationSec ?? null,
        targetStepsCount: s.targetStepsCount ?? null,
        targetDistance: s.targetDistance ?? null,
      })),
    },
  }));
}

function routinesCreate(input: RoutineProgramInput): Prisma.RoutineCreateWithoutProgramInput[] {
  return input.routines.map((r, idx) => ({
    name: r.name.trim(),
    notes: blankToNull(r.notes),
    orderIndex: idx,
    exercises: { create: routineExercisesCreate(r) },
  }));
}

/** Converts a stored program back into editor input — used by the deep copy. */
export function programToInput(program: ProgramDetail): RoutineProgramInput {
  return {
    name: program.name,
    notes: program.notes,
    routines: program.routines.map((r) => ({
      name: r.name,
      notes: r.notes,
      exercises: r.exercises.map((e) => ({
        exerciseId: e.exerciseId,
        restSec: e.restSec,
        notes: e.notes,
        sets: e.sets.map((s) => ({
          setType: s.setType,
          targetRepsMin: s.targetRepsMin,
          targetRepsMax: s.targetRepsMax,
          targetWeightKg: s.targetWeightKg,
          targetDurationSec: s.targetDurationSec,
          targetStepsCount: s.targetStepsCount,
          targetDistance: s.targetDistance,
        })),
      })),
    })),
  };
}

function programAuditSummary(input: RoutineProgramInput) {
  return {
    name: input.name,
    routines: input.routines.map((r) => ({ name: r.name, exercises: r.exercises.length })),
  };
}

// ─── Guards ──────────────────────────────────────────────────────────────────

function assertStaff(actor: RoutineActor) {
  if (!isRoutineStaff(actor.roles)) {
    throw new AppError('ROUTINE_FORBIDDEN', 'Only trainers and admins can manage routines', 403);
  }
}

/**
 * Operator decision 2026-10-18: admins manage any client in the branch;
 * trainers only clients they hold an active PT package with.
 */
export async function assertCanManageClient(
  actor: RoutineActor,
  clientProfileId: string,
  branchId: string,
): Promise<void> {
  const client = await prisma.clientProfile.findFirst({
    where: { id: clientProfileId, branchId },
    select: { id: true },
  });
  if (!client) {
    throw new AppError('CLIENT_NOT_FOUND', 'Client not found', 404);
  }
  if (hasAnyRole(actor.roles, ADMIN_ROLES)) return;

  if (hasAnyRole(actor.roles, ['TRAINER']) && actor.trainerProfileId) {
    const pkg = await prisma.ptPackage.findFirst({
      where: {
        branchId,
        clientProfileId,
        trainerProfileId: actor.trainerProfileId,
        isActive: true,
      },
      select: { id: true },
    });
    if (pkg) return;
  }
  throw new AppError(
    'ROUTINE_FORBIDDEN',
    'You can only manage programs for clients you currently train',
    403,
  );
}

async function assertExercisesExist(input: RoutineProgramInput): Promise<void> {
  const ids = [...new Set(input.routines.flatMap((r) => r.exercises.map((e) => e.exerciseId)))];
  const found = await prisma.exercise.findMany({
    where: { id: { in: ids }, isActive: true },
    select: { id: true },
  });
  if (found.length !== ids.length) {
    throw new AppError('INVALID_EXERCISE', 'One or more exercises no longer exist', 422);
  }
}

async function getProgramDetailOrThrow(programId: string, branchId: string) {
  const program = await prisma.routineProgram.findFirst({
    where: { id: programId, branchId },
    select: PROGRAM_DETAIL_SELECT,
  });
  if (!program) {
    throw new AppError('PROGRAM_NOT_FOUND', 'Program not found', 404);
  }
  return program;
}

// ─── Library ─────────────────────────────────────────────────────────────────

export async function listLibraryPrograms({
  branchId,
  includeArchived = false,
}: {
  branchId: string;
  includeArchived?: boolean;
}) {
  const programs = await prisma.routineProgram.findMany({
    where: {
      branchId,
      clientProfileId: null,
      ...(includeArchived ? {} : { isArchived: false }),
    },
    orderBy: [{ isArchived: 'asc' }, { updatedAt: 'desc' }],
    select: {
      id: true,
      name: true,
      notes: true,
      isArchived: true,
      updatedAt: true,
      routines: {
        orderBy: { orderIndex: 'asc' },
        select: { id: true, name: true, _count: { select: { exercises: true } } },
      },
    },
  });

  return programs.map((p) => ({
    id: p.id,
    name: p.name,
    notes: p.notes,
    isArchived: p.isArchived,
    updatedAt: p.updatedAt,
    routineCount: p.routines.length,
    exerciseCount: p.routines.reduce((sum, r) => sum + r._count.exercises, 0),
    routines: p.routines.map((r) => ({
      id: r.id,
      name: r.name,
      exerciseCount: r._count.exercises,
    })),
  }));
}

/**
 * Non-archived library programs, fully nested — what the session logger's
 * "Choose a program" step needs in one round trip instead of list + one
 * detail fetch per program.
 */
export async function listLibraryProgramDetails({
  branchId,
  take,
}: {
  branchId: string;
  take?: number;
}) {
  return prisma.routineProgram.findMany({
    where: { branchId, clientProfileId: null, isArchived: false },
    orderBy: { updatedAt: 'desc' },
    take,
    select: PROGRAM_DETAIL_SELECT,
  });
}

export async function createLibraryProgram({
  input,
  branchId,
  actor,
}: {
  input: RoutineProgramInput;
  branchId: string;
  actor: RoutineActor;
}) {
  assertStaff(actor);
  await assertExercisesExist(input);

  const created = await prisma.routineProgram.create({
    data: {
      branchId,
      clientProfileId: null,
      name: input.name.trim(),
      notes: blankToNull(input.notes),
      createdByUserId: actor.userId,
      routines: { create: routinesCreate(input) },
    },
    select: PROGRAM_DETAIL_SELECT,
  });

  await auditLog({
    action: 'ROUTINE_PROGRAM_CREATED',
    actorId: actor.userId,
    subjectType: 'RoutineProgram',
    subjectId: created.id,
    branchId,
    newValue: programAuditSummary(input),
  });

  return created;
}

/**
 * Read one program. Library programs: staff. Client copies: staff, or the
 * client who owns the copy.
 */
export async function getProgram({
  programId,
  branchId,
  actor,
}: {
  programId: string;
  branchId: string;
  actor: RoutineActor;
}) {
  const program = await getProgramDetailOrThrow(programId, branchId);
  if (isRoutineStaff(actor.roles)) return program;
  if (program.clientProfileId && program.clientProfileId === actor.clientProfileId) {
    return program;
  }
  // 404, not 403: don't confirm the id exists to someone who can't see it.
  throw new AppError('PROGRAM_NOT_FOUND', 'Program not found', 404);
}

/**
 * Replace the full nested document. Routines whose `id` is sent back are
 * updated in place (so sessions linked to them stay linked); routines left
 * out are deleted (their sessions' routineId goes NULL via the FK); new ones
 * are created. Exercises and sets are always recreated — nothing outside the
 * program references them.
 */
export async function updateProgram({
  programId,
  input,
  branchId,
  actor,
}: {
  programId: string;
  input: RoutineProgramInput;
  branchId: string;
  actor: RoutineActor;
}) {
  const existing = await prisma.routineProgram.findFirst({
    where: { id: programId, branchId },
    select: {
      id: true,
      name: true,
      clientProfileId: true,
      isArchived: true,
      routines: { select: { id: true, name: true } },
    },
  });
  if (!existing) {
    throw new AppError('PROGRAM_NOT_FOUND', 'Program not found', 404);
  }
  if (existing.clientProfileId) {
    await assertCanManageClient(actor, existing.clientProfileId, branchId);
  } else {
    assertStaff(actor);
  }
  await assertExercisesExist(input);

  const existingIds = new Set(existing.routines.map((r) => r.id));
  const keptIds = new Set(
    input.routines.map((r) => r.id).filter((id): id is string => !!id && existingIds.has(id)),
  );
  const removedIds = [...existingIds].filter((id) => !keptIds.has(id));

  await prisma.$transaction(async (tx) => {
    await tx.routineProgram.update({
      where: { id: programId },
      data: { name: input.name.trim(), notes: blankToNull(input.notes) },
    });
    if (removedIds.length > 0) {
      await tx.routine.deleteMany({ where: { id: { in: removedIds }, programId } });
    }
    for (const [idx, routine] of input.routines.entries()) {
      const base = {
        name: routine.name.trim(),
        notes: blankToNull(routine.notes),
        orderIndex: idx,
      };
      if (routine.id && keptIds.has(routine.id)) {
        await tx.routineExercise.deleteMany({ where: { routineId: routine.id } });
        await tx.routine.update({
          where: { id: routine.id },
          data: { ...base, exercises: { create: routineExercisesCreate(routine) } },
        });
      } else {
        await tx.routine.create({
          data: { ...base, programId, exercises: { create: routineExercisesCreate(routine) } },
        });
      }
    }
  });

  await auditLog({
    action: 'ROUTINE_PROGRAM_UPDATED',
    actorId: actor.userId,
    subjectType: 'RoutineProgram',
    subjectId: programId,
    branchId,
    oldValue: { name: existing.name, routines: existing.routines.map((r) => r.name) },
    newValue: programAuditSummary(input),
    metadata: {
      clientProfileId: existing.clientProfileId,
      removedRoutineIds: removedIds,
    },
  });

  return getProgramDetailOrThrow(programId, branchId);
}

/** Soft-archive a library program. Client copies go through unassign. */
export async function archiveLibraryProgram({
  programId,
  branchId,
  actor,
}: {
  programId: string;
  branchId: string;
  actor: RoutineActor;
}) {
  assertStaff(actor);
  const existing = await prisma.routineProgram.findFirst({
    where: { id: programId, branchId, clientProfileId: null },
    select: { id: true, name: true, isArchived: true },
  });
  if (!existing) {
    throw new AppError('PROGRAM_NOT_FOUND', 'Program not found', 404);
  }
  if (!existing.isArchived) {
    await prisma.routineProgram.update({
      where: { id: programId },
      data: { isArchived: true },
    });
    await auditLog({
      action: 'ROUTINE_PROGRAM_ARCHIVED',
      actorId: actor.userId,
      subjectType: 'RoutineProgram',
      subjectId: programId,
      branchId,
      oldValue: { isArchived: false },
      newValue: { isArchived: true },
      metadata: { name: existing.name },
    });
  }
  return { id: programId };
}

// ─── Client assignment ───────────────────────────────────────────────────────

/**
 * Deep-copy a library program to a client (Hevy Coach "Copy Program to
 * Client") and deactivate the client's previous copy in the same
 * transaction. Old copies are kept — sessions that used their routines stay
 * linked for history.
 */
export async function assignProgram({
  programId,
  clientProfileId,
  branchId,
  actor,
}: {
  programId: string;
  clientProfileId: string;
  branchId: string;
  actor: RoutineActor;
}) {
  const source = await prisma.routineProgram.findFirst({
    where: { id: programId, branchId, clientProfileId: null, isArchived: false },
    select: PROGRAM_DETAIL_SELECT,
  });
  if (!source) {
    throw new AppError('PROGRAM_NOT_FOUND', 'Program not found', 404);
  }
  await assertCanManageClient(actor, clientProfileId, branchId);

  const copyInput = programToInput(source);
  const { copy, replacedIds } = await prisma.$transaction(async (tx) => {
    const previous = await tx.routineProgram.findMany({
      where: { branchId, clientProfileId, isActive: true },
      select: { id: true },
    });
    if (previous.length > 0) {
      await tx.routineProgram.updateMany({
        where: { id: { in: previous.map((p) => p.id) } },
        data: { isActive: false },
      });
    }
    const created = await tx.routineProgram.create({
      data: {
        branchId,
        clientProfileId,
        sourceProgramId: source.id,
        name: copyInput.name,
        notes: copyInput.notes ?? null,
        isActive: true,
        createdByUserId: actor.userId,
        routines: { create: routinesCreate(copyInput) },
      },
      select: PROGRAM_DETAIL_SELECT,
    });
    return { copy: created, replacedIds: previous.map((p) => p.id) };
  });

  await auditLog({
    action: 'ROUTINE_PROGRAM_ASSIGNED',
    actorId: actor.userId,
    subjectType: 'RoutineProgram',
    subjectId: copy.id,
    branchId,
    newValue: programAuditSummary(copyInput),
    metadata: { clientProfileId, sourceProgramId: source.id, replacedProgramIds: replacedIds },
  });

  return copy;
}

/** The client's active copy plus the "Next up" rotation pointer. */
export async function getActiveClientProgram({
  clientProfileId,
  branchId,
}: {
  clientProfileId: string;
  branchId: string;
}) {
  const program = await prisma.routineProgram.findFirst({
    where: { branchId, clientProfileId, isActive: true, isArchived: false },
    orderBy: { createdAt: 'desc' },
    select: PROGRAM_DETAIL_SELECT,
  });
  if (!program) return null;

  const routineIds = program.routines.map((r) => r.id);
  const last =
    routineIds.length > 0
      ? await prisma.sessionInstance.findFirst({
          // Only sessions that were actually trained count toward the rotation:
          // live or completed (not cancelled / no-show) with at least one set
          // logged. A routine started then abandoned, or emptied, doesn't
          // advance "Next up".
          where: {
            branchId,
            clientProfileId,
            routineId: { in: routineIds },
            status: { in: ['IN_PROGRESS', 'COMPLETED'] },
            workoutLogs: { some: { sets: { some: {} } } },
          },
          orderBy: [{ scheduledDate: 'desc' }, { startedAt: { sort: 'desc', nulls: 'last' } }],
          select: { id: true, routineId: true, scheduledDate: true },
        })
      : null;

  return {
    ...program,
    nextRoutineId: pickNextRoutineId(program.routines, last?.routineId ?? null),
    lastUsed:
      last && last.routineId
        ? { routineId: last.routineId, sessionId: last.id, scheduledDate: last.scheduledDate }
        : null,
  };
}

export async function unassignClientProgram({
  clientProfileId,
  branchId,
  actor,
}: {
  clientProfileId: string;
  branchId: string;
  actor: RoutineActor;
}) {
  await assertCanManageClient(actor, clientProfileId, branchId);
  const active = await prisma.routineProgram.findMany({
    where: { branchId, clientProfileId, isActive: true },
    select: { id: true, name: true },
  });
  if (active.length === 0) return null;

  await prisma.routineProgram.updateMany({
    where: { id: { in: active.map((p) => p.id) } },
    data: { isActive: false },
  });
  for (const p of active) {
    await auditLog({
      action: 'ROUTINE_PROGRAM_UNASSIGNED',
      actorId: actor.userId,
      subjectType: 'RoutineProgram',
      subjectId: p.id,
      branchId,
      oldValue: { isActive: true },
      newValue: { isActive: false },
      metadata: { clientProfileId, name: p.name },
    });
  }
  return { id: active[0]?.id ?? '' };
}

// ─── Sessions ────────────────────────────────────────────────────────────────

async function getTrainerOwnedSession(sessionId: string, branchId: string, actor: RoutineActor) {
  const session = await prisma.sessionInstance.findFirst({
    where: { id: sessionId, branchId },
    select: {
      id: true,
      status: true,
      trainerProfileId: true,
      clientProfileId: true,
      routineId: true,
    },
  });
  if (!session) {
    throw new AppError('SESSION_NOT_FOUND', 'Session not found', 404);
  }
  // Operator decision 2026-10-18: clients cannot start a routine — only the
  // session's own trainer applies or detaches one.
  if (!actor.trainerProfileId || session.trainerProfileId !== actor.trainerProfileId) {
    throw new AppError('SESSION_FORBIDDEN', 'Only the session trainer can do this', 403);
  }
  return session;
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Remove the exercises a routine put into the session that nobody has touched
 * yet — no sets, not marked complete, no note. Anything with logged work stays,
 * so switching or removing a routine never deletes a workout. `keepExerciseIds`
 * are left alone (they're also in the routine being switched to).
 */
async function removeUntouchedRoutineExercises(
  tx: Tx,
  sessionId: string,
  routineId: string,
  keepExerciseIds: Set<string> = new Set(),
): Promise<string[]> {
  const routineExercises = await tx.routineExercise.findMany({
    where: { routineId },
    select: { exerciseId: true },
  });
  const candidates = routineExercises
    .map((e) => e.exerciseId)
    .filter((id) => !keepExerciseIds.has(id));
  if (candidates.length === 0) return [];

  const untouched = await tx.workoutLog.findMany({
    where: {
      sessionInstanceId: sessionId,
      exerciseId: { in: candidates },
      isCompleted: false,
      sets: { none: {} },
      OR: [{ notes: null }, { notes: '' }],
    },
    select: { id: true, exerciseId: true },
  });
  if (untouched.length > 0) {
    await tx.workoutLog.deleteMany({ where: { id: { in: untouched.map((l) => l.id) } } });
  }
  return [...new Set(untouched.map((l) => l.exerciseId))];
}

/**
 * Apply a routine to an in-progress session: link it and add its exercises as
 * zero-set WorkoutLogs (the ADR-041 "added but not yet logged" shape), after
 * anything already logged. Idempotent — exercises already in the session are
 * skipped, so a double tap or a second apply adds nothing. Server-side so the
 * client's device picks it up through the normal WORKOUT_UPDATED refetch.
 */
export async function applyRoutineToSession({
  sessionId,
  routineId,
  branchId,
  actor,
}: {
  sessionId: string;
  routineId: string;
  branchId: string;
  actor: RoutineActor;
}) {
  const session = await getTrainerOwnedSession(sessionId, branchId, actor);
  if (session.status !== 'IN_PROGRESS') {
    throw new AppError('SESSION_NOT_ACTIVE', 'Start the session before applying a routine', 409);
  }

  const routine = await prisma.routine.findFirst({
    where: {
      id: routineId,
      program: {
        branchId,
        clientProfileId: session.clientProfileId,
        isActive: true,
        isArchived: false,
      },
    },
    select: {
      id: true,
      name: true,
      exercises: { orderBy: { orderIndex: 'asc' }, select: { exerciseId: true } },
    },
  });
  if (!routine) {
    throw new AppError('ROUTINE_NOT_FOUND', "Routine not found in this client's program", 404);
  }

  const result = await prisma.$transaction(async (tx) => {
    // Switching from another routine: clear that routine's untouched
    // exercises first (shared ones stay), so a mis-tapped day is undoable.
    const removed =
      session.routineId && session.routineId !== routine.id
        ? await removeUntouchedRoutineExercises(
            tx,
            sessionId,
            session.routineId,
            new Set(routine.exercises.map((e) => e.exerciseId)),
          )
        : [];

    const existing = await tx.workoutLog.findMany({
      where: { sessionInstanceId: sessionId },
      select: { exerciseId: true, orderIndex: true },
    });
    const present = new Set(existing.map((l) => l.exerciseId));
    const nextOrder = existing.reduce((max, l) => Math.max(max, l.orderIndex), -1) + 1;

    const toAdd = routine.exercises.map((e) => e.exerciseId).filter((id) => !present.has(id));
    const skipped = routine.exercises.map((e) => e.exerciseId).filter((id) => present.has(id));

    if (toAdd.length > 0) {
      await tx.workoutLog.createMany({
        data: toAdd.map((exerciseId, i) => ({
          sessionInstanceId: sessionId,
          exerciseId,
          orderIndex: nextOrder + i,
        })),
      });
    }
    await tx.sessionInstance.update({
      where: { id: sessionId },
      data: { routineId: routine.id },
    });
    return {
      routineId: routine.id,
      addedExerciseIds: toAdd,
      skippedExerciseIds: skipped,
      removedExerciseIds: removed,
    };
  });

  await auditLog({
    action: 'SESSION_ROUTINE_APPLIED',
    actorId: actor.userId,
    subjectType: 'SessionInstance',
    subjectId: sessionId,
    branchId,
    oldValue: { routineId: session.routineId },
    newValue: { routineId: routine.id },
    metadata: {
      routineName: routine.name,
      clientProfileId: session.clientProfileId,
      addedExerciseIds: result.addedExerciseIds,
      skippedExerciseIds: result.skippedExerciseIds,
      removedExerciseIds: result.removedExerciseIds,
    },
  });

  return result;
}

/**
 * Unlink the routine and take back the exercises it added that are still
 * untouched. Exercises with logged work stay in the session.
 */
export async function detachRoutineFromSession({
  sessionId,
  branchId,
  actor,
}: {
  sessionId: string;
  branchId: string;
  actor: RoutineActor;
}) {
  const session = await getTrainerOwnedSession(sessionId, branchId, actor);
  const previousRoutineId = session.routineId;
  if (!previousRoutineId) return { routineId: null, removedExerciseIds: [] as string[] };

  const removedExerciseIds = await prisma.$transaction(async (tx) => {
    const removed = await removeUntouchedRoutineExercises(tx, sessionId, previousRoutineId);
    await tx.sessionInstance.update({
      where: { id: sessionId },
      data: { routineId: null },
    });
    return removed;
  });

  await auditLog({
    action: 'SESSION_ROUTINE_DETACHED',
    actorId: actor.userId,
    subjectType: 'SessionInstance',
    subjectId: sessionId,
    branchId,
    oldValue: { routineId: previousRoutineId },
    newValue: { routineId: null },
    metadata: { removedExerciseIds },
  });
  return { routineId: null, removedExerciseIds };
}
