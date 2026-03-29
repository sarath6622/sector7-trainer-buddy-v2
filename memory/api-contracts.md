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

```
POST   /api/admin/mappings               → { clientProfileId, trainerProfileId, sessionsPerMonth, sessionCharge, startDate } → PtPackage
GET    /api/admin/mappings               → ?trainerId&clientId → PtPackage[]
PUT    /api/admin/mappings/[id]          → { sessionsPerMonth?, sessionCharge?, isActive? } → PtPackage
DELETE /api/admin/mappings/[id]          → {} → { success }
```

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
  → SESSION_STARTED    { sessionId, startedAt, expectedDurationMin }
  → SESSION_TIMER_TICK { sessionId, elapsedMin }  (every minute)
  → SESSION_TIME_COMPLETE { sessionId, message }   (when designated time is up)
  → SESSION_ENDED      { sessionId, endedAt, actualDurationMin }

Channel: user:{userId}
  → NOTIFICATION       { id, title, body, type }
  → LEAVE_STATUS_CHANGED { leaveId, status }
  → TRAINER_REASSIGNED { sessionId, newTrainerName, date, time }
```
