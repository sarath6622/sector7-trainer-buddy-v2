# Database Schema — Sector 7

> Last updated: Pre-development (March 2026)
> ORM: Prisma 5.x | Database: PostgreSQL 16

---

## Schema Design Principles

1. **Every entity has `branchId`** except `Branch`, `ExerciseCategory`, and `Exercise` (global)
2. **Soft deletes** via `deletedAt` on all user-facing entities
3. **Audit log is append-only** — no updates, no deletes
4. **Timestamps** on everything: `createdAt`, `updatedAt`
5. **Enums** are PostgreSQL native enums (not string fields)

---

## Complete Prisma Schema

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─── ENUMS ───────────────────────────────────────────

enum UserRole {
  SUPER_ADMIN
  BRANCH_ADMIN
  TRAINER
  KICKBOXING_TRAINER
  CLIENT
}

enum SessionStatus {
  SCHEDULED
  IN_PROGRESS
  COMPLETED
  NO_SHOW
  CANCELLED
}

enum LeaveStatus {
  PENDING
  APPROVED
  REJECTED
}

enum PaymentStatus {
  PAID
  PENDING
  OVERDUE
}

enum PaymentMethod {
  CASH
  UPI
  CARD
  BANK_TRANSFER
  OTHER
}

enum AttendanceStatus {
  PRESENT
  NO_SHOW
  UNAVAILABLE
}

enum NotificationChannel {
  WHATSAPP
  IN_APP
  BOTH
}

enum NotificationStatus {
  SENT
  FAILED
  PENDING
}

enum DayOfWeek {
  MONDAY
  TUESDAY
  WEDNESDAY
  THURSDAY
  FRIDAY
  SATURDAY
  SUNDAY
}

enum KickboxingClientType {
  GYM_MEMBER
  EXTERNAL_ONLY
}

enum DifficultyLevel {
  EASY
  MEDIUM
  HARD
}

enum ExerciseCategory {
  HYPERTROPHY
  CARDIO
  FLEXIBILITY
  STRENGTH
  FUNCTIONAL
}

// ─── BRANCH ──────────────────────────────────────────

model Branch {
  id        String   @id @default(cuid())
  name      String
  address   String?
  phone     String?
  email     String?
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // Relations
  users              User[]
  trainerProfiles    TrainerProfile[]
  clientProfiles     ClientProfile[]
  ptPackages         PtPackage[]
  sessionSchedules   SessionSchedule[]
  sessionInstances   SessionInstance[]
  leaveRequests      LeaveRequest[]
  clientUnavailability ClientUnavailability[]
  trainerReassignments TrainerReassignment[]
  kickboxingClasses  KickboxingClass[]
  kickboxingEnrollments KickboxingEnrollment[]
  paymentRecords     PaymentRecord[]
  notificationLogs   NotificationLog[]
  auditLogs          AuditLog[]
  branchSettings     BranchSettings?

  @@map("branches")
}

// ─── BRANCH SETTINGS ─────────────────────────────────

model BranchSettings {
  id                        String  @id @default(cuid())
  branchId                  String  @unique
  defaultSessionDurationMin Int     @default(60)
  carryForwardLimit         Int     @default(3)
  cancellationPolicyEnabled Boolean @default(false)
  cancellationWindowMin     Int     @default(120) // minutes before session
  reminderTimingMin         Int     @default(60)  // minutes before session
  noShowThresholdMin        Int     @default(15)  // minutes late = no-show
  kickboxingClassSizeLimit  Int     @default(20)
  createdAt                 DateTime @default(now())
  updatedAt                 DateTime @updatedAt

  branch Branch @relation(fields: [branchId], references: [id])

  @@map("branch_settings")
}

// ─── USER ────────────────────────────────────────────

