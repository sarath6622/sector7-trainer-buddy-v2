# API Contracts — Sector 7

> Last updated: 2026-03-29
> Base path: `/api`
> Auth: All routes require authentication via NextAuth session (except `/api/auth/*`)
> Branch scoping: Middleware injects `branchId` from session into request context

---

## Conventions

- **Success:** `{ data: T, message?: string }`
- **Error:** `{ error: string, code: string, details?: object }`
- **Pagination:** `{ data: T[], pagination: { page, pageSize, total, totalPages } }`
- **All dates:** ISO 8601 strings
- **All IDs:** CUID strings

---

## Auth Routes

```
POST   /api/auth/login          → { email, password } → { user, session }
POST   /api/auth/logout         → {} → { success: true }
GET    /api/auth/me             → {} → { user: { id, email, role, branchId, profile } }
```

---

## Admin Routes

### Users

```
GET    /api/admin/users                  → ?role=TRAINER|CLIENT&search&status=all|active|inactive
                                              &attention=expiring_soon|expired|low_sessions|used_up
                                              &trainerId=<trainerProfileId|'unassigned'>&page&pageSize
                                              → Paginated<User> & { activeCount }
                                            search: matches name / email / phone, multi-term (every
                                            whitespace-separated term must match one of those fields,
                                            case-insensitive, order-independent). Filtering is server-side
                                            across the whole branch roster — paginate the filtered set.
                                            status: filters by User.isActive.
                                            attention (CLIENT renewal buckets, evaluated against the active
                                              PT package): expiring_soon = endDate within 30 days;
                                              expired = endDate in the past; low_sessions = 0 < sessionsLeft
                                              ≤ ceil(sessionsPerMonth/30·7); used_up = sessionsLeft == 0.
                                              low_sessions/used_up resolve via a service pre-pass that
                                              computes sessions-used, then constrain the paginated query by
                                              clientProfileId (total stays accurate).
                                            trainerId: scopes to that trainer's active-package clients;
                                              the literal 'unassigned' selects clients with no active package
                                              (the "No trainer" state). All filters AND together.
                                            `activeCount` (sibling of `pagination`) is the branch-wide active
                                            tally for this role, ignoring search/status (stable header stat).
POST   /api/admin/users                  → { email, firstName, lastName, phone, role, ...profileFields } → User
GET    /api/admin/users/[id]             → {} → User (with profile)
PUT    /api/admin/users/[id]             → { ...updatedFields } → User
DELETE /api/admin/users/[id]             → {} → { success } (soft delete)
GET    /api/admin/users/[id]/clients     → {} → { data: TrainerClient[] }
                                            For a trainer user. Returns clients with an active PtPackage
                                            assigned to this trainer in the caller's branch. Empty array
                                            if user has no TrainerProfile.
                                            TrainerClient = {
                                              clientProfile: { id, paymentStatus, user: { firstName, lastName,
                                                                                          email, phone, profileImageUrl } },
                                              package: { id, planName, sessionsPerMonth, totalSessions, used,
                                                         startDate, endDate },
                                              nextSession: { id, scheduledDate, scheduledTime } | null,
                                            }
                                            `used` = COMPLETED + NO_SHOW within package window + onboardingUsedSessions.
                                            `nextSession` is the earliest upcoming SCHEDULED instance for this trainer+client.
                                            Sorted alphabetically by client name. Auth: BRANCH_ADMIN | SUPER_ADMIN.
```

### Trainer-Client Mapping

> Updated 2026-05-08 (Phase 25): mapping carries optional `planId` (catalog reference) plus
> per-package session totals and onboarding backfill. Mapping responses include `plan: { id, name } | null`.

```
POST   /api/admin/mappings   body: {
                                clientProfileId, trainerProfileId,
                                sessionsPerMonth,                       // monthly rate
                                planId?,                                // optional plan reference
                                totalSessions?,                         // optional override; auto-computed from plan if absent
                                onboardingUsedSessions?,                // default 0
                                onboardingNotes?,
                                sessionCharge?, startDate, endDate?
                              } → PtPackage (with plan: { id, name } | null)
GET    /api/admin/mappings               → ?trainerId&clientId → PtPackage[] (each includes plan: { id, name } | null)
PUT    /api/admin/mappings/[id]          → { planId?, sessionsPerMonth?, totalSessions?, onboardingUsedSessions?, onboardingNotes?, sessionCharge?, endDate?, isActive? } → PtPackage
DELETE /api/admin/mappings/[id]          → {} → { success }
GET    /api/admin/mappings/[id]/window-counts  → {} → PackageWindowCounts
```

`PackageWindowCounts` shape (returned by `/window-counts`, used by the scheduling modal):

```typescript
{
  packageId: string;
  plan: { id, name, durationDays } | null;
  sessionsPerMonth: number;
  totalSessions: number;
  onboardingUsedSessions: number;
  onboardingNotes: string | null;
  // Counts across the full package window (startDate → endDate inclusive)
  completed: number;
  noShow: number;
  cancelled: number;
  scheduled: number;
  inProgress: number;
  used: number;       // completed + noShow + onboardingUsedSessions
  upcoming: number;   // scheduled + inProgress
  remaining: number;  // max(0, totalSessions - used - upcoming)
  window: {
    start: string;        // ISO 8601
    end: string;          // ISO 8601
    totalDays: number;
    daysElapsed: number;
    daysRemaining: number;
  };
}
```

Errors on POST/PUT:

- `PLAN_NOT_FOUND` (404) — `planId` does not belong to this branch
- `PLAN_INACTIVE` (400) — plan exists but is deactivated
- `DUPLICATE_MAPPING` (409) — active mapping already exists for this trainer-client pair

### Package Plans (Catalog) — Added 2026-05-08

> Per-branch catalog of named plans. Admin defines once, picks from a dropdown
> when creating mappings. `BRANCH_ADMIN | SUPER_ADMIN` only.

```
GET    /api/admin/package-plans            → ?activeOnly=true&page&pageSize → Paginated<PtPackagePlan with _count.packages>
POST   /api/admin/package-plans            → { name, sessionsPerMonth, pricePerCycle, sessionChargeAmount?, durationDays, description? } → PtPackagePlan (201)
GET    /api/admin/package-plans/[id]       → {} → PtPackagePlan with _count.packages
PUT    /api/admin/package-plans/[id]       → { name?, sessionsPerMonth?, pricePerCycle?, sessionChargeAmount?, durationDays?, description?, isActive? } → PtPackagePlan
DELETE /api/admin/package-plans/[id]       → ?force=true → { success } | 409 PLAN_HAS_ACTIVE_ASSIGNMENTS
```

`PtPackagePlan` shape: `{ id, branchId, name, sessionsPerMonth, pricePerCycle, sessionChargeAmount, durationDays, description, isActive, createdAt, updatedAt, _count?: { packages } }`

Errors:

- `DUPLICATE_PLAN_NAME` (409) — name already used in this branch (uniqueness scoped per-branch)
- `PLAN_NOT_FOUND` (404)
- `PLAN_HAS_ACTIVE_ASSIGNMENTS` (409) — DELETE without `?force=true` when active assignments still reference the plan; with `?force=true`, plan is soft-deactivated and existing assignments keep their `planId` for historical reference

### Scheduling

```
POST   /api/admin/schedules              → { clientProfileId, trainerProfileId, dayOfWeek, startTime, durationMin, validFrom, validUntil? } → SessionSchedule
GET    /api/admin/schedules              → ?trainerId&clientId → SessionSchedule[]
PUT    /api/admin/schedules/[id]         → { ...updatedFields } → SessionSchedule
DELETE /api/admin/schedules/[id]         → {} → { success }
POST   /api/admin/schedules/generate     → { month: "2026-04", scheduleIds?: string[] } → { created: number, conflicts: Conflict[] }
```

### Session Instances

```
GET    /api/admin/sessions               → ?date&dateFrom&dateTo&trainerId&clientId&status&search&page&pageSize → Paginated<SessionInstance> + stats
       search = case-insensitive match on client OR trainer first/last name (server-side).
       Response also carries stats: { total, byStatus: Record<SessionStatus, number> } —
       counted over the ENTIRE filtered range (date/trainer/client/search filters applied,
       status filter deliberately ignored so the breakdown always shows every status).
PUT    /api/admin/sessions/[id]          → { scheduledDate?, scheduledTime?, trainerProfileId? } → SessionInstance
DELETE /api/admin/sessions/[id]          → {} → { success }
```

### Conflict Detection

```
GET    /api/admin/conflicts              → ?date&trainerId → Conflict[]
       Conflict: { sessionA: SessionInstance, sessionB: SessionInstance, trainer, overlapMinutes }
```

### Vacant Trainers

```
GET    /api/admin/trainers/vacant        → ?date&startTime&endTime → TrainerProfile[]
       Returns trainers who are: available (working hours) + not booked + not on leave
```

### Leaves

```
GET    /api/admin/leaves                 → ?status&trainerId&page&pageSize → Paginated<LeaveRequest>
GET    /api/admin/leaves/[id]            → {} → LeaveRequest (with affected clients)
PUT    /api/admin/leaves/[id]/approve    → { notes? } → LeaveRequest
PUT    /api/admin/leaves/[id]/reject     → { notes? } → LeaveRequest
```

### Reassignment

```
POST   /api/admin/reassignments          → { sessionInstanceId, replacementTrainerProfileId, reason? } → TrainerReassignment
POST   /api/admin/reassignments/bulk     → { sessionInstanceIds: string[], replacementTrainerProfileId, reason? } → TrainerReassignment[]
GET    /api/admin/reassignments          → ?date&trainerId → TrainerReassignment[]
```

### Payments

```
POST   /api/admin/payments               → { clientProfileId, amount, method, status, paidAt?, periodStart?, periodEnd?, notes? } → PaymentRecord
GET    /api/admin/payments               → ?clientId&status&page&pageSize → Paginated<PaymentRecord>
PUT    /api/admin/payments/[id]          → { status?, amount?, notes? } → PaymentRecord
```

### Kickboxing

```
POST   /api/admin/kickboxing/classes     → { trainerProfileId, dayOfWeek, startTime, durationMin, maxCapacity } → KickboxingClass
GET    /api/admin/kickboxing/classes     → {} → KickboxingClass[]
PUT    /api/admin/kickboxing/classes/[id] → { ...updatedFields } → KickboxingClass
POST   /api/admin/kickboxing/enrollments → { classId, clientProfileId?, clientType, externalName?, externalPhone? } → KickboxingEnrollment
GET    /api/admin/kickboxing/enrollments → ?classId&clientType → KickboxingEnrollment[]
DELETE /api/admin/kickboxing/enrollments/[id] → {} → { success }
```

### Exercise Library

```
POST   /api/admin/exercises              → { name, targetMuscleGroup, category, equipmentRequired, ...optional } → Exercise
GET    /api/admin/exercises              → ?search&muscleGroup&category&page&pageSize → Paginated<Exercise>
GET    /api/admin/exercises/[id]         → {} → Exercise
PUT    /api/admin/exercises/[id]         → { ...updatedFields } → Exercise
DELETE /api/admin/exercises/[id]         → {} → { success }
POST   /api/admin/exercises/bulk-import  → { exercises: ExerciseInput[] } → { created: number, errors: ImportError[] }

# Trainer parity — same contracts, gated on TRAINER role. Writes are global
# (single Exercise table, no branchId/createdById on the row). See decisions.md.
POST   /api/trainer/exercises              → identical body/response as admin
GET    /api/trainer/exercises              → identical
GET    /api/trainer/exercises/[id]         → identical
PUT    /api/trainer/exercises/[id]         → identical
DELETE /api/trainer/exercises/[id]         → identical
POST   /api/trainer/exercises/bulk-import  → identical

# Shared read used by the workout logger (any authenticated role)
GET    /api/exercises                      → ?search&muscleGroup&muscleGroups&category&exerciseType&page&pageSize
                                             → Paginated<Exercise> & { relaxed: boolean }
```

**Fuzzy `search` (2026-08-26).** `search` is no longer a SQL substring match. The
catalog is scored in memory by `src/lib/exerciseSearch.ts` and returned ranked by
relevance, because trainers type the lift the way they say it — "incline press"
for "Incline Chest Press (Machine)" — which no `contains` predicate finds.
Matching is word-order independent, tolerates typos ("deadlft"), compound words
("benchpress"), and query words spanning two catalog words ("tricep pushdown").

`relaxed: true` means the strict pass found nothing and the payload holds near
misses instead — the UI must label them as guesses, not hits. `pagination.total`
counts matches after scoring, so it stays honest for both passes. Applies to
every route calling `exerciseService.listExercises` (admin, trainer, shared).

### Analytics

```
GET    /api/admin/analytics/trainer-utilization → ?month&trainerId → TrainerUtilization[]
GET    /api/admin/analytics/client-attendance   → ?month&clientId → ClientAttendance[]
GET    /api/admin/analytics/session-consumption → ?month → SessionConsumption[]
GET    /api/admin/analytics/no-show-rate        → ?month → NoShowRate[]
GET    /api/admin/analytics/revenue             → ?month → RevenueOverview
GET    /api/admin/analytics/export              → ?report&month&format=xlsx → Binary (Excel file)
```

### Trainer Shifts

```
GET    /api/admin/shifts                 → ?trainerId → TrainerShift[]
POST   /api/admin/shifts                 → { trainerProfileId, label, startTime, endTime, days: DayOfWeek[] } → TrainerShift (201)
DELETE /api/admin/shifts/[id]            → {} → { success: true }
```

