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