model User {
  id             String    @id @default(cuid())
  branchId       String
  email          String    @unique
  phone          String?
  passwordHash   String
  firstName      String
  lastName       String
  role           UserRole
  profileImageUrl String?
  isActive       Boolean   @default(true)
  lastLoginAt    DateTime?
  deletedAt      DateTime?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  branch         Branch          @relation(fields: [branchId], references: [id])
  trainerProfile TrainerProfile?
  clientProfile  ClientProfile?

  // Actions performed by this user
  auditLogsAsActor     AuditLog[]           @relation("AuditActor")
  notificationsReceived NotificationLog[]   @relation("NotificationRecipient")

  @@index([branchId, role])
  @@index([email])
  @@map("users")
}

// ─── TRAINER PROFILE ─────────────────────────────────

model TrainerProfile {
  id             String   @id @default(cuid())
  userId         String   @unique
  branchId       String
  specialties    String[]
  certifications String[]
  bio            String?
  // DEPRECATED (Phase 1 — 2026-04-22): workingHoursStart and workingHoursEnd
  // are kept as nullable but nulled out by migration. Use TrainerShift instead.
  workingHoursStart String?
  workingHoursEnd   String?
  // workingDays is kept as a derived union of all TrainerShift.days.
  // Updated by the service layer on every shift add/remove.
  workingDays    DayOfWeek[]
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  user     User   @relation(fields: [userId], references: [id])
  branch   Branch @relation(fields: [branchId], references: [id])

  // Relations
  ptPackages           PtPackage[]
  sessionSchedules     SessionSchedule[]     @relation("ScheduleTrainer")
  sessionInstances     SessionInstance[]      @relation("InstanceTrainer")
  leaveRequests        LeaveRequest[]
  reassignmentsFrom    TrainerReassignment[] @relation("OriginalTrainer")
  reassignmentsTo      TrainerReassignment[] @relation("ReplacementTrainer")
  availabilityOverrides TrainerAvailabilityOverride[]
  shifts               TrainerShift[]         // ← NEW: multi-shift model
  kickboxingClasses    KickboxingClass[]
  crossfitClasses      CrossfitClass[]

  @@index([branchId])
  @@map("trainer_profiles")
}

// ─── TRAINER SHIFTS (Phase 1 — 2026-04-22) ──────────

/// Replaces the single workingHoursStart/End window.
/// A trainer is available for a session if day+time falls within ANY of their shifts.
/// Zero shifts = all-day available (fallback).
model TrainerShift {
  id               String      @id @default(cuid())
  branchId         String
  trainerProfileId String
  label            String      // "Morning", "Evening", or custom
  startTime        String      // "06:00" (24hr HH:MM)
  endTime          String      // "10:30" (24hr HH:MM)
  days             DayOfWeek[] // days this shift covers
  createdAt        DateTime    @default(now())
  updatedAt        DateTime    @updatedAt

  branch  Branch         @relation(fields: [branchId], references: [id])
  trainer TrainerProfile @relation(fields: [trainerProfileId], references: [id])

  @@index([branchId, trainerProfileId])
  @@map("trainer_shifts")
}

// ─── CLIENT PROFILE ──────────────────────────────────

model ClientProfile {
  id                     String    @id @default(cuid())
  userId                 String    @unique
  branchId               String
  dateOfBirth            DateTime?
  emergencyContactName   String?
  emergencyContactPhone  String?
  height                 Float?    // cm
  currentWeight          Float?    // kg
  bodyFatPercentage      Float?
  medicalConditions      String?
  fitnessGoals           String?
  sessionDurationOverrideMin Int?  // null = use branch default
  createdAt              DateTime  @default(now())
  updatedAt              DateTime  @updatedAt

  user     User   @relation(fields: [userId], references: [id])
  branch   Branch @relation(fields: [branchId], references: [id])

  // Relations
  ptPackages         PtPackage[]
  sessionSchedules   SessionSchedule[]   @relation("ScheduleClient")
  sessionInstances   SessionInstance[]   @relation("InstanceClient")
  unavailability     ClientUnavailability[]
  progressEntries    ProgressEntry[]
  paymentRecords     PaymentRecord[]
  kickboxingEnrollments KickboxingEnrollment[]

  @@index([branchId])
  @@map("client_profiles")
}

