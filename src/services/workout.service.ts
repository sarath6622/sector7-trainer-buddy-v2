import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';
import { AppError } from '@/lib/errors';
import { triggerPrCelebrated, triggerLeaderboardChanged } from '@/lib/pusher';
import {
  evaluatePRBadges,
  evaluateWeightLiftedBadges,
  evaluateExerciseMilestoneBadges,
  type NewBadge,
} from '@/services/badge.service';
import { createPost } from '@/services/community.service';
import { assertSessionAccess } from '@/services/session.service';
import {
  invalidateTvDashboardCacheForBranch,
  resolveCompoundSlotKey,
} from '@/services/tv-dashboard.service';
import { invalidateTvLiveCacheForBranch } from '@/services/tv-live.service';

interface WorkoutSetInput {
  setNumber: number;
  reps?: number;
  weightKg?: number;
  durationSec?: number;
  rpe?: number;
  restSec?: number;
  stepsCount?: number;
  notes?: string;
}

interface WorkoutEntryInput {
  exerciseId: string;
  orderIndex: number;
  sets: WorkoutSetInput[];
  // Optional — when omitted the existing isCompleted on the row is preserved
  // (auto-save fires every ~800ms; a keystroke that doesn't touch the
  // toggle must not clobber it). When provided, the service syncs both the
  // boolean and completedAt timestamp.
  isCompleted?: boolean;
}

/**
 * Actor identity for workout mutations. Either the trainer of the session
 * or the client themselves may log workouts (see ADR-036). One of
 * `actorTrainerProfileId` / `actorClientProfileId` must be set; both may be
 * set when the same User has both profiles. assertSessionAccess validates
 * that the actor owns the session.
 */
interface WorkoutActor {
  actorUserId: string;
  actorTrainerProfileId: string | null;
  actorClientProfileId: string | null;
  branchId: string;
}

interface CreateWorkoutInput extends WorkoutActor {
  sessionInstanceId: string;
  exercises: WorkoutEntryInput[];
  // Concurrency scoping (ADR-036). When provided, the write touches ONLY these
  // exercises instead of replacing the session's whole log set, so two devices
  // (trainer + client) editing different exercises don't clobber each other:
  //   • dirtyExerciseIds — exercises whose sets/order/completion this device
  //     changed; only these get reconciled (upsert + drop sets removed within).
  //   • removedExerciseIds — exercises this device explicitly deleted; only
  //     these logs are dropped.
  // Exercises in `exercises` but absent from `dirtyExerciseIds` are left
  // untouched on the server. When `dirtyExerciseIds` is undefined the service
  // falls back to legacy full-replace (delete-by-absence) for older callers.
  dirtyExerciseIds?: string[];
  removedExerciseIds?: string[];
  // Per-set scoping within dirty exercises: the set numbers this device
  // explicitly deleted. When present (even as an empty object) set deletion
  // inside a dirty exercise is limited to exactly these — set rows the writer
  // has never seen (a peer's concurrent additions to the same exercise)
  // survive. When absent (pre-per-set bundles) a dirty exercise's sets
  // reconcile by absence from the payload, as before.
  removedSetsByExerciseId?: Record<string, number[]>;
}

interface UpdateWorkoutLogInput extends WorkoutActor {
  workoutLogId: string;
  sets?: WorkoutSetInput[];
}

interface DeleteWorkoutLogInput extends WorkoutActor {
  workoutLogId: string;
}

interface GetSessionWorkoutsInput {
  sessionInstanceId: string;
  branchId: string;
}

interface ListClientWorkoutsInput {
  clientProfileId: string;
  branchId: string;
  dateFrom?: string;
  dateTo?: string;
  exerciseId?: string;
  muscleGroup?: string;
}

/**
 * Create workout logs for a session (batch of exercises with sets).
 *
 * Authorization: caller must be either the trainer or the client of the
 * session (see ADR-036). assertSessionAccess raises before any mutation
 * runs.
 */