`TrainerShift: { id, branchId, trainerProfileId, label, startTime: "HH:MM", endTime: "HH:MM", days: DayOfWeek[], createdAt, updatedAt, trainer: { user: { firstName, lastName } } }`

Side effect: every write recomputes `TrainerProfile.workingDays` (derived union of all shift days).
Zero shifts = trainer is all-day available on all days (backward-compat rule).

### Availability Check

```
GET    /api/admin/availability-check     → ?mode=smart|trainer&durationMin=60&trainerId → AvailabilityResult
```

**`mode=smart` (default):** Returns top 5 slots per day of the week, scored by free-trainer ratio + average load.
Response: `{ durationMin: number, recommendations: { day: DayOfWeek, slots: Slot[] }[] }`
`Slot: { day, startTime, endTime, freeTrainers: { id, name, currentLoad }[], busyTrainerCount, score }`

**`mode=trainer`:** Returns a full week view for one trainer (requires `trainerId`).
Response: `{ trainer: { id, name, workingDays, workStart, workEnd, totalScheduledSessions }, weekView: DayView[] }`
`DayView: { day, isWorkingDay, workStart?, workEnd?, shifts?: { startTime, endTime }[], bookedSlots: BookedSlot[], freeWindows: Window[] }`
`BookedSlot: { startTime, durationMin, clientName }` · `Window: { startTime, endTime, durationMin }`

### Settings

```
GET    /api/admin/settings               → {} → BranchSettings
PUT    /api/admin/settings               → { ...settingsFields } → BranchSettings
```

### Audit Logs

```
GET    /api/admin/audit-logs             → ?action&actorId&subjectType&subjectId&dateFrom&dateTo&page&pageSize → Paginated<AuditLog>
```

---

## Trainer Routes

```
GET    /api/trainer/clients              → {} → ClientProfile[] (own clients only)
GET    /api/trainer/clients/[id]         → {} → ClientProfile (with session count)
GET    /api/trainer/schedule             → ?date&week&month → SessionInstance[] (own schedule)
GET    /api/trainer/sessions/[id]        → {} → SessionInstance (with workout logs)
POST   /api/trainer/sessions/[id]/start  → {} → { session, timer: { startedAt, expectedDuration } }
POST   /api/trainer/sessions/[id]/end    → {} → { session, actualDuration }
POST   /api/trainer/sessions/[id]/no-show → {} → { session }

# Workout logging — DEPRECATED. Prefer /api/sessions/[id]/workouts (ADR-036).
# These routes still work; offline-sync (PWA) still POSTs to /sync.
POST   /api/trainer/workouts             → { sessionInstanceId, exercises: WorkoutEntry[] } → WorkoutLog[]
PUT    /api/trainer/workouts/[id]        → { sets?, reps?, weight?, rpe?, notes? } → WorkoutLog
POST   /api/trainer/workouts/sync        → { logs: OfflineWorkoutEntry[] } → { synced: number, conflicts: SyncConflict[] }

GET    /api/trainer/clients/[id]/progress → {} → ProgressEntry[]
POST   /api/trainer/clients/[id]/progress → { weightKg?, bodyFatPercent?, ...measurements, photoUrls? } → ProgressEntry
PUT    /api/trainer/progress/[id]        → { ...updatedFields } → ProgressEntry

GET    /api/trainer/clients/[id]/exercise-progress → ?exerciseId=xxx → ChartPoint[]
       Returns max-weight (or duration/reps) per session for a specific exercise for this client.
       Trainer-scoped: verifies client belongs to same branch. Calls getChartData(metric='exercise').
       Added: 2026-03-28

POST   /api/trainer/leaves               → { startDate, endDate, reason? } → LeaveRequest (with affected clients)
GET    /api/trainer/leaves               → {} → LeaveRequest[] (own leaves)

GET    /api/trainer/analytics            → {} → { clientAttendanceRate, sessionCompletionRate, utilization }
```

### Workout Entry Shape (for POST /api/trainer/workouts)

```typescript
interface WorkoutEntry {
  exerciseId: string;
  orderIndex: number;
  isCompleted?: boolean; // ADR-037
  sets: {
    setNumber: number;
    reps?: number;
    weightKg?: number;
    durationSec?: number;
    rpe?: number;
    restSec?: number; // rest taken BEFORE this set
    stepsCount?: number; // CARDIO + secondaryMetric=STEPS only
    notes?: string;
  }[];
}
```

### Exercise Create/Update Shape (admin + trainer)

```typescript
interface ExerciseInput {
  name: string;
  targetMuscleGroup: string;
  secondaryMuscles?: string[];
  equipmentRequired?: string;
  difficulty?: 'EASY' | 'MEDIUM' | 'HARD';
  category: ExerciseCategory;
  exerciseType?: 'WEIGHTED' | 'BODYWEIGHT' | 'DURATION' | 'CARDIO';
  // CARDIO-only — drives the second column the workout logger renders.
  // KM/METERS store distance in WorkoutSet.notes; STEPS stores integer in
  // WorkoutSet.stepsCount; NONE hides the second column. Defaults to 'KM'.
  secondaryMetric?: 'KM' | 'STEPS' | 'METERS' | 'NONE';
  isCompound?: boolean;
  instructions?: string;
  demoVideoUrl?: string;
  demoGifUrl?: string;
}
```

---

## Client Routes

```
GET    /api/client/dashboard             → {} → { sessionCount, nextSession, activeSession, trainer,
                                                   latestProgress, prevProgress, prs }
       latestProgress/prevProgress: { weightKg, bodyFatPercent, muscleMass, recordedAt } (latest 2 entries)
       prs: [{ exerciseName, muscle, maxWeightKg }] top 4 by max weight across all workout sets
       Updated: 2026-03-28 (added latestProgress, prevProgress, prs)

GET    /api/client/sessions              → ?month → SessionInstance[] (own sessions)
GET    /api/client/sessions/[id]         → {} → SessionInstance (with workout details, exerciseType included)
GET    /api/client/attendance             → ?month → AttendanceRecord[]
GET    /api/client/workouts              → ?dateFrom&dateTo&exerciseId&muscleGroup → WorkoutLog[]
GET    /api/client/workout-calendar      → ?month=YYYY-MM → { days: [{ date, sessionIds, isPR }], totalDays }
       Role: CLIENT only. Calendar view of completed PT session days for the month.
       date: YYYY-MM-DD. isPR mirrors the community auto-post PR rule: a compound
       lift on that day strictly beat the client's all-time best (first-ever lift counts).
       Validation: workoutCalendarQuerySchema
       Added: 2026-06-12
GET    /api/client/progress              → {} → ProgressEntry[]
POST   /api/client/progress             → { weightKg?, bodyFatPercent?, muscleMass?, chest?, waist?, hips?, bicepLeft?, bicepRight?, thighLeft?, thighRight?, notes? } → { data: ProgressEntry } 201
       Role: CLIENT only. Creates a new progress entry owned by the authenticated client.
       Validation: createProgressSchema (all fields optional numbers/string, at least one measurement expected)
       Added: 2026-03-29
PUT    /api/client/progress/[id]        → { weightKg?, bodyFatPercent?, muscleMass?, chest?, waist?, hips?, bicepLeft?, bicepRight?, thighLeft?, thighRight?, notes? } → { data: ProgressEntry } 200
       Role: CLIENT only. Updates own progress entry (ownership verified by clientProfileId).
       Validation: updateProgressSchema (same optional fields as POST)
       Added: 2026-03-29
GET    /api/client/progress/charts       → ?metric=weight|bodyFat|exercise&exerciseId? → ChartData

POST   /api/client/unavailability        → { dates: string[] } → ClientUnavailability[]
GET    /api/client/unavailability        → ?month → ClientUnavailability[]
DELETE /api/client/unavailability/[id]   → {} → { success }
```