// ─── PT PACKAGE ──────────────────────────────────────

model PtPackage {
  id                String   @id @default(cuid())
  branchId          String
  clientProfileId   String
  trainerProfileId  String
  sessionsPerMonth  Int
  sessionChargeAmount Float?
  isActive          Boolean  @default(true)
  startDate         DateTime
  endDate           DateTime?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  branch   Branch         @relation(fields: [branchId], references: [id])
  client   ClientProfile  @relation(fields: [clientProfileId], references: [id])
  trainer  TrainerProfile @relation(fields: [trainerProfileId], references: [id])

  @@index([branchId, clientProfileId])
  @@index([branchId, trainerProfileId])
  @@map("pt_packages")
}

// ─── SESSION SCHEDULE (recurring template) ───────────

model SessionSchedule {
  id               String    @id @default(cuid())
  branchId         String
  clientProfileId  String
  trainerProfileId String
  dayOfWeek        DayOfWeek
  startTime        String    // "07:00" (24hr format)
  durationMin      Int       // overrides client/branch default if set
  isActive         Boolean   @default(true)
  validFrom        DateTime
  validUntil       DateTime?
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt

  branch  Branch         @relation(fields: [branchId], references: [id])
  client  ClientProfile  @relation("ScheduleClient", fields: [clientProfileId], references: [id])
  trainer TrainerProfile @relation("ScheduleTrainer", fields: [trainerProfileId], references: [id])

  sessionInstances SessionInstance[]

  @@index([branchId, trainerProfileId])
  @@index([branchId, clientProfileId])
  @@map("session_schedules")
}

// ─── SESSION INSTANCE (single occurrence) ────────────

model SessionInstance {
  id               String        @id @default(cuid())
  branchId         String
  scheduleId       String?
  clientProfileId  String
  trainerProfileId String
  scheduledDate    DateTime      // date of session
  scheduledTime    String        // "07:00"
  durationMin      Int
  status           SessionStatus @default(SCHEDULED)
  startedAt        DateTime?
  endedAt          DateTime?
  actualDurationMin Int?
  startedByUserId  String?
  endedByUserId    String?
  noShowMarkedAt   DateTime?
  noShowMarkedByUserId String?
  cancelledAt      DateTime?
  cancelledByUserId String?
  cancellationWithinWindow Boolean?
  isCarryForward   Boolean       @default(false)
  carryForwardFromMonth DateTime?
  notes            String?
  // Server-tracked session pause (mirrors RestTimer pattern). Both trainer
  // and client subscribe to SESSION_PAUSE_UPDATED on the session channel
  // and see the same frozen elapsed counter. endSession finalizes the
  // accumulator and subtracts it from actualDurationMin.
  pausedAt              DateTime?
  accumulatedPausedSec  Int       @default(0)
  pausedByUserId        String?
  pauseUpdatedAt        DateTime? // dedicated monotonic stamp for the wire
  createdAt        DateTime      @default(now())
  updatedAt        DateTime      @updatedAt

  branch   Branch          @relation(fields: [branchId], references: [id])
  schedule SessionSchedule? @relation(fields: [scheduleId], references: [id])
  client   ClientProfile   @relation("InstanceClient", fields: [clientProfileId], references: [id])
  trainer  TrainerProfile  @relation("InstanceTrainer", fields: [trainerProfileId], references: [id])

  workoutLogs          WorkoutLog[]
  trainerReassignment  TrainerReassignment?

  @@index([branchId, scheduledDate])
  @@index([branchId, clientProfileId, scheduledDate])
  @@index([branchId, trainerProfileId, scheduledDate])
  @@index([status])
  @@map("session_instances")
}

// ─── WORKOUT LOG ─────────────────────────────────────

