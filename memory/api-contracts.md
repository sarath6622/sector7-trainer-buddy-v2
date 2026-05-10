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
GET    /api/admin/users                  → ?role=TRAINER|CLIENT&page&pageSize → Paginated<User>
POST   /api/admin/users                  → { email, firstName, lastName, phone, role, ...profileFields } → User
GET    /api/admin/users/[id]             → {} → User (with profile)
PUT    /api/admin/users/[id]             → { ...updatedFields } → User
DELETE /api/admin/users/[id]             → {} → { success } (soft delete)
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
GET    /api/admin/sessions               → ?date&trainerId&clientId&status&page&pageSize → Paginated<SessionInstance>
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
```

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
  sets: {
    setNumber: number;
    reps?: number;
    weightKg?: number;
    durationSec?: number;
    rpe?: number;
    notes?: string;
  }[];
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