export async function createWorkoutLogs({
  sessionInstanceId,
  exercises,
  dirtyExerciseIds,
  removedExerciseIds,
  removedSetsByExerciseId,
  actorUserId,
  actorTrainerProfileId,
  actorClientProfileId,
  branchId,
}: CreateWorkoutInput) {
  // assertSessionAccess returns the session row scoped to branch and verifies
  // the actor (trainer OR client of this session) is allowed to write.
  const session = await assertSessionAccess({
    sessionId: sessionInstanceId,
    branchId,
    trainerProfileId: actorTrainerProfileId,
    clientProfileId: actorClientProfileId,
  });

  // Re-read the full row — assertSessionAccess returns a narrow select that
  // omits scheduledDate / startedAt which the auto-post path needs below.
  // Client name + photo are needed for the PR_CELEBRATED Pusher payload (ADR-038).
  const fullSession = await prisma.sessionInstance.findFirst({
    where: { id: sessionInstanceId, branchId },
    select: {
      id: true,
      branchId: true,
      status: true,
      clientProfileId: true,
      trainerProfileId: true,
      scheduledDate: true,
      startedAt: true,
      client: {
        select: {
          user: { select: { firstName: true, lastName: true, profileImageUrl: true } },
        },
      },
    },
  });
  if (!fullSession) {
    // Defensive: assertSessionAccess succeeded so this can only fire under a
    // racing delete. Treat as not-found rather than a generic 500.
    throw new AppError('SESSION_NOT_FOUND', 'Session not found', 404);
  }

  if (session.status !== 'IN_PROGRESS' && session.status !== 'COMPLETED') {
    throw new AppError(
      'INVALID_STATUS',
      'Can only log workouts for active or completed sessions',
      400,
    );
  }

  // Verify all exercises exist
  const exerciseIds = exercises.map((e) => e.exerciseId);
  const existingExercises = await prisma.exercise.findMany({
    where: { id: { in: exerciseIds }, isActive: true },
    select: { id: true },
  });
  const existingIds = new Set(existingExercises.map((e) => e.id));

  const missingIds = exerciseIds.filter((id) => !existingIds.has(id));
  if (missingIds.length > 0) {
    throw new AppError('EXERCISE_NOT_FOUND', `Exercises not found: ${missingIds.join(', ')}`, 404);
  }

  // Reconcile incoming payload with existing logs, preserving createdAt on
  // unchanged rows. Auto-save fires every ~800ms, so a naïve delete-and-
  // recreate would bump every timestamp on every keystroke and destroy the
  // audit trail (admins need to know "when did the trainer add Bench Press"
  // and "how long between exercises"). The upsert path keeps WorkoutLog and
  // WorkoutSet identities stable across saves.
  const workoutLogs = await prisma.$transaction(async (tx) => {
    const existingLogs = await tx.workoutLog.findMany({
      where: { sessionInstanceId },
      include: { sets: true },
    });
    const existingByExId = new Map(existingLogs.map((l) => [l.exerciseId, l]));
    const incomingExIds = new Set(exercises.map((e) => e.exerciseId));

    // Scoped mode (ADR-036): the caller told us exactly what it changed, so we
    // only touch those exercises and a stale peer snapshot can't clobber the
    // other side's concurrent edits. Legacy mode (no diff supplied) keeps the
    // old full-replace semantics where absence from the payload means delete.
    const scoped = dirtyExerciseIds !== undefined;
    const dirtySet = scoped ? new Set(dirtyExerciseIds) : null;
    const removedSet = new Set(removedExerciseIds ?? []);
    // Per-set merge: a writer that supplies removedSetsByExerciseId promises
    // to name every set it deleted, so within a dirty exercise we drop exactly
    // those and leave unknown set numbers (a peer's concurrent rows in the
    // SAME exercise) untouched. Without it, a device holding a stale 3-set
    // copy of an exercise would delete the peer's just-typed set 4 the moment
    // it dirtied that exercise (tick, rest autofill, reorder).
    const perSetScoped = scoped && removedSetsByExerciseId !== undefined;

    // Drop logs (and their sets) the user removed: in scoped mode that's
    // exactly `removedExerciseIds`; in legacy mode it's anything absent from
    // the incoming snapshot.
    const toDeleteLogIds = existingLogs
      .filter((l) => (scoped ? removedSet.has(l.exerciseId) : !incomingExIds.has(l.exerciseId)))
      .map((l) => l.id);
    if (toDeleteLogIds.length > 0) {
      await tx.workoutSet.deleteMany({ where: { workoutLogId: { in: toDeleteLogIds } } });
      await tx.workoutLog.deleteMany({ where: { id: { in: toDeleteLogIds } } });
    }

    const results = [];
    for (const entry of exercises) {
      // In scoped mode, skip exercises this device didn't change — leave the
      // server's copy (which may hold a peer's newer edits) untouched.
      if (dirtySet && !dirtySet.has(entry.exerciseId)) continue;
      const existing = existingByExId.get(entry.exerciseId);
      let logId: string;

      if (existing) {
        // Keep the original log row (and createdAt). Just sync orderIndex
        // and the set children below. isCompleted is only touched when the
        // payload explicitly carries it — auto-save fires every 800ms and
        // most saves are about set values, not the completion toggle.
        const updateData: {
          orderIndex?: number;
          isCompleted?: boolean;
          completedAt?: Date | null;
        } = {};
        if (existing.orderIndex !== entry.orderIndex) {
          updateData.orderIndex = entry.orderIndex;
        }
        if (entry.isCompleted !== undefined && entry.isCompleted !== existing.isCompleted) {
          updateData.isCompleted = entry.isCompleted;
          updateData.completedAt = entry.isCompleted ? new Date() : null;
        }
        if (Object.keys(updateData).length > 0) {
          await tx.workoutLog.update({ where: { id: existing.id }, data: updateData });
        }
        logId = existing.id;

        const existingBySetNum = new Map(existing.sets.map((s) => [s.setNumber, s]));
        const incomingSetNums = new Set(entry.sets.map((s) => s.setNumber));

        // Drop sets the writer removed: exactly the named set numbers in
        // per-set scoped mode, by absence from the payload otherwise.
        const removedSetNums = perSetScoped
          ? new Set(removedSetsByExerciseId?.[entry.exerciseId] ?? [])
          : null;
        const setIdsToDelete = existing.sets
          .filter((s) =>
            removedSetNums ? removedSetNums.has(s.setNumber) : !incomingSetNums.has(s.setNumber),
          )
          .map((s) => s.id);
        if (setIdsToDelete.length > 0) {
          await tx.workoutSet.deleteMany({ where: { id: { in: setIdsToDelete } } });
        }

        for (const set of entry.sets) {
          const existingSet = existingBySetNum.get(set.setNumber);
          const data = {
            reps: set.reps ?? null,
            weightKg: set.weightKg ?? null,
            durationSec: set.durationSec ?? null,
            rpe: set.rpe ?? null,
            restSec: set.restSec ?? null,
            stepsCount: set.stepsCount ?? null,
            notes: set.notes ?? null,
          };
          if (existingSet) {
            await tx.workoutSet.update({ where: { id: existingSet.id }, data });
          } else {
            await tx.workoutSet.create({
              data: { workoutLogId: logId, setNumber: set.setNumber, ...data },
            });
          }
        }
      } else {
        const created = await tx.workoutLog.create({
          data: {
            sessionInstanceId,
            exerciseId: entry.exerciseId,
            orderIndex: entry.orderIndex,
            // First save can already mark the row complete if the client
            // sent the toggle; default false otherwise.
            isCompleted: entry.isCompleted ?? false,
            completedAt: entry.isCompleted ? new Date() : null,
            sets: {
              create: entry.sets.map((set) => ({
                setNumber: set.setNumber,
                reps: set.reps ?? null,
                weightKg: set.weightKg ?? null,
                durationSec: set.durationSec ?? null,
                rpe: set.rpe ?? null,
                restSec: set.restSec ?? null,
                stepsCount: set.stepsCount ?? null,
                notes: set.notes ?? null,
              })),
            },
          },
        });
        logId = created.id;
      }

      const final = await tx.workoutLog.findUnique({
        where: { id: logId },
        include: {
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
          sets: { orderBy: { setNumber: 'asc' } },
        },
      });
      if (final) results.push(final);
    }
    return results;
  });

  await auditLog({
    action: 'WORKOUT_LOGGED',
    actorId: actorUserId,
    subjectType: 'SessionInstance',
    subjectId: sessionInstanceId,
    branchId,
    newValue: {
      exerciseCount: exercises.length,
      totalSets: exercises.reduce((sum, e) => sum + e.sets.length, 0),
    },
    metadata: {
      // Differentiates trainer- vs client-logged workouts in the audit trail.
      // Reports / replay tools key off this to attribute who entered data.
      loggedBy: actorClientProfileId ? 'CLIENT' : 'TRAINER',
      trainerProfileId: fullSession.trainerProfileId,
      clientProfileId: fullSession.clientProfileId,
    },
  });

  // Evaluate badges for all exercise types (non-blocking)
  const newBadges: NewBadge[] = [];
  const autoGeneratedPostIds: string[] = [];
  try {
    for (const log of workoutLogs) {
      const maxWeight = Math.max(...log.sets.map((s) => s.weightKg ?? 0));
      if (maxWeight > 0) {
        const prBadges = await evaluatePRBadges(
          fullSession.clientProfileId,
          branchId,
          log.exercise.id,
          log.exercise.name,
          maxWeight,
          actorUserId,
          fullSession.id,
        );
        newBadges.push(...prBadges);

        // Auto-post compound PR to community feed (ADR-020: opt-out, default on)
        // Detect PR independently of badge system — badges may already exist for the exercise
        // but we still want to post when a new weight record is set.
        const exerciseMeta = await prisma.exercise.findUnique({
          where: { id: log.exercise.id },
          select: { isCompound: true },
        });
        if (exerciseMeta?.isCompound) {
          // Check previous max weight for this client + exercise (excluding current session)
          const previousBest = await prisma.workoutSet.aggregate({
            where: {
              workoutLog: {
                exercise: { id: log.exercise.id },
                sessionInstance: {
                  clientProfileId: fullSession.clientProfileId,
                  branchId,
                  id: { not: fullSession.id }, // exclude current session
                },
              },
              weightKg: { not: null },
            },
            _max: { weightKg: true },
          });
          const prevMaxKg = previousBest._max.weightKg ?? 0;
          if (maxWeight > prevMaxKg) {
            const maxReps = log.sets.find((s) => s.weightKg === maxWeight)?.reps ?? undefined;
            try {
              // Dedup: auto-save fires on every keystroke, so naively creating
              // a post per save spams the feed. If a post for this client +
              // exercise already exists from the current session, update it
              // in place rather than creating a new one.
              const sessionStart = fullSession.startedAt ?? fullSession.scheduledDate;
              const existingAutoPost = await prisma.communityPost.findFirst({
                where: {
                  branchId,
                  clientProfileId: fullSession.clientProfileId,
                  exerciseId: log.exercise.id,
                  isAutoGenerated: true,
                  createdAt: { gte: sessionStart },
                },
                orderBy: { createdAt: 'desc' },
              });

              if (existingAutoPost) {
                // Snapshot semantics: the post mirrors this session's current
                // best lift, so always sync — including downward corrections.
                // Without this, a mid-edit typo (e.g. "4515" before correcting
                // to "45") locks into the feed because subsequent saves only
                // ratchet upward.
                await prisma.communityPost.update({
                  where: { id: existingAutoPost.id },
                  data: { weightKg: maxWeight, reps: maxReps },
                });
                // Don't push the ID — the banner already appeared on the
                // initial save; subsequent saves shouldn't re-trigger it.
              } else {
                const post = await createPost({
                  branchId,
                  clientProfileId: fullSession.clientProfileId,
                  exerciseId: log.exercise.id,
                  weightKg: maxWeight,
                  reps: maxReps,
                  isAutoGenerated: true,
                  actorId: actorUserId,
                });
                autoGeneratedPostIds.push(post.id);

                // ADR-038: first-time-this-session compound PR — fan out to the
                // gym TV. Per-session dedup means the same lift doesn't double-
                // celebrate when auto-save fires mid-edit; subsequent saves take
                // the `existingAutoPost` branch above and skip emission.
                // Cache-busts run before the Pusher fires so the TV's immediate
                // refetch reads the new state, not the stale 10s/60s snapshot.
                const slotKey = resolveCompoundSlotKey(log.exercise.name);
                invalidateTvDashboardCacheForBranch(branchId);
                invalidateTvLiveCacheForBranch(branchId);
                const clientName =
                  `${fullSession.client.user.firstName} ${fullSession.client.user.lastName}`.trim();
                // Best-effort: the helpers in @/lib/pusher already swallow errors;
                // not awaiting blocks would slow the save by one network round trip
                // per event, so kick them off and let them settle.
                void triggerPrCelebrated(branchId, {
                  clientProfileId: fullSession.clientProfileId,
                  clientName,
                  profileImageUrl: fullSession.client.user.profileImageUrl,
                  exerciseId: log.exercise.id,
                  exerciseName: log.exercise.name,
                  slotKey,
                  weightKg: maxWeight,
                  reps: maxReps ?? null,
                  achievedAt: post.createdAt.toISOString(),
                });
                void triggerLeaderboardChanged(branchId, {
                  slotKey,
                  exerciseId: log.exercise.id,
                });
              }
            } catch {
              // community post failure must never break workout save
            }
          }
        }

        const wlBadges = await evaluateWeightLiftedBadges(
          fullSession.clientProfileId,
          branchId,
          log.exercise.id,
          maxWeight,
          actorUserId,
        );
        newBadges.push(...wlBadges);
      }

      // Exercise milestone badges: evaluate for all exercise types (weight, reps, duration)
      const emBadges = await evaluateExerciseMilestoneBadges(
        fullSession.clientProfileId,
        branchId,
        log.exercise.id,
        log.sets,
        actorUserId,
      );
      newBadges.push(...emBadges);
    }
  } catch (err) {
    // badge evaluation failure must never break workout save — but surface
    // the error so silent regressions are visible in server logs.
    console.error('[workout.service] badge evaluation failed', err);
  }

  return { workoutLogs, newBadges, autoGeneratedPostIds };
}