---

## Notification Routes

```
GET    /api/notifications                → ?unreadOnly&page&pageSize → Paginated<NotificationLog>
PUT    /api/notifications/[id]/read      → {} → { success }
PUT    /api/notifications/read-all       → {} → { success }
```

---

## WebSocket Events (Real-Time)

```
Channel: session:{sessionInstanceId}
  → SESSION_STARTED      { sessionId, startedAt, expectedDurationMin }
  → SESSION_TIMER_TICK   { sessionId, elapsedMin }  (every minute)
  → SESSION_TIME_COMPLETE { sessionId, message }   (when designated time is up)
  → SESSION_ENDED        { sessionId, endedAt, actualDurationMin }
  → REST_TIMER_UPDATED   { endTime, pausedRemaining, total, updatedAt, serverNow }
  → WORKOUT_UPDATED      { sessionId, actorUserId, updatedAt }

Channel: user:{userId}
  → NOTIFICATION       { id, title, body, type }
  → LEAVE_STATUS_CHANGED { leaveId, status }
  → TRAINER_REASSIGNED { sessionId, newTrainerName, date, time }
```

### Rest Timer (Phase 2 — 2026-05-10)

```
GET    /api/sessions/[id]/rest-timer  → {} → { data: { endTime, pausedRemaining, total, updatedAt }, serverNow }
PUT    /api/sessions/[id]/rest-timer  → { endTime, pausedRemaining, total } → { data, serverNow }
DELETE /api/sessions/[id]/rest-timer  → {} → { data: null }
```

- All timestamps are **server-clock ms**. Clients track `skew = serverNow - clientNow`
  to render countdowns consistently across devices with drifted wall clocks.
- `endTime` and `pausedRemaining` are mutually exclusive (Zod-enforced); `total ≤ 3600`.
- State is stored in Postgres (`RestTimer` model, 1:1 with `SessionInstance`, see
  ADR-031). Forgotten rows are reaped by a daily cleanup or `updatedAt` filter.
- Auth: trainer or client of the session, scoped to their branch (403 otherwise).
  Both can read and mutate — clients see the same countdown trainers do and can
  Stop their own pill.
- Mutations write `auditLog` with action `REST_TIMER_{START|PAUSE|RESUME|STOP|UPDATE}`
  and broadcast `REST_TIMER_UPDATED` on the session channel — clients subscribe via
  Pusher instead of polling. A 30s GET keepalive fills in if Pusher is down.

### Shared Workout Logging (ADR-036 — 2026-05-16)

```
POST   /api/sessions/[id]/workouts                  → { exercises: WorkoutEntry[], dirtyExerciseIds?: string[], removedExerciseIds?: string[], removedSetsByExerciseId?: Record<string, number[]> } → { data: WorkoutLog[], newBadges, autoGeneratedPostIds }  (201)
PUT    /api/sessions/[id]/workouts/[logId]          → { sets?: WorkoutSet[] } → { data: WorkoutLog }
DELETE /api/sessions/[id]/workouts/[logId]          → {} → { data: { success: true } }
```

`WorkoutEntry` shape (ADR-037 added `isCompleted`):

```typescript
interface WorkoutEntry {
  exerciseId: string;
  orderIndex: number;
  sets: WorkoutSet[]; // ≥0 — a zero-set entry persists an exercise that was
  // added but not yet logged (survives tab switch / reload).
  // Only *complete* sets (reps+kg etc.) are ever included.
  isCompleted?: boolean; // ADR-037; omitted → service preserves existing flag
}
```

**Scoped writes (2026-06-12, ADR-041).** `dirtyExerciseIds` / `removedExerciseIds`
make the POST a _partial_ write instead of a full snapshot replace. The client
diffs its current payload against the last synced server state and sends only:

- `dirtyExerciseIds` — exercises whose sets / order / completion this device
  changed (or that are brand new). The service reconciles **only** these
  (upsert + drop sets removed within them).
- `removedExerciseIds` — exercises that were saved before but the user has since
  deleted. The service drops **exactly** these logs.

Exercises present in `exercises` but absent from `dirtyExerciseIds` are left
untouched on the server. This closes the ADR-036 last-write-wins race: a
debounced save from a device holding a stale snapshot (e.g. the trainer's tab
auto-saving while the client logs a set on their phone) no longer deletes the
peer's concurrent edits. When **both** fields are omitted the service falls back
to legacy full-replace (delete-by-absence) — the offline `/sync` and legacy
`/api/trainer/workouts` callers rely on this.

**Per-set scoping (2026-06-12).** `removedSetsByExerciseId` extends the diff to
set granularity: per dirty exercise, the set numbers this device explicitly
deleted. When present (the WorkoutLogger always sends it, even empty), set
deletion inside a dirty exercise is limited to exactly those numbers — set rows
the writer has never seen (a peer's concurrent additions to the _same_
exercise) survive a save from a stale copy. Incoming sets still upsert by
`setNumber`, so a true same-set conflict resolves last-writer-wins per set.
When omitted (pre-per-set bundles), a dirty exercise's sets reconcile by
absence from the payload, as before.

`WorkoutLog` rows in read responses now include `isCompleted: boolean` and
`completedAt: ISO | null`. New columns added by migration
`20260516120000_add_workout_log_completion`; existing rows default to
`isCompleted=false`.

**Real-time (2026-05-16):** the POST/PUT/DELETE handlers broadcast
`WORKOUT_UPDATED { sessionId, actorUserId, updatedAt }` on
`session:{sessionInstanceId}` after each successful mutation. The trainer
and client session pages subscribe and refetch the session payload on
peer events (skipping their own echo via `actorUserId`), so changes from
the other side appear in <1s without polling. The 10s/30s GET polls
remain as a fallback for when Pusher is down. `WorkoutLogger`'s
rehydration effect drops the server payload when local edits are
unsaved, so refetching is always safe.

To keep peer latency low without spamming the broker, structural changes
in `WorkoutLogger` (add exercise, remove exercise, mark-complete) bypass
the 5s typing debounce and save with delay 0. Per-set value typing still
uses the 5s debounce.

