# Phase 19 — CrossFit Module: Full Specification

> Written: 2026-04-04
> Status: In Progress
> Agent: @architect + @backend + @ui

---

## Overview

The CrossFit module extends Sector 7 with a group fitness attendance tracking feature for CrossFit classes. It is architecturally similar to the existing Kickboxing module but adds **per-session attendance marking** — the key workflow difference.

| Feature                        | Kickboxing                 | CrossFit                                |
| ------------------------------ | -------------------------- | --------------------------------------- |
| Admin class management         | ✅                         | ✅                                      |
| Admin enrollment management    | ✅                         | ✅                                      |
| Trainer attendance per session | ❌ (enrollment count only) | ✅ (React Select search + mark present) |
| External (non-app) clients     | ✅                         | ✅                                      |

---

## User Roles

**Admin (SUPER_ADMIN / BRANCH_ADMIN):**

- Creates CrossFit class schedules
- Assigns a CrossFit trainer to each class
- Enrolls gym members and external clients into classes

**CrossFit Trainer (CROSSFIT_TRAINER — new role):**

- Views their assigned classes
- Opens a session for a specific class + date
- Searches for clients by name using a combobox
- Marks clients as present / removes attendance
- Cannot modify class schedules or enrollments

---

## Database Schema

### CrossfitClass

Defines a recurring class schedule (same as KickboxingClass, plus a `name` field):

- `branchId`, `trainerProfileId`, `name`, `dayOfWeek`, `startTime`, `durationMin`, `maxCapacity`, `isActive`

### CrossfitEnrollment

Who is enrolled in a class. Reuses `KickboxingClientType` enum:

- `branchId`, `classId`, `clientProfileId?`, `clientType`, `externalName?`, `externalPhone?`, `isActive`

### CrossfitSession

A single occurrence of a class on a specific date. Created by the trainer when they start taking attendance:

- `branchId`, `classId`, `date`
- Unique constraint: `[classId, date]` — cannot open the same class twice on the same day

### CrossfitAttendance

One record per client per session, marking them as present:

- `branchId`, `sessionId`, `clientProfileId?`, `externalName?`, `markedByUserId`, `markedAt`
- Unique constraint: `[sessionId, clientProfileId]` — cannot mark the same client twice

---

## API Contracts

### Admin Routes (`/api/admin/crossfit/`)

```
POST   /api/admin/crossfit/classes
  Body: { trainerProfileId, name, dayOfWeek, startTime, durationMin?, maxCapacity? }
  Returns: CrossfitClass (with trainer name, enrollment count)

GET    /api/admin/crossfit/classes
  Returns: CrossfitClass[] (with trainer name, enrollment count)

PUT    /api/admin/crossfit/classes/[id]
  Body: { trainerProfileId?, name?, dayOfWeek?, startTime?, durationMin?, maxCapacity?, isActive? }
  Returns: CrossfitClass

POST   /api/admin/crossfit/enrollments
  Body: { classId, clientProfileId?, clientType, externalName?, externalPhone? }
  Returns: CrossfitEnrollment (with client name)

GET    /api/admin/crossfit/enrollments
  Query: ?classId&clientType
  Returns: CrossfitEnrollment[]

DELETE /api/admin/crossfit/enrollments/[id]
  Returns: { success: true }
```

### CrossFit Trainer Routes (`/api/crossfit/`)

```
GET    /api/crossfit/classes
  Returns: CrossfitClass[] (only trainer's own classes, by trainerProfileId from session)

POST   /api/crossfit/sessions
  Body: { classId, date: "YYYY-MM-DD" }
  Returns: CrossfitSession (creates new or returns existing for that class+date)

GET    /api/crossfit/sessions/[id]/attendance
  Returns: CrossfitAttendance[] (with client firstName, lastName, profileImageUrl)

POST   /api/crossfit/sessions/[id]/attendance
  Body: { clientProfileId?, externalName? }
  Returns: CrossfitAttendance

DELETE /api/crossfit/sessions/[id]/attendance/[attendanceId]
  Returns: { success: true }

GET    /api/crossfit/clients/search
  Query: ?q=string (min 2 chars) &classId? (optional — filters to enrolled only)
  Returns: [{ id, name, isEnrolled, profileImageUrl }]
  Note: searches firstName + lastName of active clients in branch
```