/**
 * Update a workout log (replace sets).
 *
 * Authorization: caller must be trainer or client of the parent session.
 */
export async function updateWorkoutLog({
  workoutLogId,
  sets,
  actorUserId,
  actorTrainerProfileId,
  actorClientProfileId,
  branchId,
}: UpdateWorkoutLogInput) {
  const workoutLog = await prisma.workoutLog.findUnique({
    where: { id: workoutLogId },
    include: {
      sessionInstance: { select: { id: true, branchId: true } },
      sets: true,
    },
  });

  if (!workoutLog) {
    throw new AppError('WORKOUT_LOG_NOT_FOUND', 'Workout log not found', 404);
  }

  if (workoutLog.sessionInstance.branchId !== branchId) {
    throw new AppError('FORBIDDEN', 'Access denied', 403);
  }

  await assertSessionAccess({
    sessionId: workoutLog.sessionInstance.id,
    branchId,
    trainerProfileId: actorTrainerProfileId,
    clientProfileId: actorClientProfileId,
  });

  if (sets) {
    // Delete existing sets and recreate
    await prisma.workoutSet.deleteMany({ where: { workoutLogId } });
    await prisma.workoutSet.createMany({
      data: sets.map((set) => ({
        workoutLogId,
        setNumber: set.setNumber,
        reps: set.reps,
        weightKg: set.weightKg,
        durationSec: set.durationSec,
        rpe: set.rpe,
        restSec: set.restSec,
        stepsCount: set.stepsCount,
        notes: set.notes,
      })),
    });
  }

  const updated = await prisma.workoutLog.findUnique({
    where: { id: workoutLogId },
    include: {
      exercise: {
        select: {
          id: true,
          name: true,
          targetMuscleGroup: true,
          category: true,
          exerciseType: true,
        },
      },
      sets: { orderBy: { setNumber: 'asc' } },
    },
  });

  await auditLog({
    action: 'WORKOUT_UPDATED',
    actorId: actorUserId,
    subjectType: 'WorkoutLog',
    subjectId: workoutLogId,
    branchId,
    metadata: { loggedBy: actorClientProfileId ? 'CLIENT' : 'TRAINER' },
  });

  return updated;
}