- Auth: `assertSessionAccess` — caller must be the **trainer OR the client** of the
  session (branch-scoped). 403 `SESSION_FORBIDDEN` otherwise. 404 `SESSION_NOT_FOUND`
  if branch mismatch.
- Mutations are only allowed while the session is `IN_PROGRESS` or `COMPLETED`. A
  `SCHEDULED` session returns 400 `INVALID_STATUS` (the client UI surfaces this as
  a "Waiting for trainer to start" state).
- Audit log records `actorId = userId` and `metadata.loggedBy ∈ { TRAINER, CLIENT }`
  so reporting can distinguish trainer- vs client-entered data. Auto-generated PR
  community posts continue to be attributed to `clientProfileId` regardless of who
  saved — the post owner is the lifter, not the logger.
- The legacy `POST /api/trainer/workouts` / `PUT /api/trainer/workouts/[id]` routes
  remain alive as TRAINER-only thin pass-throughs (offline-sync still hits
  `/api/trainer/workouts/sync`). They will be removed once the PWA offline-sync
  flow is rewritten against the shared route.

The five `/api/trainer/clients/[id]/{last-sets, workout-history, exercise-progress,
recent-exercises-by-muscle, muscle-group-recency}` helper endpoints used by the
WorkoutLogger were also widened on 2026-05-16: in addition to trainers/admins they
now accept the **client themselves** (caller's `clientProfileId` matches the URL
`[id]`). Auth helper: `canReadClientTrainingData` in `@/lib/auth`. No new URLs
were introduced — the existing trainer-namespaced paths serve both sides via the
shared logger.

### Session Pause (Phase 2 — 2026-05-10)

```
GET    /api/sessions/[id]/pause  → {} → { data: { pausedAt, accumulatedPausedSec, updatedAt }, serverNow }
POST   /api/sessions/[id]/pause  → {} → { data, serverNow }   # toggles pause ↔ resume
```

- `pausedAt` is server-clock ms or null (running). `accumulatedPausedSec` is the total
  paused seconds across all pause/resume cycles. `updatedAt` is the dedicated
  `pauseUpdatedAt` column — bumped only on pause/resume so unrelated row updates
  don't trip the hook's monotonic guard.
- POST is idempotent: pausing a paused session (or resuming a running one) echoes
  current state without re-firing audit/Pusher.
- Auth: trainer or client of the session (same as rest-timer). Either side can
  pause/resume — the use case is the trainer pausing during a phone call AND the
  client surfacing the frozen elapsed back to the trainer.
- Mutations write `auditLog` with action `SESSION_PAUSED` / `SESSION_RESUMED` and
  broadcast `SESSION_PAUSE_UPDATED` on the session channel.
- `endSession` finalizes any in-flight pause (`accumulatedPausedSec += now - pausedAt`)
  and subtracts the total from `actualDurationMin`, so the final duration reflects
  ACTIVE training time, not wall-clock elapsed.

---

## CrossFit Admin Routes

```
POST   /api/admin/crossfit/classes               → { trainerProfileId, name, dayOfWeek, startTime, durationMin?, maxCapacity? } → CrossfitClass
GET    /api/admin/crossfit/classes               → {} → CrossfitClass[] (with trainer name + enrollment count)
PUT    /api/admin/crossfit/classes/[id]          → { trainerProfileId?, name?, dayOfWeek?, startTime?, durationMin?, maxCapacity?, isActive? } → CrossfitClass
POST   /api/admin/crossfit/enrollments           → { classId, clientProfileId?, clientType, externalName?, externalPhone? } → CrossfitEnrollment
GET    /api/admin/crossfit/enrollments           → ?classId&clientType → CrossfitEnrollment[]
DELETE /api/admin/crossfit/enrollments/[id]      → {} → { success: true }
GET    /api/admin/crossfit/attendance            → ?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD&classId?&search?&page?&pageSize? → Paginated<AttendanceRow> & { stats: AttendanceStats }
```

`AttendanceRow` shape (used by the admin Attendance log tab — added 2026-05-17):

```typescript
{
  id: string;
  date: string;                                            // YYYY-MM-DD of the session
  class: { id: string; name: string; startTime: string };  // "HH:MM"
  member: {
    type: 'GYM_MEMBER' | 'EXTERNAL';
    name: string;                                          // full name OR externalName / "Walk-in"
    profileImageUrl: string | null;
  };
  markedAt: string;                                        // ISO 8601
  markedByName: string;                                    // trainer/admin who marked it
}
```

Notes:

- Role: `BRANCH_ADMIN | SUPER_ADMIN`, branch-scoped.
- `dateFrom`/`dateTo` are inclusive; defaults to last 7 days at the UI level (not the API).
- `search` matches `client.user.firstName`/`lastName` (case-insensitive contains) OR
  `externalName` so walk-ins surface alongside members.
- `markedByName` resolves `CrossfitAttendance.markedByUserId` via a side query
  (no Prisma relation on that column).
- Default `pageSize=25`, max `100`.

`AttendanceStats` block (always included on the response, reflects the SAME
filter context as the table — `dateFrom`, `dateTo`, `classId`, `search`):

```typescript
{
  totalAttendances: number; // count of attendance rows matching the filter
  uniqueMembers: number; // distinct (clientProfileId, externalName) tuples
  sessionsHeld: number; // distinct CrossfitSessions touched by the filtered attendances
  totalDurationMin: number; // Σ (endedAt − startedAt) across those sessions;
  // sessions with null startedAt/endedAt contribute 0
}
```

## CrossFit Trainer Routes

```
GET    /api/crossfit/classes                     → {} → CrossfitClass[] (trainer's own classes only, by trainerProfileId from JWT)
POST   /api/crossfit/sessions                    → { classId, date: "YYYY-MM-DD" } → CrossfitSession (upsert — returns existing if already opened)
GET    /api/crossfit/sessions/[id]/attendance    → {} → CrossfitAttendance[] (with client: { id, firstName, lastName, profileImageUrl })
POST   /api/crossfit/sessions/[id]/attendance    → { clientProfileId?, externalName? } → CrossfitAttendance
DELETE /api/crossfit/sessions/[id]/attendance/[attendanceId] → {} → { success: true }
GET    /api/crossfit/clients/search              → ?q=string&classId? → [{ id, name, isEnrolled, profileImageUrl }]
       q: min 2 chars, searches firstName + lastName of active branch clients
       classId: optional, marks which results are already enrolled in that class
       Added: 2026-04-04
```

## Kickboxing Admin Routes