model WorkoutLog {
  id                String   @id @default(cuid())
  sessionInstanceId String
  exerciseId        String
  orderIndex        Int      // order in the workout
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  sessionInstance SessionInstance @relation(fields: [sessionInstanceId], references: [id])
  exercise        Exercise        @relation(fields: [exerciseId], references: [id])

  sets WorkoutSet[]

  @@index([sessionInstanceId])
  @@map("workout_logs")
}

model WorkoutSet {
  id           String  @id @default(cuid())
  workoutLogId String
  setNumber    Int
  reps         Int?
  weightKg     Float?
  durationSec  Int?    // for timed exercises
  rpe          Int?    // 1-10 Rate of Perceived Exertion
  notes        String?
  createdAt    DateTime @default(now())

  workoutLog WorkoutLog @relation(fields: [workoutLogId], references: [id])

  @@index([workoutLogId])
  @@map("workout_sets")
}

// ─── EXERCISE LIBRARY (global) ───────────────────────

model Exercise {
  id                  String           @id @default(cuid())
  name                String
  targetMuscleGroup   String
  secondaryMuscles    String[]
  equipmentRequired   String?
  difficulty          DifficultyLevel?
  category            ExerciseCategory
  instructions        String?
  demoVideoUrl        String?
  demoGifUrl          String?
  isActive            Boolean          @default(true)
  createdAt           DateTime         @default(now())
  updatedAt           DateTime         @updatedAt

  workoutLogs WorkoutLog[]

  @@index([targetMuscleGroup])
  @@index([category])
  @@map("exercises")
}

// ─── PROGRESS TRACKING ───────────────────────────────

model ProgressEntry {
  id              String   @id @default(cuid())
  clientProfileId String
  recordedAt      DateTime @default(now())
  recordedByUserId String  // trainer or client
  weightKg        Float?
  bodyFatPercent   Float?
  muscleMass       Float?
  chest            Float?  // cm
  waist            Float?
  hips             Float?
  bicepLeft        Float?
  bicepRight       Float?
  thighLeft        Float?
  thighRight       Float?
  photoUrls        String[]
  notes            String?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  client ClientProfile @relation(fields: [clientProfileId], references: [id])

  @@index([clientProfileId, recordedAt])
  @@map("progress_entries")
}

// ─── LEAVE MANAGEMENT ────────────────────────────────

model LeaveRequest {
  id               String      @id @default(cuid())
  branchId         String
  trainerProfileId String
  startDate        DateTime
  endDate          DateTime
  reason           String?
  status           LeaveStatus @default(PENDING)
  reviewedByUserId String?
  reviewedAt       DateTime?
  reviewNotes      String?
  createdAt        DateTime    @default(now())
  updatedAt        DateTime    @updatedAt

  branch  Branch         @relation(fields: [branchId], references: [id])
  trainer TrainerProfile @relation(fields: [trainerProfileId], references: [id])

  @@index([branchId, trainerProfileId])
  @@index([branchId, status])
  @@map("leave_requests")
}

model ClientUnavailability {
  id              String   @id @default(cuid())
  branchId        String
  clientProfileId String
  date            DateTime
  reason          String?
  createdAt       DateTime @default(now())

  branch Branch        @relation(fields: [branchId], references: [id])
  client ClientProfile @relation(fields: [clientProfileId], references: [id])

  @@unique([clientProfileId, date])
  @@index([branchId, date])
  @@map("client_unavailability")
}

// ─── TRAINER REASSIGNMENT ────────────────────────────

model TrainerReassignment {
  id                    String   @id @default(cuid())
  branchId              String
  sessionInstanceId     String   @unique
  originalTrainerProfileId String
  replacementTrainerProfileId String
  reassignedByUserId    String   // admin who did it
  reason                String?
  createdAt             DateTime @default(now())

  branch           Branch          @relation(fields: [branchId], references: [id])
  sessionInstance  SessionInstance @relation(fields: [sessionInstanceId], references: [id])
  originalTrainer  TrainerProfile  @relation("OriginalTrainer", fields: [originalTrainerProfileId], references: [id])
  replacementTrainer TrainerProfile @relation("ReplacementTrainer", fields: [replacementTrainerProfileId], references: [id])

  @@index([branchId])
  @@map("trainer_reassignments")
}