/**
 * Delete a workout log and its sets.
 *
 * Authorization: caller must be trainer or client of the parent session.
 */
export async function deleteWorkoutLog({
  workoutLogId,
  actorUserId,
  actorTrainerProfileId,
  actorClientProfileId,
  branchId,
}: DeleteWorkoutLogInput) {
  const workoutLog = await prisma.workoutLog.findUnique({
    where: { id: workoutLogId },
    include: {
      sessionInstance: { select: { id: true, branchId: true } },
    },
  });

  if (!workoutLog) {
    throw new AppError('WORKOUT_LOG_NOT_FOUND', 'Workout log not found', 404);
  }

  if (workoutLog.sessionInstance.branchId !== branchId) {
    throw new AppError('FORBIDDEN', 'Access denied', 403);
  }

  await assertSessionAccess({
    sessionId: workoutLog.sessionInstance.id,
    branchId,
    trainerProfileId: actorTrainerProfileId,
    clientProfileId: actorClientProfileId,
  });

  await prisma.workoutSet.deleteMany({ where: { workoutLogId } });
  await prisma.workoutLog.delete({ where: { id: workoutLogId } });

  await auditLog({
    action: 'WORKOUT_DELETED',
    actorId: actorUserId,
    subjectType: 'WorkoutLog',
    subjectId: workoutLogId,
    branchId,
    metadata: { loggedBy: actorClientProfileId ? 'CLIENT' : 'TRAINER' },
  });

  return { success: true };
}

