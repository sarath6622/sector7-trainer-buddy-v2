# Project Context — Sector 7

> Last updated: Pre-development (March 2026)

---

## What Is Sector 7?

Sector 7 is a gym member management and personal training (PT) session platform. It is NOT a general fitness app. It is an **operational tool** for gym staff to manage:

1. **PT session scheduling** — Admin books trainer-client sessions monthly
2. **Attendance & workout logging** — Trainer logs workouts which auto-marks attendance
3. **Leave management** — Trainer leaves with admin approval and client reassignment
4. **Session accounting** — Track used/remaining/carry-forward sessions per client
5. **Kickboxing enrollment** — Parallel module for group class tracking
6. **Payment tracking** — Manual payment logging (no gateway integration)

---

## Who Uses It?

### Admin (Branch Admin / Super Admin)

- Creates all user profiles (clients and trainers)
- Maps trainers to clients
- Schedules all PT sessions (clients cannot self-book)
- Approves trainer leaves and manually reassigns clients
- Configures all settings (session duration, carry-forward limits, cancellation policy, reminder timing)
- Manages exercise library
- Manages kickboxing enrollments
- Logs payments manually
- Views reports, analytics, and audit logs

### Trainer (PT Trainer)

- Views their assigned client list only (cannot see other trainers' clients)
- Views their PT schedule as assigned by admin (read-only)
- Starts/ends workout sessions (marks attendance + starts timer)
- Logs workout exercises from the exercise library
- Views and edits client progress (weight, body fat, measurements)
- Applies for leave
- Cannot reassign clients or modify schedule

### Client (Gym Member)

- Views their own session count (used/remaining/carry-forward)
- Sees live session timer when trainer starts a workout
- Views past workout history and progress charts
- Marks themselves as unavailable (no approval needed)
- Cannot choose or change their trainer
- Cannot book or cancel sessions

### Kickboxing Trainer

- Separate role from PT Trainer
- Manages group kickboxing classes
- Tracks class attendance

### Kickboxing-Only Client (External)

- No app access at all — tracked by admin only

---

## Critical Business Rules

### Session Lifecycle

1. Admin defines a PT package per client: X sessions/month with Trainer Y at $Z/session
2. Admin schedules recurring weekly slots (free-form, not fixed slots)
3. System generates individual session instances for the month
4. Trainer opens a session → taps "Start Workout" → attendance is marked, timer starts
5. Trainer logs exercises during session
6. Trainer taps "End Session" → timer stops, duration recorded
7. If client doesn't show: trainer marks "No-Show" → counts as used session

### Carry-Forward Rules

- Unused sessions at month-end expire
- Maximum of N sessions carry forward (default: 3, configurable per branch)
- Carry-forward sessions are consumed FIRST in the new month
- Applies regardless of whether client marked unavailability

### Leave & Reassignment

- Trainers apply for leave → admin approves/rejects
- On approval, system identifies all affected clients
- Admin manually reassigns using "Vacant Trainers Per Slot" view
- Reassignment is a one-time swap (original mapping preserved)
- Admin can bulk-reassign or permanently change mapping if needed
- Client is notified of reassignment via WhatsApp + in-app

### Conflict Detection

- Soft warning only — not a hard block
- Fires when admin books two clients with the same trainer at overlapping times
- Admin can override (logged in audit trail)

### Cancellation Policy

- Admin toggle (ON/OFF per branch)
- Configurable window (e.g., 2 hours before session)
- Cancel within window → session counts as used
- Cancel before window → session returned as available
- All cancellations audited

### Client Unavailability

- Client marks dates they won't attend (no admin approval)
- Session treated as unused (subject to carry-forward rules)
- Different from no-show: unavailability is planned, no-show is unplanned

### Payment

- No payment gateway — admin logs payments manually
- Status: Paid / Pending / Overdue
- Visible on client list and profile

---

## Multi-Branch Architecture

- Every entity is scoped to a `branchId`
- Super Admin sees all branches; Branch Admin sees only their branch
- Settings (session duration, carry-forward limit, cancellation window, reminder timing) are per-branch
- Trainer and client data is branch-isolated
- Exercise library is global (shared across branches)

---

## Notification Channels

1. **WhatsApp Business API** — Session reminders, leave updates, reassignment notices, carry-forward summaries
2. **In-App (FCM)** — All events + real-time session timer updates
3. **Fallback** — If WhatsApp fails, in-app notification is guaranteed

Reminder timing is globally configurable by admin in App Settings.