---

## UI: Admin CrossFit Page (`/admin/crossfit`)

Identical tab structure to `/admin/kickboxing`:

**Tab 1: Classes**

- Table: Class Name | Day | Time | Duration | Capacity | Enrolled Count | Trainer | Status | Actions
- "Add Class" button → modal with form fields (name, day, time, duration, capacity, trainer selector)
- Edit/toggle active inline

**Tab 2: Enrollments**

- Filter by class (dropdown), filter by client type (GYM_MEMBER | EXTERNAL_ONLY)
- Table: Client Name | Type | Class | Enrolled At | Actions (remove)
- "Enroll Member" button → modal: select class, select client type, search/select client or enter external details

---

## UI: CrossFit Trainer Page (`/trainer/crossfit`)

Three-step flow on mobile:

**Step 1 — Select Class**

- Dropdown of trainer's classes (name + day + time)
- Each option shows enrolled count

**Step 2 — Date**

- Date defaults to today
- Can navigate backward to log retroactively

**Step 3 — Attendance**

- Header: "CrossFit Attendance — [Class Name] — [Date]" + attendance count badge
- Searchable combobox (shadcn Command component):
  - Type name to search branch clients
  - Each result shows name + enrolled/not-enrolled badge
  - Click to mark as present → appears in attendance list below
- Attendance list: avatar + name + "Marked at HH:MM" + remove button (X)
- Total count at bottom: "X members present"

---

## Service Functions (`src/services/crossfit.service.ts`)

```typescript
// Class CRUD
createCrossfitClass(input, branchId, actorId)
getCrossfitClasses(branchId)
getCrossfitClassesByTrainer(trainerProfileId, branchId)
updateCrossfitClass(id, input, branchId, actorId)

// Enrollment CRUD
createCrossfitEnrollment(input, branchId, actorId)
getCrossfitEnrollments(filters, branchId)
deleteCrossfitEnrollment(id, branchId, actorId)

// Session management
getOrCreateCrossfitSession(classId, date, branchId)

// Attendance
markCrossfitAttendance(sessionId, input, markedByUserId, branchId)
removeCrossfitAttendance(sessionId, attendanceId, branchId, actorId)
getCrossfitAttendance(sessionId, branchId)

// Search
searchCrossfitClients(query, branchId, classId?)
```

---

## Audit Events

| Action                        | When                                              |
| ----------------------------- | ------------------------------------------------- |
| `CROSSFIT_CLASS_CREATED`      | Admin creates a class                             |
| `CROSSFIT_CLASS_UPDATED`      | Admin updates a class                             |
| `CROSSFIT_ENROLLMENT_CREATED` | Admin enrolls a client                            |
| `CROSSFIT_ENROLLMENT_REMOVED` | Admin removes enrollment                          |
| `CROSSFIT_SESSION_OPENED`     | Trainer opens a session (creates CrossfitSession) |
| `CROSSFIT_ATTENDANCE_MARKED`  | Trainer marks a client present                    |
| `CROSSFIT_ATTENDANCE_REMOVED` | Trainer removes an attendance mark                |

---

## Phase 20 & 21 Preview (documented for future pickup)

### Phase 20 — Achievement Badges

- New models: `BadgeDefinition`, `UserBadge`
- Badge types: STREAK, PERSONAL_RECORD, WEIGHT_LOSS, FAT_LOSS, MUSCLE_GAIN, MILESTONE
- Triggers: wired into session.service (streak), workout.service (PR), progress.service (body comp)
- New API: `GET /api/client/badges`, `GET /api/admin/users/[id]/badges`
- New UI: BadgeGrid component, badge section on client profile, celebratory toast on award

### Phase 21 — Community Leaderboard

- New models: `CommunityPost`, `CommunityReaction`, `CommunityComment`
- New field on Exercise: `isCompound Boolean @default(false)`
- Compound lift leaderboard: ranked query of MAX(WorkoutSet.weightKg) per client per exercise
- Community feed: Instagram-like cards with praise reactions and comments
- Auto-post on PR: when a new compound lift PR is detected after workout save
- New API: `GET /api/community/feed`, `POST /api/community/posts`, reaction/comment endpoints, `GET /api/community/leaderboard`
- New pages: `/community` (feed), `/community/leaderboard` (ranked tables by exercise)