/**
 * Get all workout logs for a session
 */
export async function getSessionWorkouts({ sessionInstanceId, branchId }: GetSessionWorkoutsInput) {
  const session = await prisma.sessionInstance.findFirst({
    where: { id: sessionInstanceId, branchId },
  });

  if (!session) {
    throw new AppError('SESSION_NOT_FOUND', 'Session not found', 404);
  }

  return prisma.workoutLog.findMany({
    where: { sessionInstanceId },
    include: {
      exercise: {
        select: {
          id: true,
          name: true,
          targetMuscleGroup: true,
          category: true,
          exerciseType: true,
          secondaryMetric: true,
          equipmentRequired: true,
        },
      },
      sets: { orderBy: { setNumber: 'asc' } },
    },
    orderBy: { orderIndex: 'asc' },
  });
}

/**
 * Get workout history for a client (with filters)
 */
export async function getClientWorkouts({
  clientProfileId,
  branchId,
  dateFrom,
  dateTo,
  exerciseId,
  muscleGroup,
}: ListClientWorkoutsInput) {
  const sessionWhere: Record<string, unknown> = { branchId, clientProfileId };

  if (dateFrom || dateTo) {
    const dateFilter: Record<string, unknown> = {};
    if (dateFrom) dateFilter.gte = new Date(dateFrom);
    if (dateTo) dateFilter.lte = new Date(dateTo);
    sessionWhere.scheduledDate = dateFilter;
  }

  const workoutWhere: Record<string, unknown> = {
    sessionInstance: sessionWhere,
  };

  if (exerciseId) {
    workoutWhere.exerciseId = exerciseId;
  }

  if (muscleGroup) {
    workoutWhere.exercise = {
      targetMuscleGroup: { contains: muscleGroup, mode: 'insensitive' },
    };
  }

  return prisma.workoutLog.findMany({
    where: workoutWhere,
    include: {
      exercise: {
        select: {
          id: true,
          name: true,
          targetMuscleGroup: true,
          category: true,
          exerciseType: true,
          secondaryMetric: true,
          equipmentRequired: true,
        },
      },
      sets: { orderBy: { setNumber: 'asc' } },
      sessionInstance: {
        select: {
          id: true,
          scheduledDate: true,
          scheduledTime: true,
          status: true,
          trainer: {
            include: { user: { select: { firstName: true, lastName: true } } },
          },
        },
      },
    },
    orderBy: [{ sessionInstance: { scheduledDate: 'desc' } }, { orderIndex: 'asc' }],
  });
}