// ─── KICKBOXING ──────────────────────────────────────

model KickboxingClass {
  id               String   @id @default(cuid())
  branchId         String
  trainerProfileId String   // kickboxing trainer
  dayOfWeek        DayOfWeek
  startTime        String   // "18:00"
  durationMin      Int      @default(60)
  maxCapacity      Int      @default(20)
  isActive         Boolean  @default(true)
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  branch  Branch         @relation(fields: [branchId], references: [id])
  trainer TrainerProfile @relation(fields: [trainerProfileId], references: [id])

  enrollments KickboxingEnrollment[]

  @@index([branchId])
  @@map("kickboxing_classes")
}

model KickboxingEnrollment {
  id              String              @id @default(cuid())
  branchId        String
  classId         String
  clientProfileId String?             // null for external-only clients
  clientType      KickboxingClientType
  externalName    String?             // for EXTERNAL_ONLY (no app user)
  externalPhone   String?
  isActive        Boolean             @default(true)
  enrolledAt      DateTime            @default(now())
  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt

  branch Branch              @relation(fields: [branchId], references: [id])
  class  KickboxingClass     @relation(fields: [classId], references: [id])
  client ClientProfile?      @relation(fields: [clientProfileId], references: [id])

  @@index([branchId, clientType])
  @@map("kickboxing_enrollments")
}

// ─── PAYMENTS ────────────────────────────────────────

model PaymentRecord {
  id              String        @id @default(cuid())
  branchId        String
  clientProfileId String
  amount          Float
  method          PaymentMethod
  status          PaymentStatus @default(PENDING)
  paidAt          DateTime?
  periodStart     DateTime?     // billing period
  periodEnd       DateTime?
  notes           String?
  recordedByUserId String       // admin who logged it
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  branch Branch        @relation(fields: [branchId], references: [id])
  client ClientProfile @relation(fields: [clientProfileId], references: [id])

  @@index([branchId, clientProfileId])
  @@index([branchId, status])
  @@map("payment_records")
}

// ─── NOTIFICATIONS ───────────────────────────────────

model NotificationLog {
  id          String             @id @default(cuid())
  branchId    String
  recipientId String
  channel     NotificationChannel
  status      NotificationStatus @default(PENDING)
  title       String
  body        String
  metadata    Json?              // template vars, links, etc.
  sentAt      DateTime?
  failReason  String?
  createdAt   DateTime           @default(now())

  branch    Branch @relation(fields: [branchId], references: [id])
  recipient User   @relation("NotificationRecipient", fields: [recipientId], references: [id])

  @@index([branchId, recipientId])
  @@index([branchId, status])
  @@map("notification_logs")
}

// ─── AUDIT LOG ───────────────────────────────────────