```
POST   /api/admin/kickboxing/classes              → { trainerProfileId, name, dayOfWeek, startTime, durationMin?, maxCapacity? } → KickboxingClass
GET    /api/admin/kickboxing/classes              → {} → KickboxingClass[] (with trainer name + enrollment count)
PUT    /api/admin/kickboxing/classes/[id]         → { trainerProfileId?, name?, dayOfWeek?, startTime?, durationMin?, maxCapacity?, isActive? } → KickboxingClass
POST   /api/admin/kickboxing/enrollments          → { classId, clientProfileId?, clientType, externalName?, externalPhone? } → KickboxingEnrollment
GET    /api/admin/kickboxing/enrollments          → ?classId&clientType → KickboxingEnrollment[]
DELETE /api/admin/kickboxing/enrollments/[id]     → {} → { success: true }
```

## Kickboxing Trainer Routes (Phase 23 — Added 2026-04-24)

Auth: `KICKBOXING_TRAINER | TRAINER | SUPER_ADMIN | BRANCH_ADMIN`

```
GET    /api/kickboxing/classes                              → {} → KickboxingClass[] (trainer's own active classes only)
GET    /api/kickboxing/sessions/today                       → {} → [{ class: KickboxingClass, session: KickboxingSession | null }]
POST   /api/kickboxing/sessions                            → { classId, date: "YYYY-MM-DD" } → KickboxingSession (upsert — returns existing if already opened)
POST   /api/kickboxing/sessions/[id]/start                  → {} → KickboxingSession (status → IN_PROGRESS; idempotent)
POST   /api/kickboxing/sessions/[id]/end                    → {} → KickboxingSession (status → COMPLETED; idempotent)
GET    /api/kickboxing/sessions/[id]/attendance             → {} → KickboxingAttendance[] (with client: { firstName, lastName, profileImageUrl })
POST   /api/kickboxing/sessions/[id]/attendance             → { clientProfileId?, externalName? } → KickboxingAttendance (201)
DELETE /api/kickboxing/sessions/[id]/attendance/[attendanceId] → {} → { success: true }
GET    /api/kickboxing/classes/[id]/enrollments             → {} → EnrolledMember[] (per-class; not program-wide)
GET    /api/kickboxing/clients/search                       → ?q=string&classId? → [{ id, name, isEnrolled, profileImageUrl }]
```

`KickboxingSession: { id, classId, date, status: SCHEDULED|IN_PROGRESS|COMPLETED, startedAt, endedAt, _count: { attendances } }`
`KickboxingAttendance: { id, sessionId, clientProfileId, externalName, markedAt, client: { user: { firstName, lastName, profileImageUrl } } | null }`
`EnrolledMember: { enrollmentId, clientProfileId, externalName, name, profileImageUrl, clientType: GYM_MEMBER|EXTERNAL_ONLY }`

Note: Attendance is locked (POST/DELETE rejected) once session status is `COMPLETED`.
Note: Kickboxing enrollment is **per-class** (unlike CrossFit which is program-wide).

---

## Community Routes (Phase 21 — Added 2026-04-06)

> All routes require CLIENT, TRAINER, BRANCH_ADMIN, or SUPER_ADMIN role.
> All data is branch-scoped. Reaction/comment/delete require clientProfileId in session.

```
GET    /api/community/feed                       → ?cursor?&limit? → { posts: CommunityPost[], nextCursor: string|null }
POST   /api/community/posts                      → { content?, exerciseId?, weightKg?, reps? } → CommunityPost
DELETE /api/community/posts/[id]                 → {} → { success: true }  (owner only — soft-hides post)
POST   /api/community/posts/[id]/react           → {} → { reacted: boolean }  (toggle praise)
POST   /api/community/posts/[id]/comments        → { content: string } → CommunityComment
DELETE /api/community/posts/[id]/comments/[commentId] → {} → { success: true }  (owner only)
GET    /api/community/leaderboard                → {} → Exercise[]  (compound exercises list)
GET    /api/community/leaderboard                → ?exerciseId=<id> → LeaderboardEntry[]
```

### CommunityPost shape

```typescript
{
  id: string;
  content: string | null;
  exerciseId: string | null;
  weightKg: number | null;
  reps: number | null;
  isAutoGenerated: boolean;
  createdAt: string;
  client: { id, user: { firstName, lastName, profileImageUrl } };
  exercise: { id, name } | null;
  reactions: { id, clientProfileId }[];
  comments: CommunityComment[];
  _count: { reactions: number, comments: number };
}
```

### LeaderboardEntry shape

```typescript
{
  rank: number;
  clientProfileId: string;
  firstName: string;
  lastName: string;
  profileImageUrl: string | null;
  maxWeightKg: number;
  reps: number | null;
  achievedAt: string;
}
```

### POST /api/trainer/workouts response (updated)

Now includes `autoGeneratedPostIds: string[]` alongside `newBadges` — list of community post IDs
auto-created by compound PR detection. UI shows a dismissible banner with a "Remove" option.

**Per-session dedup (2026-05-13):** auto-save fires on every keystroke, so naive
PR posting spammed the feed (one post per save). The service now looks up any
existing auto-generated post for the same `(clientProfileId, exerciseId)`
created since `sessionInstance.startedAt ?? scheduledDate`. If found, it
updates `weightKg`/`reps` in place when the new max is higher and **omits the
ID from the response** so the trainer's "🏆 New PR posted" banner shows once
per session per lift. Only true first-time-this-session posts return an ID.

**PR badge eval bug (fixed 2026-05-13):** `evaluatePRBadges` previously queried
`previousMax` across all sets including the current session — since badge eval
runs after the transaction commits, the just-saved sets were already in the
comparison and `currentWeightKg <= prevMaxKg` was always true. Now takes an
optional `currentSessionInstanceId` and excludes that session from the lookup,
matching the same exclusion in the community-post code path right above it.

---

## TV Dashboard Routes (Phase 26 — Added 2026-05-11)

> Read paths require `TV_DISPLAY | BRANCH_ADMIN | SUPER_ADMIN`. Write/admin paths
> (device registration, control state) require `BRANCH_ADMIN | SUPER_ADMIN`.
> The TV device authenticates via a long-lived bearer token from the `tv_devices`
> table (token plaintext returned only on POST creation; stored hashed).
> All data branch-scoped. Opted-out clients (`ClientProfile.showOnTv = false`)
> are excluded from leaderboards/streaks/badges/perfect-attendance/live-now
> name-and-photo panels but counted in anonymous aggregates. `latestPRs` is
> the exception — PRs are public/celebratory and the per-post opt-out is the
> "Remove" button on the community feed (`isHidden=true`), not the client-wide
> TV flag.

### Dashboard payload (rotation deck)

```
GET    /api/admin/tv/dashboard    → ?month=YYYY-MM → TvDashboardPayload
       60s server cache. Returns the full v1 panel set for the caller's branch.
GET    /api/admin/tv/live         → {} → TvLivePayload
       10s server cache. liveNow sessions + last 10 PR posts + current control
       state (pin + shoutout). The TV polls this every ~10s — it is the
       canonical source of truth for everything that needs sub-minute freshness.
```

`TvLivePayload` shape:

```typescript
{
  generatedAt: string;
  liveNow:        { count: number; sessions: LiveSessionRow[] };
  latestPRs:      PrFeedRow[];          // last 10, last 7 days
  announcements:  TvAnnouncementRow[];  // active, non-expired, sorted
  upcomingEvents: TvEventRow[];         // future-dated, active, top 5
  control: {
    pinnedPanels: string[];
    shoutout:    { message: string; expiresAt: string } | null;
  };
}
```

> `latestPRs` deliberately does **not** filter by `ClientProfile.showOnTv`. PRs
> are public/celebratory moments; the per-post opt-out is "Remove from feed"
> (which sets `isHidden=true`), not the client-wide TV flag. This matches the
> filter in `tv-dashboard.service.getLatestPRs`. Aligned 2026-05-13.

The TV detects fresh compound-PRs by diffing the `latestPRs` array against a
local "last seen" timestamp watermark — anything newer than the watermark
triggers a 10-second confetti takeover, then the watermark advances.

`TvDashboardPayload` shape:

```typescript
{
  generatedAt: string;     // ISO 8601
  month: string;           // "2026-05"
  branchId: string;
  branchName: string;
  panels: {
    compoundLeaderboards: {
      bench:    { male: LeaderRow[]; female: LeaderRow[] };
      squat:    { male: LeaderRow[]; female: LeaderRow[] };
      deadlift: { male: LeaderRow[]; female: LeaderRow[] };
      ohp:      { male: LeaderRow[]; female: LeaderRow[] };
    };
    volumeKings: { male: VolumeRow[]; female: VolumeRow[] };  // top 5 each
    streaks:           StreakRow[];          // unified, top 5
    badgesThisMonth:   BadgeUnlockRow[];     // scrolling feed
    latestPRs:         PrFeedRow[];          // last 10, last 7 days
    perfectAttendance: AttendanceRow[];      // 100% attendance this month
    liveNow:           { count: number; sessions: LiveSessionRow[] };
    announcements:     TvAnnouncementRow[];  // active, non-expired, sorted
    upcomingEvents:    TvEventRow[];         // future-dated, active, top 5
  };
  control: {
    pinnedPanels: string[];
    shoutout:    { message: string; expiresAt: string } | null;
  };
}

LeaderRow:          { clientProfileId, clientName, profileImageUrl, weightKg, reps, achievedAt }
VolumeRow:          { clientName, profileImageUrl, totalVolumeKg }
StreakRow:          { clientName, profileImageUrl, streakDays }
BadgeUnlockRow:     { clientName, profileImageUrl, badgeName, badgeIcon, awardedAt }
PrFeedRow:          { clientName, profileImageUrl, exerciseName, weightKg, reps, achievedAt }
AttendanceRow:      { clientName, profileImageUrl, completedCount }
LiveSessionRow:     { trainerName, clientName, startedAt }
TvAnnouncementRow:  { id, title, body, icon, sortOrder, isActive, expiresAt, createdAt, updatedAt }
TvEventRow:         { id, title, description, location, icon, eventAt, sortOrder, isActive, createdAt, updatedAt }
```

> The TV display rotates through `compoundLeaderboards.{bench,squat,deadlift}`
> (OHP removed 2026-05-13), `latestPRs`, the `events` "Coming Up" board (only when
> `upcomingEvents.length > 0`), and each item in `announcements` (one slide per
> active row). Other panels (volume/streaks/badges/perfectAttendance/liveNow)
> remain in the payload for future use but are not currently rendered.

When `ClientProfile.showOnTv = false`, the client is omitted from
`compoundLeaderboards`, `volumeKings`, `streaks`, `badgesThisMonth`,
`perfectAttendance`, and `liveNow.sessions`. They still count toward
`liveNow.count` (anonymously). `latestPRs` is **not** filtered by `showOnTv`
(see preamble above).

### Device registration (admin)

```
GET    /api/admin/tv/devices         → {} → TvDevice[] (no token in response)
POST   /api/admin/tv/devices         → { name } → { device, token }
       Returns the plaintext token ONCE. Store in the TV's URL/cookie.
       Audit: TV_DEVICE_REGISTERED
DELETE /api/admin/tv/devices/[id]    → {} → { success: true }
       Soft-revoke: sets revokedAt. Audit: TV_DEVICE_REVOKED
```

`TvDevice` shape: `{ id, branchId, name, lastSeenAt, revokedAt, createdAt, createdByUserId }`

### Admin pin / shoutout (control plane)

```
GET    /api/admin/tv-control         → {} → TvControlState
POST   /api/admin/tv-control         body: {
                                       pinnedPanels?: string[],      // [] = auto-rotate all;
                                                                     // 1+ = rotate only those
                                       shoutout?:    string | null,
                                       shoutoutTtlSec?: number       // default 60, max 600
                                     } → TvControlState
       Upserts the branch's singleton row. The TV picks up the change on its
       next `/api/admin/tv/live` poll (≤10s) — no Pusher fanout.
       Audit: TV_PIN_SET or TV_SHOUTOUT_BROADCAST (one per mutation)
```

`TvControlState` shape: `{ id, branchId, pinnedPanels, shoutout, shoutoutExpiresAt, updatedByUserId, updatedAt }`
(`pinnedPanels: string[]` — see ADR-035; supersedes the original single `pinnedPanel`.)

### TV announcements (multi-slide deck)

```
GET    /api/admin/tv/announcements         → {} → TvAnnouncementRow[]
POST   /api/admin/tv/announcements         body: {
                                             title:      string,
                                             body:       string,
                                             icon?:      string | null,   // emoji, max 8 chars
                                             sortOrder?: number,
                                             isActive?:  boolean,
                                             expiresAt?: ISO datetime | null
                                           } → TvAnnouncementRow
       Audit: TV_ANNOUNCEMENT_CREATED
PATCH  /api/admin/tv/announcements/[id]    same body shape (all optional)
       Audit: TV_ANNOUNCEMENT_UPDATED
DELETE /api/admin/tv/announcements/[id]    → { id, deleted: true }
       Audit: TV_ANNOUNCEMENT_DELETED
```

`TvAnnouncementRow` shape: `{ id, title, body, icon, sortOrder, isActive, expiresAt, createdAt, updatedAt }`

Each active, non-expired row becomes one full-screen slide in the TV rotation,
sized into a deck of one slot per slide. The TV picks up changes on its next
`/api/admin/tv/live` poll (≤10s).

### TV upcoming events ("Coming Up" board — Added 2026-05-13)

```
GET    /api/admin/tv/events         → {} → TvEventRow[]
POST   /api/admin/tv/events         body: {
                                      title:        string,             // 1..120
                                      description?: string | null,      // ..800
                                      location?:    string | null,      // ..200
                                      icon?:        string | null,      // emoji, ..8
                                      eventAt:      ISO datetime,       // required
                                      sortOrder?:   number,
                                      isActive?:    boolean
                                    } → TvEventRow
       Audit: TV_EVENT_CREATED
PATCH  /api/admin/tv/events/[id]    same body shape (all optional)
       Audit: TV_EVENT_UPDATED
DELETE /api/admin/tv/events/[id]    → { id, deleted: true }
       Audit: TV_EVENT_DELETED
```