// ─── Workout calendar (client dashboard) ─────────────────────────────────────

export interface WorkoutCalendarDay {
  /** YYYY-MM-DD (same key format as session generation: ISO date part) */
  date: string;
  sessionIds: string[];
  isPR: boolean;
}

export async function getWorkoutCalendar({
  clientProfileId,
  branchId,
  month,
}: {
  clientProfileId: string;
  branchId: string;
  month: string; // YYYY-MM
}): Promise<{ days: WorkoutCalendarDay[]; totalDays: number }> {
  const [yearStr, monthStr] = month.split('-');
  const year = parseInt(yearStr!, 10);
  const m = parseInt(monthStr!, 10);
  const monthStart = new Date(year, m - 1, 1);
  const monthEnd = new Date(year, m, 0, 23, 59, 59);

  const sessions = await prisma.sessionInstance.findMany({
    where: {
      branchId,
      clientProfileId,
      status: 'COMPLETED',
      scheduledDate: { gte: monthStart, lte: monthEnd },
    },
    select: { id: true, scheduledDate: true },
    orderBy: { scheduledDate: 'asc' },
  });

  // PR days mirror the community auto-post rule above: a compound lift whose
  // day-max strictly beats the client's all-time best (first-ever lift counts).
  // History is bounded at monthEnd so browsing a past month doesn't credit a
  // PR to a day that was only beaten later.
  const sets = await prisma.workoutSet.findMany({
    where: {
      weightKg: { not: null },
      workoutLog: {
        exercise: { isCompound: true },
        sessionInstance: { branchId, clientProfileId, scheduledDate: { lte: monthEnd } },
      },
    },
    select: {
      weightKg: true,
      workoutLog: {
        select: {
          exerciseId: true,
          sessionInstance: { select: { scheduledDate: true } },
        },
      },
    },
  });

  // Best lift per exercise per day
  const dayMax = new Map<string, Map<string, number>>();
  for (const s of sets) {
    const date = s.workoutLog.sessionInstance.scheduledDate.toISOString().split('T')[0]!;
    const byExercise = dayMax.get(date) ?? new Map<string, number>();
    const kg = s.weightKg ?? 0;
    if (kg > (byExercise.get(s.workoutLog.exerciseId) ?? 0)) {
      byExercise.set(s.workoutLog.exerciseId, kg);
    }
    dayMax.set(date, byExercise);
  }

  // Walk days chronologically tracking the running all-time best per exercise
  const prDays = new Set<string>();
  const allTimeBest = new Map<string, number>();
  for (const date of [...dayMax.keys()].sort()) {
    for (const [exerciseId, kg] of dayMax.get(date)!) {
      if (kg > (allTimeBest.get(exerciseId) ?? 0)) {
        prDays.add(date);
        allTimeBest.set(exerciseId, kg);
      }
    }
  }

  const dayMap = new Map<string, WorkoutCalendarDay>();
  for (const s of sessions) {
    const date = s.scheduledDate.toISOString().split('T')[0]!;
    const day = dayMap.get(date) ?? { date, sessionIds: [], isPR: prDays.has(date) };
    day.sessionIds.push(s.id);
    dayMap.set(date, day);
  }

  return { days: [...dayMap.values()], totalDays: dayMap.size };
}