model AuditLog {
  id          String   @id @default(cuid())
  branchId    String
  actorId     String
  action      String   // e.g., SESSION_STARTED, LEAVE_APPROVED, PAYMENT_LOGGED
  subjectType String   // e.g., SessionInstance, LeaveRequest, PaymentRecord
  subjectId   String
  oldValue    Json?
  newValue    Json?
  metadata    Json?
  ipAddress   String?
  userAgent   String?
  createdAt   DateTime @default(now())

  branch Branch @relation(fields: [branchId], references: [id])
  actor  User   @relation("AuditActor", fields: [actorId], references: [id])

  @@index([branchId, action])
  @@index([branchId, subjectType, subjectId])
  @@index([branchId, actorId])
  @@index([createdAt])
  @@map("audit_logs")
}
```

---

## Key Relationships Summary

- A **User** has one **TrainerProfile** or one **ClientProfile** (based on role)
- A **Client** can have multiple **PtPackages** (one per trainer)
- A **SessionSchedule** is a recurring template; **SessionInstance** is a single occurrence
- A **WorkoutLog** belongs to a **SessionInstance** and references an **Exercise**
- **TrainerReassignment** links to a single **SessionInstance** (one-time swap)
- **KickboxingEnrollment** optionally links to a **ClientProfile** (null for external clients)
- **AuditLog** and **NotificationLog** are append-only operational tables
- **RescheduleRequest** links a **ClientProfile** to a **SessionInstance** with a proposed new date/time; reviewed by admin or trainer

---

## Phase 22 Schema Additions (2026-04-17)

### New Enum: RescheduleStatus

```prisma
enum RescheduleStatus {
  PENDING
  APPROVED
  REJECTED
}
```

### New Model: RescheduleRequest

```prisma
model RescheduleRequest {
  id                String           @id @default(cuid())
  branchId          String
  sessionInstanceId String           // session the client wants to reschedule
  clientProfileId   String           // client making the request
  requestedDate     DateTime         // proposed new date
  requestedTime     String           // proposed new time "HH:MM" (24hr)
  reason            String?
  status            RescheduleStatus @default(PENDING)
  reviewedByUserId  String?          // admin or trainer who actioned it
  reviewedAt        DateTime?
  reviewNotes       String?
  createdAt         DateTime         @default(now())
  updatedAt         DateTime         @updatedAt

  // One PENDING request allowed per session at a time (service layer enforcement)
  @@map("reschedule_requests")
}
```

### Altered: SessionSchedule

- Added `createdByUserId String?` — tracks whether admin or trainer created the schedule (null on legacy records)

### Migration

- `20260417100000_add_reschedule_request` — applied to Neon DB

---

## Phase 23 Schema Additions (2026-04-24)

### New Enum: KickboxingSessionStatus

```prisma
enum KickboxingSessionStatus {
  SCHEDULED
  IN_PROGRESS
  COMPLETED
}
```

### Altered: KickboxingClass

- Added `name String` — class display name (e.g. "Monday 6PM Kickboxing"). Required. Existing rows default to empty string via migration.

### New Model: KickboxingSession

```prisma
model KickboxingSession {
  id              String                  @id @default(cuid())
  branchId        String
  classId         String                  // KickboxingClass
  date            DateTime                // specific occurrence date
  status          KickboxingSessionStatus @default(SCHEDULED)
  startedAt       DateTime?
  endedAt         DateTime?
  startedByUserId String?
  createdAt       DateTime                @default(now())
  updatedAt       DateTime                @updatedAt

  @@unique([classId, date])
  @@map("kickboxing_sessions")
}
```

### New Model: KickboxingAttendance

```prisma
model KickboxingAttendance {
  id              String   @id @default(cuid())
  branchId        String
  sessionId       String                  // KickboxingSession
  clientProfileId String?                 // null for external/walk-in
  externalName    String?                 // for walk-ins not in the system
  markedByUserId  String                  // kickboxing trainer user id
  markedAt        DateTime @default(now())

  @@unique([sessionId, clientProfileId])
  @@map("kickboxing_attendances")
}
```

### Migration

- `20260424100000_add_kickboxing_sessions_attendance` — applied to both local Docker and Neon DB

---

## Phase 25 Schema Additions (2026-05-08)

Phase 25 introduces a per-branch catalog of named PT package plans plus per-package
session totals and onboarding backfill. See ADR-027, ADR-028, ADR-029, ADR-030.

### New Model: PtPackagePlan

A reusable, per-branch catalog entry. Admin defines once, picks from a dropdown
when assigning a trainer to a client.

```prisma
model PtPackagePlan {
  id                  String   @id @default(cuid())
  branchId            String
  name                String
  sessionsPerMonth    Int      // monthly rate (e.g. 12 sessions/month)
  pricePerCycle       Float    // total price for one cycle
  sessionChargeAmount Float?   // optional per-session quote
  durationDays        Int      @default(30)  // length of one cycle
  description         String?
  isActive            Boolean  @default(true)
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  branch   Branch      @relation(fields: [branchId], references: [id])
  packages PtPackage[]

  @@unique([branchId, name])  // unique name per branch
  @@index([branchId, isActive])
  @@map("pt_package_plans")
}
```

### Altered: PtPackage

```prisma
model PtPackage {
  // ... existing fields ...
  planId                  String?         // nullable — Custom assignments stay null
  totalSessions           Int      @default(0)  // authoritative count for full window
  onboardingUsedSessions  Int      @default(0)  // backfill for sessions used pre-onboarding
  onboardingNotes         String?

  plan PtPackagePlan? @relation(fields: [planId], references: [id])

  @@index([branchId, planId])
}
```

- `planId` is set when admin picks a plan from the dropdown; null for "Custom" assignments.
  Existing assignments remain valid if the plan is later deactivated (FK is `ON DELETE SET NULL` —
  but plans are soft-deactivated, never hard-deleted, so this rarely fires).
- `totalSessions` is the source of truth for "how many sessions this client has in this package."
  At create time it is auto-computed as `sessionsPerMonth × round(durationDays / 30)` when a plan
  is selected, otherwise defaults to `sessionsPerMonth`. Admin can override per assignment.
- `onboardingUsedSessions` counts toward `used` in package-window accounting but does NOT
  create synthetic `SessionInstance` rows (so attendance/workout reports remain truthful).
- `sessionsPerMonth` is retained as the rate label; it is no longer the authoritative total.

### Migrations

- `20260508110000_add_pt_package_plans` — creates `pt_package_plans` and `pt_packages.planId`
- `20260508120000_add_plan_duration_days` — adds `pt_package_plans.durationDays` (default 30)
- `20260508130000_add_package_total_and_onboarding` — adds `pt_packages.totalSessions`,
  `onboardingUsedSessions`, `onboardingNotes`. Backfills `totalSessions` from
  `sessionsPerMonth × round(durationDays / 30)` for plan-linked rows; fallback to
  `sessionsPerMonth` for the rest.

All three applied to local Docker first, then Neon.

---

## Phase 26 Schema Additions — TV Dashboard (2026-05-11)

Phase 26 introduces the admin-only gym TV leaderboard surface. See ADR-032.
All changes are additive; existing rows are preserved.

### Altered: UserRole

```prisma
enum UserRole {
  ...
  TV_DISPLAY  // read-only, branch-scoped role for the unattended gym TV
}
```

### Altered: ClientProfile

```prisma
model ClientProfile {
  ...
  showOnTv Boolean @default(false)
}
```

Opt-in flag for the TV leaderboard. When `false` the client is excluded from
name/photo panels and live PR/badge takeovers. Anonymous aggregates (total
volume, attendance counts, etc.) still include the client.

### New Model: TvDevice

Physical TVs registered against a branch. Bearer token is stored as a bcrypt
hash; plaintext is returned only on creation.

```prisma
model TvDevice {
  id              String    @id @default(cuid())
  branchId        String
  name            String    // human label, e.g. "Main Floor TV"
  tokenHash       String    @unique
  lastSeenAt      DateTime?
  revokedAt       DateTime?
  createdByUserId String
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  branch Branch @relation(fields: [branchId], references: [id])

  @@index([branchId])
  @@map("tv_devices")
}
```

### New Model: TvControlState

Singleton row per branch holding admin-driven overrides for the TV display
rotation. `pinnedPanels` restricts rotation to a chosen subset of panels —
empty = auto-rotate everything, one entry = effectively frozen on that panel
(see ADR-035; supersedes the original single `pinnedPanel String?`). `shoutout`
is a transient banner shown until `shoutoutExpiresAt`.

```prisma
model TvControlState {
  id                String   @id @default(cuid())
  branchId          String   @unique
  pinnedPanels      String[]
  shoutout          String?
  shoutoutExpiresAt DateTime?
  updatedByUserId   String?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  branch Branch @relation(fields: [branchId], references: [id])

  @@map("tv_control_state")
}
```

### Audit Actions Registered

- `TV_DEVICE_REGISTERED` / `TV_DEVICE_REVOKED`
- `TV_PIN_SET` (pin / unpin a panel)
- `TV_SHOUTOUT_BROADCAST`
- `CLIENT_TV_OPT_IN_TOGGLED`

### Migrations

- `20260511181814_add_tv_display_role_and_devices` — adds `TV_DISPLAY` enum value + `tv_devices` table.
- `20260511181903_add_tv_dashboard_phase_1` — adds `client_profiles.showOnTv` column (NOT NULL DEFAULT false) + `tv_control_state` table.

Both applied to local Docker first, then Neon. Pre/post row counts on Neon
verified identical for all existing tables (`client_profiles`, `users`,
`session_instances`, `workout_logs`, `workout_sets`, `progress_entries`,
`community_posts`, `user_badges`, `audit_logs`).

## TV Schema Additions — Announcements + Events (2026-05-12 → 2026-05-13)

### New Model: TvAnnouncement (2026-05-12)

Multi-slide announcement deck — each active, non-expired row becomes one
full-screen slide in the TV rotation. Admins manage from `/admin/tv-control`.

```prisma
model TvAnnouncement {
  id              String    @id @default(cuid())
  branchId        String
  title           String
  body            String
  icon            String?   // emoji or short label
  sortOrder       Int       @default(0)
  isActive        Boolean   @default(true)
  expiresAt       DateTime?
  createdByUserId String?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  branch Branch @relation(fields: [branchId], references: [id])

  @@index([branchId, isActive])
  @@map("tv_announcements")
}
```

### New Model: TvEvent (2026-05-13)

Upcoming gym events (beach workouts, fun runs, charity WODs, etc.) shown as a
single "Coming Up" board in the TV rotation. Past events auto-hide via the
`eventAt >= now` filter at query time — no manual cleanup. Unlike announcements
(one slide per row), all active future-dated events collapse into one slide
showing the next 5.

```prisma
model TvEvent {
  id              String   @id @default(cuid())
  branchId        String
  title           String
  description     String?
  location        String?
  icon            String?
  eventAt         DateTime
  sortOrder       Int      @default(0)
  isActive        Boolean  @default(true)
  createdByUserId String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  branch Branch @relation(fields: [branchId], references: [id])

  @@index([branchId, isActive, eventAt])
  @@map("tv_events")
}
```

### Audit Actions Registered

- `TV_ANNOUNCEMENT_CREATED` / `TV_ANNOUNCEMENT_UPDATED` / `TV_ANNOUNCEMENT_DELETED`
- `TV_EVENT_CREATED` / `TV_EVENT_UPDATED` / `TV_EVENT_DELETED`

### Migrations

- `20260512063036_add_tv_announcements` — adds `tv_announcements` table.
- `20260512203603_add_tv_events` — adds `tv_events` table.

Applied to both local Docker and Neon. Both tables are leaf nodes (no existing
data depends on them) so the migrations are purely additive — no row counts
needed for verification.

## TV Control Multi-Pin (2026-05-14)

### Altered: TvControlState

- `pinnedPanel String?` replaced with `pinnedPanels String[]`. Empty array =
  auto-rotate everything; one or more entries = TV rotates through only that
  subset. See ADR-035.

### Migration

- `20260514100000_tv_control_multi_pin` — adds `pinnedPanels TEXT[] NOT NULL
DEFAULT ARRAY[]::TEXT[]`, backfills it from the old single `pinnedPanel`
  (one-element array where set), then drops `pinnedPanel`. Applied to local
  Docker and Neon.