`TvEventRow` shape: `{ id, title, description, location, icon, eventAt, sortOrder, isActive, createdAt, updatedAt }`

Unlike announcements (one slide per row), **all** active future-dated events
collapse into a single "Coming Up" board slide showing the next 5. Past events
auto-hide via the `eventAt >= now` filter at query time — no manual cleanup
needed. The slide is skipped from rotation when zero events match.

### Profile image upload (Added 2026-05-13)

> Uploads land in Cloudinary under `sector7/profile-images/{branchId}/{userId}`.
> The stored URL has face-aware crop (`c_fill,g_face,w_400,h_400,f_auto,q_auto`)
> baked in via Cloudinary URL transformations — consumers (TV panels, lists,
> avatars) render the URL directly with no per-call transform. The same
> `User.profileImageUrl` field is written for both admin and client uploads.
> Max file size 5 MB; allowed mime types: `image/jpeg`, `image/png`, `image/webp`.
> Audit: `USER_PROFILE_IMAGE_UPDATED` / `USER_PROFILE_IMAGE_REMOVED`.

```
POST   /api/admin/users/[id]/profile-image    multipart/form-data, field "file" → { profileImageUrl }
       Role: BRANCH_ADMIN | SUPER_ADMIN. Branch-scoped to caller.
DELETE /api/admin/users/[id]/profile-image    → { profileImageUrl: null }
       Same auth. Clears the URL. Cloudinary asset is left orphaned.

GET    /api/client/profile/image              → { profileImageUrl: string | null }
       Role: CLIENT only. Returns the caller's current photo URL.
POST   /api/client/profile/image              multipart/form-data, field "file" → { profileImageUrl }
       Role: CLIENT only. Always scoped to caller's own user row.
DELETE /api/client/profile/image              → { profileImageUrl: null }
       Role: CLIENT only.
```

Errors:

- `INVALID_FILE_TYPE` (400) — mime type not in allow-list
- `FILE_TOO_LARGE` (400) — > 5 MB
- `CLOUDINARY_NOT_CONFIGURED` (500) — env vars missing
- `NOT_FOUND` (404) — user not in caller's branch

### Client opt-in toggle

```
GET    /api/client/profile/tv-opt-in → {} → { showOnTv: boolean }
       Role: CLIENT only. Returns the caller's current opt-in flag so the
       settings UI can render the initial toggle state without a flicker.
PUT    /api/client/profile/tv-opt-in → { showOnTv: boolean } → { showOnTv }
       Role: CLIENT only. Updates own ClientProfile.showOnTv.
       Audit: CLIENT_TV_OPT_IN_TOGGLED (only fired when value actually changes)
```

### TV transport: polling, not Pusher (superseded 2026-05-12)

The TV display uses polling against `/api/admin/tv/dashboard` (60s) and
`/api/admin/tv/live` (10s). See ADR-033. Existing `session-{id}` and `user-{id}`
Pusher channels are untouched and continue to serve trainer/client real-time
features (rest timer, session pause, notifications).

### TV transport: narrow Pusher channel for celebration moments (ADR-038 — 2026-05-16)

Two TV events are delivered via Pusher on `branch-{branchId}` for instant
celebration; polling remains the source of truth for everything else.

```
Channel: branch-{branchId}
  → PR_CELEBRATED       { clientProfileId, clientName, profileImageUrl,
                          exerciseId, exerciseName,
                          slotKey: 'bench'|'squat'|'deadlift'|'ohp'|null,
                          weightKg, reps, achievedAt }
                          Fired by workout.service.createWorkoutLogs on the
                          first-time-this-session compound PR detection (same
                          branch that creates the auto-generated CommunityPost).
                          Per-session dedup means auto-save mid-edit doesn't
                          double-fire — see ADR-038.

  → LEADERBOARD_CHANGED  { slotKey, exerciseId }
                          Fired alongside PR_CELEBRATED. TV refetches dashboard
                          and (if slotKey is in the rotation deck) jumps to that
                          panel before resuming the 15s cycle. Server caches
                          (tv-dashboard.service, tv-live.service) are invalidated
                          for the branch before the event is emitted so the
                          immediate refetch reads fresh data.
```

The `/api/admin/tv/live` 10s poll continues to fire alongside as a graceful-
degrade path; the TV's `lastSeenPrAt` watermark de-duplicates a PR that arrives
via both transports. If Pusher delivery is dropped entirely, confetti and the
leaderboard-jump animation lag back to ≤10s — every other feature continues
unchanged.

Auth: channel is public. Payloads are non-sensitive (first/last name + lift
weight — same as the wall display already broadcasts via polling). The TV
client auths to the polling endpoints with its bearer token; the Pusher
channel is just a notification stream.

---

## Cron Routes

Scheduled/background entry points. All share the same auth: an
`Authorization: Bearer ${CRON_SECRET}` header, `500 MISCONFIGURED` when the env
var is unset, `401 UNAUTHORIZED` on a wrong token. They scan **all branches**
(no request session to scope by) — one of the two documented exceptions to
branch scoping in `rules/engineering-principles.md` §1. Data never crosses
branches: every write uses the scanned row's own `branchId`.

```
POST  /api/cron/process-cycles                 → Vercel Cron, daily 20:00 UTC
        Processes expired PtPackage windows. See carryforward.service.

GET|POST /api/cron/session-overrun-reminders   → EXTERNAL pinger, every ~15 min
        Overrun reminders + 24h auto-close. See ADR-048.
        Response: { data: { scanned, remindersSent, autoClosed } }

        Not a Vercel Cron: the Hobby plan caps crons at once/day, which is
        useless for a reminder that must land minutes after a session's booked
        end. Driven by cron-job.org hitting the public prod origin. GET is
        accepted as well as POST because cron-job.org defaults to GET and the
        handler is idempotent.

        Idempotent by construction:
          • reminders dedupe against notification_logs
            (metadata.type = 'SESSION_OVERRUN' + metadata.sessionInstanceId
             + numeric metadata.stage)
          • auto-close is self-limiting — the row leaves IN_PROGRESS
```

### Notification metadata added

Both are consumed by `lib/notification-routing.ts` (kind `alert`; trainers
deep-link to `/trainer/session/{id}`, admins fall through to `/admin/sessions`).

```
{ type: 'SESSION_OVERRUN',     sessionInstanceId, stage: 1 | 2 }
{ type: 'SESSION_AUTO_CLOSED', sessionInstanceId }
```

`stage` is load-bearing — it is the dedup key. Anything writing a
SESSION_OVERRUN notification must keep emitting both fields.
