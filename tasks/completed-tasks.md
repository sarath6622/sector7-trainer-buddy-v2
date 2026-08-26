# Completed Tasks — Sector 7

> Append new entries at the top. Never delete or modify completed entries.

---

## Session Overrun Reminders + 24h Auto-Close (2026-08-26)

### S7-SESS-OVERRUN: Nudge trainers who never ended a session, close what they abandon

- **Agent:** @backend
- **Completed:** 2026-08-26
- **Branch:** `feat/session-overrun-reminders` (off `main`, via a throwaway
  worktree — the Flutter branch must never touch main)

**Problem:** a session only leaves `IN_PROGRESS` when the trainer taps "End
Session", and trainers forget. The operator hit one open for **45 days**. A
read-only dry-run of the local DB found **9 abandoned sessions**, 45–104 days
old. The trainer dashboard already *showed* them; nothing ever pushed.

**Built:**

- Reminder 1 at the session's booked `durationMin`, reminder 2 at `+15`.
  Trainer only — no client notifications (only trainers can end a session).
  Only the highest *due* stage is sent, so a late-detected session gets one
  nudge, not a backlog.
- 24h auto-close: `status = COMPLETED`, `endedByUserId = 'system'`,
  `actualDurationMin` = the booked duration, `endedAt` = the booked end (keeps
  the row internally consistent). Audited as `SESSION_AUTO_CLOSED`, Pusher
  `SESSION_ENDED` emitted, trainer + branch admins notified.
- Dedup reads back `notification_logs` via Postgres JSON-path filters — one
  query per pass, no migration.

- **Files Changed:**
  - `src/lib/sessionOverrun.ts` (extended — policy constants, `elapsedMinutes`,
    `dueOverrunStage`, `isStaleForAutoClose`, `openForLabel`)
  - `src/services/session.service.ts` (added `processOverrunReminders`)
  - `src/services/notification.service.ts` (3 triggers)
  - `src/lib/notification-routing.ts` (deep links to the session screen)
  - `src/app/api/cron/session-overrun-reminders/route.ts` (created)
  - `tests/unit/session-overrun.test.ts` (extended)
  - `tests/unit/session-overrun-scan.test.ts` (created)
  - `tests/unit/notification-routing.test.ts` (extended)
- **Memory Updated:** `api-contracts.md` (new Cron Routes section),
  `decisions.md` (ADR-048)
- **Verification:** 38 new unit tests, all passing. `type-check` clean, `lint`
  0 errors. Suite failure count unchanged from baseline (49 pre-existing
  Prisma-mock failures before and after). JSON-path dedup filter verified
  against real local Postgres (mocks can't catch a bad filter). Policy
  dry-run against the 9 real abandoned rows.
- **NOT done — the feature is inert until these happen:** deploy to `main`,
  then hit the endpoint once manually to drain the backlog under observation,
  then create the cron-job.org job (every 15 min, `Bearer $CRON_SECRET`).
- **Flagged to operator:** auto-close moves a session from `remaining` to
  `used` in `getSessionCounts` (`used = completed + noShow`). This corrects
  accounting the abandoned rows were getting wrong, but each affected client's
  remaining count drops by one. See ADR-048 "Consequences".

---

## Fuzzy Exercise Search (2026-08-26)

### S7-EX-FUZZY: Exercise picker finds the lift the trainer actually typed

**Problem:** on `/trainer/session/[id]`, searching "incline press" returned
nothing while "incline chest press" returned two hits. `listExercises` matched
the whole query as one SQL substring (`contains`), so any query whose words are
not contiguous in the catalog name failed. Trainers don't know how a lift is
spelled in the catalog.

- **New** `src/lib/exerciseSearch.ts` — pure, in-memory relevance scorer over
  name / targetMuscleGroup / equipmentRequired. Phrase-level bands (exact →
  prefix → contains → compact) rank above a token pass that is word-order
  independent, typo-tolerant (bounded Levenshtein, edits scaled to word
  length), and matches query words spanning two catalog words.
- **Relaxed fallback** — when the strict pass (every query word must land)
  returns nothing, a second pass requiring one strong token hit returns up to
  25 near misses, flagged `relaxed: true` so the UI labels them as guesses.
  The picker is never a dead end.
- **`exercise.service.listExercises`** — chip filters (muscle group, category,
  type, isActive) stay in SQL; free-text search pulls the filtered catalog
  (capped at 1000 rows — the library is ~142) and ranks in memory. Pagination
  totals count scored matches, so they stay honest.
- **`WorkoutLogger`** — new `searchRelaxed` state renders a "No exact match for
  X — showing the closest exercises" banner above near-miss results.
- **Contract** — `GET /api/exercises` (and admin/trainer equivalents) now return
  `relaxed: boolean` alongside `data` / `pagination`. Additive; documented in
  `memory/api-contracts.md`.
- **Tests** — `tests/unit/exercise-search.test.ts` (16 cases: word order, gaps,
  typos, compounds, spanning, ranking, relaxed fallback, empty query) plus 3
  rewritten `listExercises` cases in `tests/unit/exercise-service.test.ts`.
  Verified end-to-end against the local Docker catalog.
- No schema change, no migration.

### S7-EX-KBD: Search modal raises the mobile keyboard on open

**Problem:** tapping "+" / "Search" opened the picker with the input unfocused,
costing a second tap before typing.

- `openSearch()` now runs the whole sequence inside the tap gesture: prime a
  throwaway input (raises the keyboard before the real one exists) →
  `flushSync` the modal into the DOM → `focus()` the real input. iOS only opens
  the keyboard for a `focus()` inside the originating gesture, and the previous
  `setTimeout(…, 50)` handoff ran a task too late to qualify.
- The empty-state "Add First Exercise" button called `setShowSearch(true)`
  directly, bypassing the priming entirely — now calls `openSearch()`.
- The 50ms deferred focus stays as a fallback for non-gesture opens.
- Not unit-tested: jsdom has no soft keyboard, and an `activeElement` assertion
  would have passed against the old timer-based code too. Needs a device check.

---

## Phase 23 — Kickboxing Sessions & Attendance (2026-04-24)

### S7-KB-01: Schema

- Added `KickboxingSessionStatus` enum (SCHEDULED / IN_PROGRESS / COMPLETED)
- Added `name String` field to `KickboxingClass`
- Added `KickboxingSession` model with `@@unique([classId, date])` constraint
- Added `KickboxingAttendance` model with `@@unique([sessionId, clientProfileId])` constraint
- Migration applied to local Docker via `docker exec psql` and to Neon via `prisma migrate deploy`

### S7-KB-02: Service Layer

- `getOrCreateKickboxingSession` — upsert session by classId+date (idempotent)
- `startKickboxingSession` — SCHEDULED → IN_PROGRESS (idempotent if already IN_PROGRESS)
- `endKickboxingSession` — IN_PROGRESS → COMPLETED (idempotent if already COMPLETED)
- `getTodayKickboxingSessionsForTrainer` — returns `[{class, session|null}]` for today
- `markKickboxingAttendance` — locked after COMPLETED, duplicate prevention via DB unique
- `removeKickboxingAttendance` — hard delete with audit log
- `getKickboxingAttendance` — list by sessionId
- `getEnrolledClientsForKickboxingClass` — per-class (differs from CrossFit program-wide)
- `searchKickboxingClients` — search with `isEnrolled` flag

### S7-KB-03: API Routes (10 routes)

- `GET /api/kickboxing/sessions/today`
- `POST /api/kickboxing/sessions` (open/upsert)
- `POST /api/kickboxing/sessions/[id]/start`
- `POST /api/kickboxing/sessions/[id]/end`
- `GET /api/kickboxing/sessions/[id]/attendance`
- `POST /api/kickboxing/sessions/[id]/attendance`
- `DELETE /api/kickboxing/sessions/[id]/attendance/[attendanceId]`
- `GET /api/kickboxing/classes/[id]/enrollments`
- `GET /api/kickboxing/clients/search`
- All routes: `.safeParse()` for validation (400 on error, not 500)

### S7-KB-04: Admin UI

- `src/app/(dashboard)/admin/kickboxing/page.tsx` — added `name` field to class dialog, table layout with name as primary identifier, enrollment selector shows class name

### S7-KB-05: Trainer UI

- `src/app/(dashboard)/trainer/kickboxing/page.tsx` — full roll-call/attendance page (mirrors CrossFit trainer page)
- `src/lib/constants.ts` — `KICKBOXING_TRAINER_NAV_ITEMS` pointing to `/trainer/kickboxing` with Activity icon

### S7-KB-06: QA / Tests

- `tests/unit/kickboxing-service-sessions.test.ts` — 20 unit tests for session & attendance service functions
- `tests/integration/kickboxing-session-api.test.ts` — 27 integration tests for all 7 trainer API routes
- Bug fix: sessions and attendance routes switched from `.parse()` to `.safeParse()` so validation errors return 400
- All 59 new tests pass; existing 12 kickboxing class tests still pass

---

## Phase 21 — Community Leaderboard (2026-04-06)

### S7-LB-01: Schema — CommunityPost, CommunityReaction, CommunityComment + isCompound on Exercise

- Added 3 new Prisma models: `CommunityPost`, `CommunityReaction`, `CommunityComment`
- Added `isCompound Boolean @default(false)` to `Exercise` model
- Migration: `20260406100000_add_community_leaderboard` — applied to local DB via `db push` then manually registered
- Prisma client regenerated

### S7-LB-02: community.service.ts

- `getFeed()` — paginated cursor-based feed, branch-scoped, excludes hidden posts
- `createPost()` — client/trainer creates post (auto or manual)
- `deletePost()` — soft-hides post (owner only)
- `toggleReaction()` — praise toggle (unique per user per post)
- `addComment()` — add comment with audit log
- `deleteComment()` — owner-only delete with audit log

### S7-LB-03: leaderboard.service.ts

- `getCompoundLeaderboard(branchId, exerciseId)` — raw SQL aggregation, MAX weight per client, ranked
- `getCompoundExercises()` — list all `isCompound=true` exercises for tab UI

### S7-LB-04: Auto-post wired into workout.service.ts

- After compound PR badge is earned, checks `isCompound` on exercise
- Creates community post with `isAutoGenerated: true` (ADR-020)
- Returns `autoGeneratedPostIds[]` alongside `newBadges` in API response

### S7-LB-05: API Routes /api/community/\*

- `GET /api/community/feed` — paginated feed
- `POST /api/community/posts` — create post
- `DELETE /api/community/posts/[id]` — soft-delete (owner)
- `POST /api/community/posts/[id]/react` — toggle praise
- `POST /api/community/posts/[id]/comments` — add comment
- `DELETE /api/community/posts/[id]/comments/[commentId]` — delete comment
- `GET /api/community/leaderboard` — compound exercises list or ranked entries

### S7-LB-06: isCompound in exercise admin API

- Added `isCompound` to `createExerciseSchema`, `updateExerciseSchema` in validators.ts
- Updated `exercise.service.ts` create + update handlers to persist `isCompound`

### S7-LB-07: Community Feed page (/community)

- Instagram-like card feed with infinite scroll (cursor pagination)
- Praise (heart) toggle, comment thread, delete own post/comment
- PR posts show exercise name, weight, reps with orange trophy badge

### S7-LB-08: Leaderboard page (/community/leaderboard)

- Compound exercise tabs (scrollable)
- Ranked table: gold/silver/bronze medals for top 3, current user highlighted in orange
- Links back to community feed

### S7-LB-09: Community nav link

- Added `Community` link to `TRAINER_NAV_ITEMS` and `CLIENT_NAV_ITEMS` with Flame icon

### S7-LB-10: Auto-post banner in WorkoutLogger

- Shows dismissible orange banner after PR auto-post: "New PR posted to Community feed"
- "Remove" button calls `DELETE /api/community/posts/[id]` for each auto-generated post

---

## Phase 19 — CrossFit Module (2026-04-04)

### S7-CF-01: Prisma Schema — CrossFit Models + CROSSFIT_TRAINER Role

- **Agent:** @architect
- **Completed:** 2026-04-04
- **Files Changed:**
  - `prisma/schema.prisma` — added `CROSSFIT_TRAINER` to `UserRole` enum; added `CrossfitClass`, `CrossfitEnrollment`, `CrossfitSession`, `CrossfitAttendance` models; added reverse relations to `Branch`, `TrainerProfile`, `ClientProfile`
  - `prisma/migrations/20260404062007_add_crossfit_module/migration.sql` — auto-generated
- **Memory Updated:** `memory/schema.md` (see docs/phase19-crossfit.md for full schema)
- **Notes:** Reuses `KickboxingClientType` enum for `CrossfitEnrollment.clientType`. `CrossfitSession` has `@@unique([classId, date])` to prevent duplicate sessions per day.

### S7-CF-02/03: crossfit.service.ts — Full Business Logic

- **Agent:** @backend
- **Completed:** 2026-04-04
- **Files Changed:**
  - `src/services/crossfit.service.ts` (created) — class CRUD, enrollment CRUD, `getOrCreateCrossfitSession()`, `markCrossfitAttendance()`, `removeCrossfitAttendance()`, `getCrossfitAttendance()`, `searchCrossfitClients()`
- **Notes:** `getOrCreateCrossfitSession` normalizes date to midnight UTC and upserts (returns existing session if already opened). Client search debounces and marks `isEnrolled` flag per result.

### S7-CF-04: Admin CrossFit API Routes

- **Agent:** @backend
- **Completed:** 2026-04-04
- **Files Changed:**
  - `src/app/api/admin/crossfit/classes/route.ts` (GET, POST)
  - `src/app/api/admin/crossfit/classes/[id]/route.ts` (PUT)
  - `src/app/api/admin/crossfit/enrollments/route.ts` (GET, POST)
  - `src/app/api/admin/crossfit/enrollments/[id]/route.ts` (DELETE)

### S7-CF-05: CrossFit Trainer API Routes

- **Agent:** @backend
- **Completed:** 2026-04-04
- **Files Changed:**
  - `src/app/api/crossfit/classes/route.ts` (GET — trainer's own classes)
  - `src/app/api/crossfit/sessions/route.ts` (POST — open/upsert session)
  - `src/app/api/crossfit/sessions/[id]/attendance/route.ts` (GET, POST)
  - `src/app/api/crossfit/sessions/[id]/attendance/[attendanceId]/route.ts` (DELETE)
  - `src/app/api/crossfit/clients/search/route.ts` (GET — searchable combobox)

### S7-CF-06: CrossFit Validator Schemas

- **Agent:** @backend
- **Completed:** 2026-04-04
- **Files Changed:**
  - `src/lib/validators.ts` — added `createCrossfitClassSchema`, `updateCrossfitClassSchema`, `createCrossfitEnrollmentSchema`, `listCrossfitEnrollmentsSchema`, `openCrossfitSessionSchema`, `markCrossfitAttendanceSchema`

### S7-CF-07: Admin CrossFit Page

- **Agent:** @ui
- **Completed:** 2026-04-04
- **Files Changed:**
  - `src/app/(dashboard)/admin/crossfit/page.tsx` (created) — tabs: Classes + Enrollments, mirrors kickboxing admin page
- **Notes:** Fetches CROSSFIT_TRAINER role users for trainer selector.

### S7-CF-08: CrossFit Trainer Attendance Page

- **Agent:** @ui
- **Completed:** 2026-04-04
- **Files Changed:**
  - `src/app/(dashboard)/trainer/crossfit/page.tsx` (created) — class selector → date picker → searchable combobox → attendance list with remove
- **Notes:** Search debounced 300ms. Already-marked clients filtered out of dropdown. `isEnrolled` badge shown in results. Walk-in clients show "Walk-in" badge.

### S7-CF-09: Sidebar Nav Links

- **Agent:** @ui
- **Completed:** 2026-04-04
- **Files Changed:**
  - `src/lib/constants.ts` — added `CrossFit` nav item to `ADMIN_NAV_ITEMS`; added `CROSSFIT_TRAINER_NAV_ITEMS` array with single "Attendance" link; wired `CROSSFIT_TRAINER` in `NAV_BY_ROLE`

---

## Bug Fixes, Progress Redesign & Client Self-Log (2026-03-29)

### S7-BUG-01: Chart Y-axis Labels Invisible on Dark Background

- **Agent:** @ui
- **Completed:** 2026-03-29
- **Files Changed:**
  - `src/components/workout/WorkoutLogger.tsx` — `ExerciseProgressModal`: replaced `hsl(var(--muted-foreground))` with `#888` for axis tick fill (CSS variables don't resolve inside SVG). Added `userSelect: 'none'` to prevent blue selection boxes on labels. `CartesianGrid` stroke changed from `hsl(var(--border) / 0.4)` → `rgba(255,255,255,0.08)`.
  - `src/app/(dashboard)/client/session/[id]/page.tsx` — `ClientExerciseProgressModal`: same SVG tick fill and CartesianGrid fixes applied.

### S7-BUG-02: Scheduling Day View Shows No Sessions (Timezone Bug)

- **Agent:** @ui
- **Completed:** 2026-03-29
- **Files Changed:**
  - `src/app/(dashboard)/admin/scheduling/page.tsx` — `handleDatesSet` function: `info.start.toISOString().split('T')[0]` converts to UTC, which in IST (UTC+5:30) shifts Sunday midnight local to Saturday 18:30 UTC → wrong date sent to API. Fixed by adding `localYMD()` helper using `getFullYear()`/`getMonth()`/`getDate()` (local time only).

### S7-BUG-03: Weight Metric Tile Showing "—" Despite Data Logged

- **Agent:** @ui
- **Completed:** 2026-03-29
- **Files Changed:**
  - `src/app/(dashboard)/trainer/clients/[id]/progress/page.tsx` — root cause: each `+ Log` tap creates a sparse entry (only the logged field is set). `latest = entries[0]` had only the most recent metric (e.g., bodyFat), so weight showed `—`. Fixed by adding `latestOf(key)`, `previousOf(key)`, `oldestOf(key)` helpers that scan all entries for the most recent non-null value per metric.

### S7-UX-27: Trainer Client Progress Page — Full UI Overhaul

- **Agent:** @ui
- **Completed:** 2026-03-29
- **Files Changed:**
  - `src/app/(dashboard)/trainer/clients/[id]/progress/page.tsx` — full redesign:
    - Removed the orange "+ Log" header button (each metric chip has its own log button)
    - Expanded from 4-metric (2×2) grid to all 8 metrics in a horizontal scroll strip of compact `MetricChip` components (128px wide; shows icon/label/value/delta)
    - "Tap + Log to start" empty state instead of "No change" when metric has no data
    - Distinct icons per metric: Scale(Weight), Flame(BodyFat), Dumbbell(Muscle), Ruler(Waist), Heart(Chest), MoveHorizontal(Hips), Zap(Bicep), MoveVertical(Thigh)
    - `ChartCard` uses `latestOf`/`oldestOf` helpers (fixes sparse-entry display)
    - Tab focus ring removed with `focus-visible:ring-0`

### S7-UX-28: ProgressLineChart Improvements

- **Agent:** @ui
- **Completed:** 2026-03-29
- **Files Changed:**
  - `src/components/charts/ProgressLineChart.tsx`:
    - Y-axis clip fix: `width` 40→52px, left margin 0→4
    - CSS variable fix: tick fill `hsl(var(--muted-foreground))` → `#888`, CartesianGrid stroke `hsl(var(--border)/0.5)` → `rgba(255,255,255,0.08)`
    - Trend badge hidden when `|trend| < 0.05` (suppresses spurious 0.0 display)
    - Removed duplicate "Start: X" from trend row
    - Single data point: shows value + "Log more measurements to see your trend chart" instead of mostly-empty chart

### S7-UX-29: Client Progress Page — Full Rebuild with Self-Log

- **Agent:** @ui + @backend
- **Completed:** 2026-03-29
- **Files Changed:**
  - `src/app/(dashboard)/client/progress/page.tsx` — full rebuild mirroring trainer page, adds client self-log capability:
    - All 8 metric chips in horizontal scroll strip
    - `+ Log` button on each chip → `POST /api/client/progress`
    - Pencil edit button on history cards → full edit dialog → `PUT /api/client/progress/[id]`
    - `latestOf`/`previousOf`/`oldestOf` per-metric helpers
    - Same chart improvements, tab ring fix, distinct icons, "Tap + Log to start" empty state
  - `src/app/api/client/progress/route.ts` — added `POST` handler: CLIENT role creates their own progress entry using `createProgressSchema` + `progressService.createProgressEntry`
  - `src/app/api/client/progress/[id]/route.ts` — **new file**: `PUT` handler. CLIENT role updates own entry (ownership verified). Uses `updateProgressSchema` + `progressService.updateProgressEntry`

### S7-UX-30: Client Session Page — Exercise Progress Indicator

- **Agent:** @ui
- **Completed:** 2026-03-29
- **Files Changed:**
  - `src/app/(dashboard)/client/session/[id]/page.tsx` — added `TrendingUp` button on each exercise card. Added inline `ClientExerciseProgressModal` using `GET /api/client/progress/charts?metric=exercise&exerciseId=xxx`. Dark-themed AreaChart with custom tooltip, pre-formatted dates, stat pills (Latest/Best/Change), trend banner.

### S7-NOTIF-01: Notifications on PT Package Creation

- **Agent:** @backend
- **Completed:** 2026-03-29
- **Files Changed:**
  - `src/services/pt-package.service.ts` — WhatsApp + in-app notifications sent to both trainer and client when a PT package is created.

### S7-NOTIF-02: Notifications on Session Events

- **Agent:** @backend
- **Completed:** 2026-03-29
- **Files Changed:**
  - `src/services/session-generation.service.ts` — notification sent per client-trainer pair summary after session generation.
  - `src/app/api/admin/sessions/bulk/route.ts` — notification sent on bulk session create.
  - `src/app/api/admin/sessions/[id]/route.ts` — notifications sent on session update (with change summary) and session cancellation.

### S7-MOB-01: Admin Scheduling Page Mobile Fix

- **Agent:** @ui
- **Completed:** 2026-03-29
- **Files Changed:**
  - `src/app/(dashboard)/admin/scheduling/page.tsx` — mobile-responsive layout: flex-col stacking on small screens. Also includes the `localYMD()` timezone fix (see S7-BUG-02).

### S7-MOB-02: Trainer Profile Page Mobile Fix

- **Agent:** @ui
- **Completed:** 2026-03-29
- **Files Changed:**
  - `src/app/(dashboard)/admin/trainers/[id]/page.tsx` — mobile-friendly compact header, sticky footer buttons.

---

## Session UX, Workout Logging & Progress Redesign (2026-03-28)

### S7-UX-20: Dedicated Active Session Page (Trainer)

- **Agent:** @ui + @backend
- **Completed:** 2026-03-28
- **Files Changed:**
  - `src/app/(dashboard)/trainer/session/[id]/page.tsx` — **new file**: full-screen fixed layout. Sticky header with client avatar (initials), name, date/time, live `InlineTimer` pill. Meta chips row (duration · exercises · IN PROGRESS). Client tab bar for concurrent sessions. `WorkoutLogger` in scrollable area. Sticky "End Session" ghost-red footer. Auto-starts session if SCHEDULED. See ADR-014.
  - `src/app/(dashboard)/trainer/page.tsx` — rewritten mobile-first: `handleStartSession` now calls API then `router.push`. Active session shown as compact emerald banner. Today's sessions use full-width stacked action buttons (Start + No Show below client name) instead of side-by-side. Upcoming section header simplified. Removed `max-w-3xl` → `max-w-2xl`.
- **Notes:** Removed shadcn `Button`/`Badge` imports from dashboard in favour of plain Tailwind buttons matching dark theme.

### S7-UX-21: WorkoutLogger Redesign + Bug Fixes

- **Agent:** @ui + @backend
- **Completed:** 2026-03-28
- **Files Changed:**
  - `src/components/workout/WorkoutLogger.tsx` — major redesign: type-coloured left accent border, `TYPE_CONFIG`/`TYPE_COLS` maps, collapse/expand per card, column headers + `h-10` inputs, sticky save bar only when `hasUnsaved`. Added `clientProfileId` optional prop. Added `TrendingUp` progress button per exercise card (trainer only). Inline `ExerciseProgressModal` bottom-sheet with AreaChart + stat pills. Recharts imported directly (no wrapper). Score-based dedup on `existingLogs` load (ADR-016).
  - `src/services/workout.service.ts` — delete-then-recreate pattern inside transaction (ADR-015). Fixed FK constraint order: `workoutSet.deleteMany` before `workoutLog.deleteMany`.
  - `src/services/session.service.ts` — added `exerciseType: true` to exercise select in `getSessionById` (was missing, caused TypeError at runtime). Added secondary `orderBy: [{ orderIndex: 'asc' }, { id: 'asc' }]` so newest logs appear last (dedup favours newer data).

### S7-UX-22: Client Live Session View + Session History Navigation

- **Agent:** @ui + @backend
- **Completed:** 2026-03-28
- **Files Changed:**
  - `src/app/api/client/sessions/[id]/route.ts` — **new file**: client-scoped session detail API. Includes `exerciseType` in exercise select. Scoped by `clientProfileId`.
  - `src/app/(dashboard)/client/session/[id]/page.tsx` — **new file**: read-only live workout view. Polls every 10s while `IN_PROGRESS`. Type-coloured cards, set table, same dedup logic. Auto-stops polling when session ends.
  - `src/app/(dashboard)/client/sessions/page.tsx` — added "View workout" button (Eye icon) for `COMPLETED`/`IN_PROGRESS` sessions → navigates to `/client/session/[id]`.
  - `src/app/(dashboard)/client/workouts/page.tsx` — rewrote session cards as tappable `<button>` rows (date block + exercise count + muscle tags + arrow) navigating to `/client/session/[id]`. Removed expand/collapse dropdown.

### S7-UX-23: Trainer Session View Page (Completed Sessions)

- **Agent:** @ui
- **Completed:** 2026-03-28
- **Files Changed:**
  - `src/app/(dashboard)/trainer/sessions/[id]/page.tsx` — **new file**: read-only completed session view at `/trainer/sessions/[id]` (plural). Fixed 404 that occurred when clicking "View" on a completed session from the trainer dashboard. Header shows client avatar + name + "Completed" badge. Meta chips. Same exercise card layout as client view. Fetches from existing `/api/trainer/sessions/[id]`.
- **Notes:** Route is `/trainer/sessions/[id]` (plural = completed view) vs `/trainer/session/[id]` (singular = active session).

### S7-UX-24: Client Dashboard Fitness Journey Section

- **Agent:** @ui + @backend
- **Completed:** 2026-03-28
- **Files Changed:**
  - `src/app/api/client/dashboard/route.ts` — extended to return `latestProgress`, `prevProgress` (latest 2 progress entries via `prisma.progressEntry.findMany` — note: `ProgressEntry` has no `branchId`, scoped by `clientProfileId` only), and `prs` (top 4 exercises by max weight via `workoutSet.groupBy` → exercise name join → dedup by exercise name).
  - `src/app/(dashboard)/client/page.tsx` — added "Fitness Journey" section: 2-col grid with Weight card (Scale, blue) + Body Fat card (Activity, amber), Personal Records card (gold/silver/bronze ranking circles), `Delta` component with `TrendingUp`/`TrendingDown`. All metric values use `.toFixed(1)`.
- **Notes:** `ProgressEntry` does not have a `branchId` column — the dashboard API was fixed to remove `branchId` from that query.

### S7-UX-25: Client Progress Page Redesign

- **Agent:** @ui
- **Completed:** 2026-03-28
- **Files Changed:**
  - `src/app/(dashboard)/client/progress/page.tsx` — full rewrite: mobile-first `max-w-2xl`, 2×2 stat tiles with `fmt()` (`.toFixed(1)`) on all values, full-width tabs (`flex-1`), chart cards as `rounded-2xl bg-card` (no shadcn Card wrapper), inline `ChartHeader` with current value + since-start delta pill, `HistoryCard` with date block + 3-col metric grid + LATEST badge, `EmptyState`.
- **Notes:** Removed all shadcn `Card`/`Badge` imports. `fmt()` helper used everywhere. Recharts chart height reduced to 180 on mobile.

### S7-UX-26: Trainer Client Progress Page Redesign

- **Agent:** @ui
- **Completed:** 2026-03-28
- **Files Changed:**
  - `src/app/(dashboard)/trainer/clients/[id]/progress/page.tsx` — full rewrite matching client progress redesign. 2×2 `StatTile` grid with `fmt()` + `DeltaChip` + inline "+ Log" button. Full-width 3-tab layout (Body Metrics / Workouts / History). `ChartCard` with current value + since-start delta. `MiniMetricCard` for circumference measurements. `HistoryCard` with edit (Pencil) button. All trainer features preserved: quick-log dialog, full edit dialog, `WorkoutProgressionPanel`. Removed `Table` tab (redundant with History).
  - `src/app/api/trainer/clients/[id]/exercise-progress/route.ts` — **new file**: `GET ?exerciseId=xxx`. Verifies client belongs to trainer's branch, calls `getChartData(metric='exercise', exerciseId)`.

---

## Post-Launch UI Modernization Phase 2 (2026-03-21)

### S7-UX-07: Admin Sessions Page

- **Agent:** @ui
- **Completed:** 2026-03-21
- **Files Changed:**
  - `src/app/(dashboard)/admin/sessions/page.tsx` — **new file**: admin session instances listing with status-colored badges, search/filter by status, date range filtering, pagination, loading skeletons, and empty state
- **Notes:** Uses semantic status badge colors (blue=scheduled, amber=in_progress, emerald=completed, red=no_show, zinc=cancelled). Fetches from `/api/admin/sessions` with query params for filtering and pagination.

### S7-UX-08: Admin Settings Page Modernization

- **Agent:** @ui
- **Completed:** 2026-03-21
- **Files Changed:**
  - `src/app/(dashboard)/admin/settings/page.tsx` — full rewrite: sectioned card layout with colored icons per category (Session Defaults, Carry-Forward, Cancellation Policy, Notifications, Kickboxing Classes). Loading skeleton, error state with retry, Switch toggle for cancellation policy.
- **Notes:** Each section uses `SectionCard` component with icon, color, title, description pattern. Clean form inputs with unit labels.

### S7-UX-09: Admin Analytics Page Modernization

- **Agent:** @ui
- **Completed:** 2026-03-21
- **Files Changed:**
  - `src/app/(dashboard)/admin/analytics/page.tsx` — full rewrite: 4 KPI summary cards (Revenue, Utilization, Attendance, No-Shows) with colored icons and inline progress bars. Tabbed interface (Utilization, Attendance, Consumption, No-Shows, Revenue). Recharts bar charts for utilization and no-show tabs, donut pie chart for revenue breakdown. Trainer/client cards with avatar initials, progress bars, stat chips. Export button per tab. Month selector. Loading skeleton state.
- **Notes:** Uses recharts (BarChart, PieChart) with custom tooltip component. Color-coded progress bars (green ≥80%, amber ≥60%, red <60%). Revenue tab has 5-col grid with pie chart + summary cards + breakdown list.

---

## Post-Launch UI Modernization (2026-03-21)

### S7-UX-01: Login Page Redesign

- **Agent:** @ui
- **Completed:** 2026-03-21
- **Files Changed:**
  - `src/app/(auth)/login/page.tsx` — full rewrite: split-screen dark layout (45% brand panel / 55% form), frosted glass card, password show/hide toggle, loading spinner, gradient glow behind desktop logo
- **Notes:** Always-dark page (`bg-zinc-950`), uses plain `<img>` tag for logo (Next.js Image optimization failed on the PNG)

### S7-UX-02: Logo Component — Brand PNG Integration

- **Agent:** @ui
- **Completed:** 2026-03-21
- **Files Changed:**
  - `src/components/layout/Logo.tsx` — replaced SVG text approximation with actual `sector7-logo-cropped.png`. In light mode, wraps logo in dark rounded pill (`bg-zinc-900 rounded-lg`); in dark mode, renders directly on transparent bg. Supports `variant="auto"` (default) and `variant="dark"` for always-dark contexts
  - `public/sector7-logo-cropped.png` — created: cropped version of `sector7-logo.png` removing top whitespace (2771x1200 vs original 2771x3464)
  - `src/components/layout/Sidebar.tsx` — updated Logo usage (`h-10`), sidebar header height increased to `h-16`
  - `src/components/layout/TopNav.tsx` — updated Logo usage (`h-8` for mobile topbar, `h-10 variant="dark"` for mobile sheet)
  - `src/middleware.ts` — added regex to allow image file extensions (`.png`, `.jpg`, etc.) through middleware without auth redirect
- **Memory Updated:** `decisions.md` (ADR-010: light/dark theme toggle)

### S7-UX-03: Button Color Theory — Semantic Colors

- **Agent:** @ui
- **Completed:** 2026-03-21
- **Files Changed:**
  - `src/app/(dashboard)/admin/scheduling/page.tsx` — Cancel → `variant="outline"`, Generate → blue, New Schedule → blue, filter chips → `bg-foreground/text-background`
  - `src/app/(dashboard)/admin/leaves/page.tsx` — Approve → emerald green
  - `src/app/(dashboard)/trainer/page.tsx` — Start Session → emerald green
  - `src/app/(dashboard)/admin/reassignments/page.tsx` — Search → blue
  - `src/app/(dashboard)/admin/audit-log/page.tsx` — Search → blue
  - `src/app/(dashboard)/admin/clients/page.tsx` — Add Client → blue
  - `src/app/(dashboard)/admin/trainers/page.tsx` — Add Trainer → blue
  - `src/app/(dashboard)/admin/kickboxing/page.tsx` — Add Class → blue
  - `src/app/(dashboard)/admin/exercises/page.tsx` — Add Exercise → blue
- **Memory Updated:** `decisions.md` (ADR-011: button color theory)

### S7-UX-04: Status Badge Color Semantics

- **Agent:** @ui
- **Completed:** 2026-03-21
- **Files Changed:**
  - `src/app/(dashboard)/admin/clients/page.tsx` — Active badge → emerald green, Inactive → zinc gray, Paid → emerald green, Pending → amber
  - `src/app/(dashboard)/admin/trainers/page.tsx` — Active badge → emerald green, Inactive → zinc gray
  - `src/app/(dashboard)/admin/clients/[id]/page.tsx` — Active badge → emerald green
- **Memory Updated:** `decisions.md` (ADR-012: status badge color semantics)

### S7-UX-05: Calendar Improvements

- **Agent:** @ui
- **Completed:** 2026-03-21
- **Files Changed:**
  - `src/app/globals.css` — added FullCalendar today highlighting CSS (column header orange pill badge, tinted column stripe)
  - `src/components/calendar/SessionCalendar.tsx` — added responsive mobile view detection via `matchMedia`, defaults to `timeGridDay` on mobile (<640px), `timeGridWeek` on desktop

### S7-UX-06: DashboardLayout setState Fix

- **Agent:** @ui
- **Completed:** 2026-03-21
- **Files Changed:**
  - `src/app/(dashboard)/layout.tsx` — fixed "Cannot update component while rendering" console error by wrapping `router.push('/login')` in `useEffect`

---

## Phase 18 — Testing, Polish & Launch (Completed 2026-03-20)

### S7-F18-02: Full Test Suite & Coverage

- **233 tests passing** across 23 test files
- Services layer coverage: **87.55% statements, 91.6% functions** (target: 80%)
- TypeScript: clean (0 errors)

### S7-F18-04: Security Review & Hardening

- **CRITICAL fix:** Cron endpoint (`/api/cron/month-end`) — changed `if (cronSecret && ...)` to `if (!cronSecret || ...)` to prevent unauthenticated access when CRON_SECRET is unset
- **HIGH fix:** Middleware — replaced `pathname.includes('.')` wildcard bypass with explicit static asset paths (icons, manifest, sw.js)
- **HIGH fix:** Removed spoofable `x-branch-id`, `x-user-id`, `x-user-role` response headers from middleware (unused by any API route)
- **MEDIUM fix:** Added branchId null guard in middleware — redirects to login if branchId missing
- **MEDIUM fix:** Session end `notes` field — added type check + 1000 char limit
- **Audit results:** No SQL injection risks (all Prisma ORM), no mass assignment (all Zod-validated), no committed secrets

### S7-F18-06: Enhanced Seed Script

- **File:** `prisma/seed.ts`
- Added: Past sessions marked as COMPLETED (85%), NO_SHOW (10%), CANCELLED (5%)
- Added: 2-4 workout logs with sets per completed session
- Added: Weekly progress entries for all clients (3 weeks)
- Added: Kickboxing trainer (Priya Menon) with 3 classes (Mon/Wed/Fri), 5 enrollments each
- Added: 6 sample audit log entries for UI demo

### S7-F18-07: UI Polish

- Pages reviewed for loading states, empty states, and error handling
- Most pages already had proper states — confirmed trainer/clients, client/progress, admin/audit-log, admin/analytics all have complete UX

**Phase 17 (WebSocket) skipped** — timer runs client-side, notifications use polling. Can be added post-launch.

---

## Phase 16 — Offline & PWA (Completed 2026-03-20)

### S7-F16-01: Dexie.js Offline Database Schema

- **File:** `src/lib/offline-db.ts`
- Three stores: `workoutQueue` (exercise logs pending sync), `exercises` (cached exercise library), `sessionState` (active session for timer continuity)
- Full CRUD operations for each store with typed interfaces
- `OfflineWorkoutEntry` tracks: localId, sessionInstanceId, exerciseId, sets, syncStatus (pending/synced/failed), error messages

### S7-F16-02: Offline Workout Logging

- **File:** `src/lib/offline-sync.ts` — sync engine: groups pending entries by session, batch-submits to sync API, marks synced/failed
- **File:** `src/hooks/useOfflineWorkout.ts` — React hook with auto-sync on reconnect, pending count, sync status
- **File:** `src/hooks/useOfflineWorkout.ts` — `useExerciseCache()` hook for offline exercise search (server-first, fallback to IndexedDB)
- **File:** `src/components/layout/OfflineIndicator.tsx` — amber offline badge + WiFi connection status icon

### S7-F16-03: Offline Sync API Endpoint

- **File:** `src/app/api/trainer/workouts/sync/route.ts` — POST, trainer-only
- Accepts batch of offline workout entries grouped by sessionInstanceId
- Processes each entry individually for resilience (partial sync possible)
- Returns `{ synced, failed, syncedIds, conflicts }`
- Updated `syncWorkoutsSchema` validator: `sessionInstanceId` at top level, `localId` + `createdAt` per entry

### S7-F16-04 + S7-F16-05: Serwist Service Worker & PWA

- **File:** `src/app/sw.ts` — Serwist service worker with precaching, runtime caching, offline document fallback
- **File:** `next.config.ts` — `withSerwistInit` wrapping, disabled in development
- **File:** `src/app/~offline/page.tsx` — Offline fallback page with retry button
- **File:** `public/manifest.json` — Updated with scope, categories
- **File:** `tsconfig.json` — Added `webworker` lib and `@serwist/next/typings`

### S7-F16-06: Offline Tests

- **File:** `tests/unit/offline-db.test.ts` — 11 tests: workout queue (add, sync, fail, filter by session, clear synced), exercise cache (store, search by name, search by muscle), session state (save, upsert, clear)
- **File:** `tests/unit/offline-sync.test.ts` — 5 tests: empty queue, successful sync, API failure, network error, grouping by sessionInstanceId

**Test count:** 233 tests passing (23 files) | TypeScript: clean

---

## Phase 15 — Audit Log (Completed 2026-03-20)

### S7-F15-01: Audit Log Query Service

- **File:** `src/services/auditlog.service.ts`
- `listAuditLogs()` — paginated search with filters (action, actorId, subjectType, subjectId, dateFrom, dateTo)
- `getDistinctActions()` — returns unique action types for filter dropdowns
- `getDistinctSubjectTypes()` — returns unique subject types for filter dropdowns
- Branch-scoped, date range uses end-of-day for `dateTo`

### S7-F15-02: Audit Log API Routes

- **File:** `src/app/api/admin/audit-logs/route.ts` — GET with query params, admin-only
- **File:** `src/app/api/admin/audit-logs/filters/route.ts` — GET distinct actions & subject types for filter UI

### S7-F15-03: Admin Audit Log UI Page

- **File:** `src/app/(dashboard)/admin/audit-log/page.tsx`
- Searchable table with filters: Action (dropdown), Subject Type (dropdown), Date From/To
- Paginated results with prev/next navigation
- Detail dialog showing old/new values and metadata as formatted JSON
- Color-coded action badges (green=CREATED, blue=UPDATED, red=DELETED, amber=STATUS_CHANGE)

### S7-F15-04: Audit Log Tests

- **File:** `tests/unit/auditlog-service.test.ts` — 7 tests
- Paginated query, filter by action, filter by date range, filter by subjectType+actorId
- Pagination calculation for page 2, distinct actions, distinct subject types

**Test count:** 217 tests passing (21 files) | TypeScript: clean

---

### Phase 14 — Reporting & Analytics (All 7 tasks)

- **Completed:** 2026-03-20
- **Agent:** Multi-agent (backend, ui, qa)

#### S7-F14-01: Analytics service

- `src/services/analytics.service.ts`
- `getTrainerUtilization` — completed/total sessions per trainer → utilization %
- `getClientAttendance` — attended/no-show/cancelled per client → attendance %
- `getSessionConsumption` — usage vs plan per client → consumption %
- `getNoShowRate` — no-shows per trainer → no-show %
- `getRevenueOverview` — total revenue, paid/pending counts, revenue by payment method
- `getTrainerAnalytics` — personal analytics for trainer (clients, completion rate, attendance rate, utilization)

#### S7-F14-02: Analytics API routes

- `GET /api/admin/analytics?report=<type>&month=YYYY-MM` — unified route with report type switch
- Supports: trainer-utilization, client-attendance, session-consumption, no-show-rate, revenue
- `GET /api/trainer/analytics` — trainer personal analytics (own data only)
- All admin routes require SUPER_ADMIN/BRANCH_ADMIN, trainer route requires TRAINER

#### S7-F14-03: Excel export

- `GET /api/admin/analytics/export?report=<type>&month=YYYY-MM` — returns .xlsx download
- Uses SheetJS (xlsx) to generate workbooks with typed columns per report
- Each report maps to a named sheet with appropriate column headers

#### S7-F14-04 & S7-F14-06: Admin analytics dashboard + export buttons

- `src/app/(dashboard)/admin/analytics/page.tsx`
- Summary cards: total revenue, avg utilization, avg attendance, total no-shows
- Tabbed reports: Utilization (bar chart), Attendance (table), Consumption (table), No-Shows (bar chart), Revenue (pie chart + summary)
- Month picker for date range selection
- Export button on each tab → opens xlsx download in new tab

#### S7-F14-05: Trainer analytics page

- `src/app/(dashboard)/trainer/analytics/page.tsx`
- Cards: active clients, completion rate, attendance rate, no-shows
- Utilization progress bar with percentage

#### S7-F14-07: Analytics tests

- `tests/unit/analytics-service.test.ts` — 8 tests
- Trainer utilization (60% calc, 0 sessions), client attendance (50%), session consumption (40%), no-show rate (50%), revenue (aggregation + zeros), trainer personal analytics

#### Test Results

- 210 tests passing (20 test files)
- TypeScript type-check clean

---

### Phase 13 — Settings & Configuration (All 4 tasks)

- **Completed:** 2026-03-20
- **Agent:** Multi-agent (backend, ui, qa)

#### S7-F13-01: Settings service

- `src/services/settings.service.ts`
- `getSettings(branchId)` — returns existing settings or creates defaults if none exist
- `updateSettings(branchId, input, actorId)` — updates only provided fields, skips if empty, audit logs old→new values
- Auto-creates BranchSettings record on first access (no migration needed)

#### S7-F13-02: Settings API routes

- `GET /api/admin/settings` — returns branch settings
- `PUT /api/admin/settings` — updates settings, validates with `updateSettingsSchema`
- Both admin-only (SUPER_ADMIN, BRANCH_ADMIN)

#### S7-F13-03: Admin settings UI

- `src/app/(dashboard)/admin/settings/page.tsx`
- Cards for: Session Settings (duration, no-show threshold), Carry-Forward (limit), Cancellation Policy (toggle + window), Notifications (reminder timing), Kickboxing (class size limit)
- Switch component for cancellation toggle, conditional window field
- Save button with success feedback
- Added shadcn Switch component

#### S7-F13-04: Settings tests

- `tests/unit/settings-service.test.ts` — 6 tests
- getSettings: returns existing, creates defaults
- updateSettings: single field with audit, multiple fields, empty input skips, auto-create on first update

#### Test Results

- 202 tests passing (19 test files)
- TypeScript type-check clean

---

### Phase 12 — Carry-Forward & Month-End Processing (All 4 tasks)

- **Completed:** 2026-03-20
- **Agent:** Multi-agent (backend, devops, qa)

#### S7-F12-01: Month-end processing service

- `src/services/carryforward.service.ts`
- `getConsumptionSummary(branchId, month)` — returns per-client usage breakdown: completed, no-show, cancelled, scheduled, used, unused, carry-forward received, eligible carry-forward
- `processMonthEnd(branchId, month, actorId)` — calculates unused sessions per client, applies carry-forward limit from BranchSettings, creates carry-forward SessionInstance records for next month, marks remainder as expired
- Carry-forward sessions created with `isCarryForward: true`, `carryForwardFromMonth` set, `scheduledTime: '00:00'` (admin reschedules), `status: SCHEDULED`
- Prevents double-processing via existing carry-forward count check (throws ALREADY_PROCESSED)
- Processes all active PtPackages per branch
- Audit logs the full month-end result

#### S7-F12-02: Carry-forward API routes

- `GET /api/admin/carry-forward?month=YYYY-MM` — returns consumption summary per client
- `POST /api/admin/carry-forward` (body: `{ month: "YYYY-MM" }`) — triggers month-end processing manually
- Both admin-only (SUPER_ADMIN, BRANCH_ADMIN)

#### S7-F12-03: Vercel Cron Job

- `GET /api/cron/month-end` — automated endpoint for Vercel Cron
- Secured via `CRON_SECRET` env var (Bearer token)
- Only runs on the last day of the month (checks if tomorrow is a different month)
- Processes ALL active branches in sequence
- Each branch processes independently (errors don't block others)

#### S7-F12-04: Carry-forward tests

- `tests/unit/carryforward-service.test.ts` — 9 tests
- getConsumptionSummary: basic calculation, cap at limit, default limit fallback
- processMonthEnd: creates carry-forward sessions, handles 0 unused, rejects double processing, max limit boundary, multiple clients

#### Test Results

- 196 tests passing (18 test files)
- TypeScript type-check clean

---

### Phase 11 — Kickboxing Module (All 4 tasks)

- **Completed:** 2026-03-20
- **Agent:** Multi-agent (backend, ui, qa)

#### S7-F11-01: Kickboxing service

- `src/services/kickboxing.service.ts` — full CRUD for classes and enrollments
- Class: create, list, update (including activate/deactivate)
- Enrollment: create (GYM_MEMBER or EXTERNAL_ONLY), list with filters, soft-delete
- Capacity check: rejects enrollment when class is full
- Duplicate check: prevents same gym member enrolling in same class twice
- Validates EXTERNAL_ONLY requires externalName, GYM_MEMBER requires clientProfileId
- All mutations write audit logs

#### S7-F11-02: Kickboxing API routes

- `POST/GET /api/admin/kickboxing/classes` — create & list classes
- `PUT /api/admin/kickboxing/classes/[id]` — update class
- `POST/GET /api/admin/kickboxing/enrollments` — create & list enrollments (with classId/clientType filters)
- `DELETE /api/admin/kickboxing/enrollments/[id]` — remove enrollment
- All routes admin-only (SUPER_ADMIN, BRANCH_ADMIN)

#### S7-F11-03: Admin kickboxing UI

- `src/app/(dashboard)/admin/kickboxing/page.tsx` — tabbed layout (Classes / Enrollments)
- Classes tab: card grid with day/time, trainer name, enrollment count/capacity, active toggle
- Enrollments tab: table with name, type badge (Member/External), class info, contact, remove button
- Filters: class selector, client type selector
- Dialogs: create/edit class (trainer, day, time, duration, capacity), enroll (class, type, client/external name)

#### S7-F11-04: Kickboxing tests

- `tests/unit/kickboxing-service.test.ts` — 12 tests
- Class: create (with audit), trainer not found, list scoped to branch, update, update not found
- Enrollment: external client, gym member, capacity full, duplicate member, filter by classId+clientType, soft-delete, delete not found

#### Test Results

- 187 tests passing (17 test files)
- TypeScript type-check clean

---

### Phase 10 — Payment Status Toggle (Simplified)

- **Completed:** 2026-03-20
- **Agent:** Multi-agent (backend, ui, qa)
- **Scope:** Simplified from full payments module — admin toggles client payment status (PAID/PENDING) only. No payment records, no cancellation service.

#### Changes

- **Schema:** Added `paymentStatus PaymentStatus @default(PENDING)` to `ClientProfile` model
- **Service:** Added `updatePaymentStatus()` to `src/services/user.service.ts` — finds client by profile ID + branchId, updates status, writes audit log
- **API:** `PUT /api/admin/users/[id]/payment-status` — admin-only route, validates `{ paymentStatus: 'PAID' | 'PENDING' }`
- **Admin UI:** Added Payment column to `src/app/(dashboard)/admin/clients/page.tsx` with clickable toggle badge (green PAID / red PENDING)
- **Trainer UI:** Added read-only "Pending" badge to `src/app/(dashboard)/trainer/clients/page.tsx` for clients with pending payment
- **Tests:** `tests/unit/payment-status.test.ts` — 4 tests (toggle PENDING→PAID, PAID→PENDING, NOT_FOUND, branch scoping)

#### Test Results

- 175 tests passing (16 test files)
- TypeScript type-check clean

---

### Phase 9 — Notifications (All 8 tasks)

- **Completed:** 2026-03-20
- **Agent:** Multi-agent (backend, ui, qa)

#### S7-F9-01: Notification service

- `src/lib/notifications.ts` — sendNotification, getNotifications, getUnreadCount, markAsRead, markAllAsRead
- Send logic with fallback: WHATSAPP → attempt then fallback to IN_APP; BOTH → WhatsApp + IN_APP; IN_APP → direct
- Every send attempt logged to NotificationLog with status (SENT/FAILED) and failReason
- Pagination support for notification listing, unread count query

#### S7-F9-02: WhatsApp Business API provider (stubbed)

- `whatsAppProvider` in notifications.ts — checks WHATSAPP_API_KEY env var, returns failure if not configured
- Ready for real integration: replace send() body with actual API call

#### S7-F9-03: FCM provider (stubbed)

- `fcmProvider` in notifications.ts — checks FCM_SERVER_KEY env var, returns failure if not configured
- Ready for Firebase Admin SDK integration

#### S7-F9-04: Wire notification triggers

- `src/services/notification.service.ts` — notifySessionStarted, notifyNoShow, notifyLeaveApproved, notifyLeaveRejected, notifyReassignment, notifyUser
- All trigger functions are fire-and-forget (errors logged, never thrown)
- Wired into: session.service.ts (startSession, markNoShow), leave.service.ts (reviewLeave), reassignment.service.ts (reassignSession)
- Added `id: true` to user selects in includes for recipient ID resolution

#### S7-F9-05: Notification API routes

- `src/app/api/notifications/route.ts` — GET (paginated list with unreadOnly filter + unreadCount)
- `src/app/api/notifications/[id]/read/route.ts` — PUT (mark single as read)
- `src/app/api/notifications/read-all/route.ts` — PUT (mark all as read)
- All routes authenticated, branch-scoped

#### S7-F9-06: Notification bell UI

- `src/components/layout/NotificationBell.tsx` — dropdown with notification list, unread badge, mark read/mark all read
- Replaced placeholder bell button in TopNav with real component
- Relative time display (Just now, Xm ago, Xh ago, Xd ago)

#### S7-F9-07: Real-time notification listener

- Polling-based: 30-second interval fetching in NotificationBell component
- Refreshes on dropdown open for immediate feedback

#### S7-F9-08: Notification tests

- `tests/unit/notification-service.test.ts` — 9 tests covering:
  - sendNotification: IN_APP default, WhatsApp fallback, BOTH channel
  - getNotifications: paginated results, unread filter
  - getUnreadCount: count query
  - markAsRead: not found, success
  - markAllAsRead: batch update

**Notes:**

- Total: 171 tests passing, type-check clean
- Schema updated: added `readAt DateTime?` to NotificationLog model
- Updated session/leave/reassignment service tests with notification mocks and user.id in includes

---

### Phase 8 — Client Progress & Visualization (All 6 tasks)

- **Completed:** 2026-03-19
- **Agent:** Multi-agent (backend, ui, qa)

#### S7-F8-01: Progress service

- `src/services/progress.service.ts` — createProgressEntry, updateProgressEntry, listProgressEntries, getChartData
- Create: validates client exists in branch, creates ProgressEntry, audit logs
- Update: validates entry exists + branch scope, partial update, audit logs with old/new values
- List: returns all entries for a client ordered by recordedAt desc
- Chart data: supports weight, bodyFat, and exercise metrics; exercise metric queries WorkoutLog for max weight per session

#### S7-F8-02: Progress API routes

- `src/app/api/client/progress/route.ts` — GET (own entries, CLIENT role)
- `src/app/api/client/progress/charts/route.ts` — GET (chart data by metric, CLIENT role)
- `src/app/api/trainer/clients/[id]/progress/route.ts` — POST (create) + GET (list), TRAINER/KICKBOXING_TRAINER role
- `src/app/api/trainer/progress/[id]/route.ts` — PUT (update entry), TRAINER/KICKBOXING_TRAINER role

#### S7-F8-03: Recharts + chart components

- `src/components/charts/ProgressLineChart.tsx` — Recharts LineChart wrapper with responsive container, themed styling, empty state
- Accepts DataPoint[] with date/value, configurable color and yAxisLabel

#### S7-F8-04: Client progress page

- `src/app/(dashboard)/client/progress/page.tsx` — full progress view for clients
- Summary cards: Weight, Body Fat, Muscle Mass, Waist with delta from previous entry
- Tabs: Charts (weight + body fat line charts) and History (all entries with measurements grid)
- Nav item "Progress" with TrendingUp icon already in constants.ts

#### S7-F8-05: Trainer client progress view with edit

- `src/app/(dashboard)/trainer/clients/[id]/progress/page.tsx` — trainer progress management
- Charts tab with weight + body fat trends
- History tab with edit button per entry
- Create/Edit dialog with all measurement fields (weight, body fat, muscle mass, chest, waist, hips, biceps L/R, thighs L/R, notes)
- "View Progress" button added to trainer clients page cards

#### S7-F8-06: Progress tests

- `tests/unit/progress-service.test.ts` — 12 tests covering:
  - createProgressEntry: client not found, success + audit
  - updateProgressEntry: not found, wrong branch, success + audit with old/new values
  - listProgressEntries: client not found, returns ordered entries
  - getChartData: client not found, weight data, body fat data, exercise without ID, exercise weight progression

**Notes:**

- Total: 162 tests passing, type-check clean
- Chart data for exercise metric uses WorkoutLog → Sets → max weightKg per session date

---

### Phase 7 — Trainer Reassignment (All 4 tasks)

- **Completed:** 2026-03-19
- **Agent:** Multi-agent (backend, ui, qa)

#### S7-F7-01: Reassignment service

- `src/services/reassignment.service.ts` — getVacantTrainers, reassignSession, bulkReassignSessions, listReassignments
- Vacant trainer lookup excludes: booked trainers (time overlap), trainers on leave (approved/pending), outside working hours/days
- Single reassign: validates session exists (SCHEDULED), not already reassigned, not same trainer; creates TrainerReassignment + updates session trainerProfileId in $transaction
- Bulk reassign: loops single reassign, collects results/errors
- Helper functions: getBusyTrainerIds (time slot overlap detection), getOnLeaveTrainerIds (date range with UTC timezone window)
- Audit logging on session reassignment

#### S7-F7-02: Reassignment API routes

- `src/app/api/admin/reassignments/route.ts` — POST (create single) + GET (list with date/trainer filters)
- `src/app/api/admin/reassignments/bulk/route.ts` — POST (bulk reassign multiple sessions)
- `src/app/api/admin/trainers/vacant/route.ts` — GET (vacant trainers by date/time slot)
- SUPER_ADMIN/BRANCH_ADMIN only

#### S7-F7-03: Admin reassignment page

- `src/app/(dashboard)/admin/reassignments/page.tsx` — full reassignment management interface
- Vacant trainer lookup: date + time slot inputs, shows available trainers
- Single reassignment dialog: select session → select replacement trainer → optional reason
- Bulk reassignment dialog: multi-session select → single replacement trainer
- Reassignment history list with original/replacement trainer details
- Added nav item "Reassignment" with ArrowLeftRight icon in constants.ts

#### S7-F7-04: Reassignment tests

- `tests/unit/reassignment-service.test.ts` — 8 tests covering:
  - getVacantTrainers: excludes booked, excludes on-leave, excludes outside working hours, excludes non-working days
  - reassignSession: not found, already reassigned, same trainer, success + transaction + audit
  - listReassignments: returns history

**Notes:**

- Total: 150 tests passing, type-check clean
- Time overlap detection uses HH:MM string comparison for slot conflicts
- UTC timezone window ±1 day for leave date matching (IST offset handling)

---

### Phase 6 — Leave Management (All 8 tasks)

- **Completed:** 2026-03-19
- **Agent:** Multi-agent (backend, ui, qa)

#### S7-F6-01: Leave service

- `src/services/leave.service.ts` — applyLeave, reviewLeave, getLeaveById, listLeaves, getTrainerLeaves
- Apply: validates dates, checks overlapping approved/pending leaves, identifies affected sessions + clients
- Review: approve or reject with notes, validates leave is PENDING
- Affected sessions: expanded date window ±1 day to handle IST-stored-as-UTC timezone offset
- Branch scoping + audit logging on apply, approve, reject

#### S7-F6-02: Leave API routes

- `src/app/api/trainer/leaves/route.ts` — POST (apply) + GET (own leaves)
- `src/app/api/admin/leaves/route.ts` — GET (list with status/trainer filters + pagination)
- `src/app/api/admin/leaves/[id]/route.ts` — GET (detail with affected sessions/clients)
- `src/app/api/admin/leaves/[id]/approve/route.ts` — PUT (approve with notes)
- `src/app/api/admin/leaves/[id]/reject/route.ts` — PUT (reject with notes)
- TRAINER/KICKBOXING_TRAINER for trainer routes, SUPER_ADMIN/BRANCH_ADMIN for admin routes

#### S7-F6-03: Client unavailability service

- `src/services/clientUnavailability.service.ts` — markUnavailable (skipDuplicates), listByMonth, removeUnavailability
- Audit logging on mark and remove

#### S7-F6-04: Client unavailability API routes

- `src/app/api/client/unavailability/route.ts` — POST (mark dates) + GET (list by month)
- `src/app/api/client/unavailability/[id]/route.ts` — DELETE (remove)
- CLIENT role only

#### S7-F6-05: Trainer leave application page

- `src/app/(dashboard)/trainer/leaves/page.tsx` — leave application and history
- Apply leave dialog: date pickers, reason, submit
- Success view: shows affected sessions and clients
- Inline error messages (replaced alert() with styled error banner)
- Leave history list with status badges

#### S7-F6-06: Admin leave management page

- `src/app/(dashboard)/admin/leaves/page.tsx` — leave request management
- Status filter (All/Pending/Approved/Rejected)
- Detail dialog: leave dates, reason, affected sessions list, affected clients
- Approve/reject buttons with notes textarea

#### S7-F6-07: Client unavailability page

- `src/app/(dashboard)/client/unavailability/page.tsx` — date unavailability management
- Multi-date input, month filter, remove dates
- Calendar-style date selection

#### S7-F6-08: Leave tests

- `tests/unit/leave-service.test.ts` — 11 tests covering:
  - applyLeave: success + audit, overlapping dates rejection, affected sessions/clients identification
  - reviewLeave: not found, already reviewed, approve + audit, reject + audit
  - getLeaveById: not found, success with affected sessions
  - listLeaves: paginated results, status filter
  - getTrainerLeaves: returns own leaves
- `tests/unit/client-unavailability-service.test.ts` — 5 tests covering:
  - markUnavailable: success + audit, skipDuplicates
  - listByMonth: date range filter
  - removeUnavailability: not found, success + audit

**Notes:**

- Total: 142 tests passing (before Phase 7 additions), type-check clean
- Fixed grammar error: "Cannot rejected" → ternary for action word
- Fixed DialogTrigger: `asChild` → `render={<Button />}` (base-ui compatibility)
- Fixed badge possibly undefined with fallback `?? { variant: 'secondary' as const, label: leave.status }`
- Timezone fix: getAffectedSessions expands query window ±1 day for IST dates stored as UTC

---

### Phase 5 — Workout Logging & Exercise Library (All 8 tasks)

- **Completed:** 2026-03-19
- **Agent:** Multi-agent (backend, ui, qa)

#### S7-F5-01: Exercise library service

- `src/services/exercise.service.ts` — createExercise, updateExercise, getExerciseById, listExercises, deleteExercise (soft-delete), bulkImportExercises
- Global exercise library (not branch-scoped, per schema design)
- Search by name/muscle group/equipment, filter by category/muscle group
- Paginated list with total count
- Audit logging on create, update, delete, bulk import

#### S7-F5-02: Exercise API routes

- `src/app/api/admin/exercises/route.ts` — GET (list + search) + POST (create)
- `src/app/api/admin/exercises/[id]/route.ts` — GET, PUT, DELETE
- `src/app/api/admin/exercises/bulk-import/route.ts` — POST (bulk import JSON array)
- `src/app/api/exercises/route.ts` — GET (public search, all authenticated users — used by trainers during workout logging)
- SUPER_ADMIN/BRANCH_ADMIN only for admin routes

#### S7-F5-03: Workout logging service

- `src/services/workout.service.ts` — createWorkoutLogs, updateWorkoutLog, deleteWorkoutLog, getSessionWorkouts, getClientWorkouts
- Validates session exists and is IN_PROGRESS or COMPLETED
- Validates all exercises exist and are active
- Creates workout logs with sets in a Prisma transaction
- Update replaces sets (delete + recreate)
- Client workout history with date range, exercise, and muscle group filters
- Branch scoping + trainer ownership checks on mutations
- Audit logging on create, update, delete

#### S7-F5-04: Workout API routes for trainer + client

- `src/app/api/trainer/workouts/route.ts` — POST (create workout logs for session)
- `src/app/api/trainer/workouts/[id]/route.ts` — PUT (update sets), DELETE
- `src/app/api/client/workouts/route.ts` — GET (workout history with filters)
- TRAINER/KICKBOXING_TRAINER only for trainer routes, CLIENT only for client route

#### S7-F5-05: Admin exercise library page

- `src/app/(dashboard)/admin/exercises/page.tsx` — full CRUD interface
- Searchable table with category/muscle group filters
- Create/Edit dialog with all exercise fields
- Bulk import via JSON paste dialog
- Pagination, delete with confirmation
- Category-based badge colors

#### S7-F5-06: Workout logging UI within active session

- `src/components/workout/WorkoutLogger.tsx` — reusable workout logging component
- Exercise search from library (debounced, 300ms)
- Add/remove exercises, add/remove sets per exercise
- Set data: reps, weight (kg), RPE
- Save workout button with saved/unsaved state tracking
- Loads existing workout logs when resuming a session
- Integrated into trainer dashboard active session card

#### S7-F5-07: Client workout history page

- `src/app/(dashboard)/client/workouts/page.tsx` — date-wise workout history
- Grouped by session date with trainer name
- Per-exercise: sets table (set number, reps, weight, RPE)
- Filters: muscle group, date range

#### S7-F5-08: Workout logging tests

- `tests/unit/exercise-service.test.ts` — 9 tests covering:
  - createExercise: success + audit
  - updateExercise: not found, success + audit
  - getExerciseById: not found, success
  - listExercises: paginated results, search filter
  - deleteExercise: not found, soft-delete + audit
- `tests/unit/workout-service.test.ts` — 10 tests covering:
  - createWorkoutLogs: session not found, invalid status, exercises not found, success + transaction + audit
  - updateWorkoutLog: not found, wrong branch, wrong trainer, success + set replacement + audit
  - getSessionWorkouts: session not found, success

**Notes:**

- Total: 126 tests passing, build clean
- Exercise library is global (not branch-scoped) per schema design
- WorkoutLogger supports both fresh logging and resuming with existing logs
- Select onValueChange null coalescing pattern (base-ui compatibility)

---

### Phase 4 — Attendance & Session Management (All 8 tasks)

- **Completed:** 2026-03-19
- **Agent:** Multi-agent (backend, ui, qa)

#### S7-F4-01: Session management service

- `src/services/session.service.ts` — startSession, endSession, markNoShow, getSessionById, getTrainerSessions, getClientSessions, getSessionCounts, getActiveSession
- Concurrent session prevention (only one IN_PROGRESS per trainer)
- Actual duration calculation on end (millisecond precision → rounded to minutes)
- Audit logging on start, end, and no-show
- Branch scoping on all queries

#### S7-F4-02: Trainer session API routes

- `src/app/api/trainer/sessions/[id]/route.ts` — GET session with details
- `src/app/api/trainer/sessions/[id]/start/route.ts` — POST start session
- `src/app/api/trainer/sessions/[id]/end/route.ts` — POST end session (with optional notes)
- `src/app/api/trainer/sessions/[id]/no-show/route.ts` — POST mark no-show
- `src/app/api/trainer/clients/route.ts` — GET assigned clients with stats
- All routes scoped to trainer's own trainerProfileId

#### S7-F4-03: Admin session view API

- Already existed from Phase 3 (`src/app/api/admin/sessions/route.ts`)
- Supports date/trainer/client/status filters + pagination

#### S7-F4-04: SessionTimer component

- `src/components/timer/SessionTimer.tsx` — circular progress ring timer with:
  - Real-time elapsed time display (updates every second)
  - Expected duration comparison with progress ring
  - Overtime detection with destructive color + pulsing message
  - Three sizes: sm, md, lg
- `InlineTimer` — compact inline variant without ring

#### S7-F4-05: Trainer dashboard (active session page)

- `src/app/(dashboard)/trainer/page.tsx` — rewritten from placeholder
- Active session card with live SessionTimer (lg)
- Today's sessions list with Start/No-Show/End buttons
- Status badges, confirmation dialogs for destructive actions
- Prevents starting a new session while one is active

#### S7-F4-06: Trainer client list page

- `src/app/(dashboard)/trainer/clients/page.tsx` — new page
- Cards grid showing assigned clients from active PT packages
- Per-client stats: used/remaining/per-month session counts
- Next session date, no-show warning badges

#### S7-F4-07: Client dashboard page

- `src/app/(dashboard)/client/page.tsx` — rewritten from placeholder
- `src/app/api/client/dashboard/route.ts` — dashboard data API
- `src/app/api/client/sessions/route.ts` — client sessions API
- Live SessionTimer when session is IN_PROGRESS
- Session count cards (used, remaining, total, carry-forward)
- Next session + trainer info cards
- No-show warning

#### S7-F4-08: Session management tests

- `tests/unit/session-service.test.ts` — 11 tests covering:
  - startSession: not found, invalid status, concurrent session prevention, success + audit
  - endSession: not found, invalid status, success + duration calc + audit
  - markNoShow: not found, invalid status, success + audit
  - getSessionCounts: correct aggregation by status

**Notes:**

- Total: 107 tests passing, build clean
- Timer uses `setInterval` with Date.now() for accuracy across tab switches
- Client dashboard API returns sessionCount, nextSession, activeSession, trainer info

---

### Theming — Sector 7 Dark Brand Theme + Modern Font

- **Completed:** 2026-03-19
- **Agent:** @ui
- **Files Changed:**
  - `src/app/globals.css` (modified) — All CSS custom properties updated: dark background, orange primary (#E8651A → oklch(0.637 0.179 38.5)), chart colors themed
  - `src/app/layout.tsx` (modified) — Added `dark` class to `<html>`, switched from Geist to Inter + JetBrains Mono, updated themeColor
  - `src/app/(auth)/login/page.tsx` (modified) — Added Sector 7 logo image, dark background
  - `src/components/layout/Sidebar.tsx` (modified) — Added logo in header, orange active nav highlight
  - `src/components/layout/TopNav.tsx` (modified) — Added logo on mobile, subtle borders
  - `public/sector7-logo.png` (created) — Sector 7 logo
  - `public/manifest.json` (modified) — theme_color=#E8651A, background_color=#1a1a1a
- **Memory Updated:** architecture.md (font stack, versions), decisions.md (ADR-009 dark theme, ADR-010 fonts)
- **Notes:** Always-dark mode, no light/dark toggle. Build passes clean.

---

### Phase 3 — Session Scheduling (All 8 tasks)

- **Completed:** 2026-03-19
- **Agent:** Multi-agent (backend, ui, qa)

#### S7-F3-01: Schedule service

- `src/services/schedule.service.ts` — createSchedule, getSchedules, getScheduleById, updateSchedule, deleteSchedule
- Branch scoping, client/trainer validation, audit logging on all mutations, soft deactivation

#### S7-F3-02: Session generation service

- `src/services/session-generation.service.ts` — generateSessions, detectConflicts
- Generates monthly instances from active recurring schedules
- Skips dates before validFrom / after validUntil
- Deduplicates against existing instances (schedule+date key)
- Detects time-slot overlaps per trainer per date with overlapMinutes calculation

#### S7-F3-03: Scheduling API routes

- `src/app/api/admin/schedules/route.ts` — GET (list) + POST (create)
- `src/app/api/admin/schedules/[id]/route.ts` — GET, PUT, DELETE
- `src/app/api/admin/schedules/generate/route.ts` — POST (generate monthly instances)
- `src/app/api/admin/sessions/route.ts` — GET (list session instances with filters + pagination)

#### S7-F3-04: Conflict detection API

- `src/app/api/admin/conflicts/route.ts` — GET with date + optional trainerId filter

#### S7-F3-05: FullCalendar wrapper

- Installed @fullcalendar/core, react, daygrid, timegrid, interaction
- `src/components/calendar/SessionCalendar.tsx` — wrapper with status-based color coding, month/week/day views

#### S7-F3-06: Admin scheduling page

- `src/app/(dashboard)/admin/scheduling/page.tsx`
- Create recurring schedule form (trainer, client, day, time, duration, valid from)
- Generate monthly sessions with month picker
- Conflict warnings card with details
- FullCalendar view with clickable session events
- Session detail panel on event click
- Recurring schedules list with deactivate

#### S7-F3-07: Trainer schedule page

- `src/app/(dashboard)/trainer/schedule/page.tsx` — read-only weekly calendar view
- `src/app/api/trainer/schedule/route.ts` — GET own sessions (trainer profile scoped)

#### S7-F3-08: Scheduling tests

- `tests/unit/schedule-service.test.ts` — 9 tests (CRUD: not found, create+audit, filters, update+audit, delete+audit)
- `tests/unit/session-generation.test.ts` — 7 tests (generation: correct count, skip before validFrom, skip existing, conflict detection, no-op when empty, detect overlaps, no false positives)

**Notes:**

- Total: 96 tests passing, build clean
- Admin sessions API supports date/trainer/client/status filters + pagination
- Trainer API scoped to own trainerProfileId from session

---

### Phase 2 — Trainer-Client Mapping & PT Packages (All 4 tasks)

- **Completed:** 2026-03-19
- **Agent:** Multi-agent (backend, ui, qa)

#### S7-F2-01: PT package service

- `src/services/pt-package.service.ts` — createPtPackage, getPtPackages, getPtPackageById, updatePtPackage, deletePtPackage
- Branch scoping on all queries, audit logging on all mutations
- Validates client/trainer profiles exist in same branch before creating
- Duplicate active mapping detection (same trainer-client pair)
- Soft delete (isActive=false + endDate set)

#### S7-F2-02: PT package API routes

- `src/app/api/admin/mappings/route.ts` — GET (list with trainerId/clientId filters) + POST (create)
- `src/app/api/admin/mappings/[id]/route.ts` — GET, PUT, DELETE
- SUPER_ADMIN/BRANCH_ADMIN only, branchId from session
- Zod validation via createMappingSchema/updateMappingSchema

#### S7-F2-03: Trainer-client mapping UI

- Added "Trainer Mappings" card section to `src/app/(dashboard)/admin/clients/[id]/page.tsx`
- Assign trainer form: trainer dropdown, sessions/month, session charge, start date
- Active mappings list with deactivate button
- Past (inactive) mappings shown separately with dashed border
- Fetches trainers from /api/admin/users?role=TRAINER

#### S7-F2-04: PT package tests

- `tests/unit/pt-package-service.test.ts` — 13 tests covering:
  - createPtPackage: client not found, trainer not found, duplicate mapping, success + audit
  - getPtPackages: branch filter, trainer+client filter
  - getPtPackageById: not found, success
  - updatePtPackage: not found, update + audit, endDate on deactivate
  - deletePtPackage: not found, deactivate + audit
- `tests/integration/mappings-api.test.ts` — 16 tests covering:
  - GET /api/admin/mappings: 403 unauthenticated, 403 non-admin, success, filter passthrough
  - POST /api/admin/mappings: 403 trainer, 400 validation, 201 success, 409 duplicate
  - GET /api/admin/mappings/[id]: 403 non-admin, success, 404 not found
  - PUT /api/admin/mappings/[id]: 403 non-admin, success
  - DELETE /api/admin/mappings/[id]: 403 non-admin, success, 404 not found

**Notes:**

- Fixed AppError constructor arg order (code, message) — was reversed in initial implementation
- Fixed dateSchema from z.string().datetime() to accept both YYYY-MM-DD and ISO 8601 formats
- All 80 tests pass (51 Phase 0-1 + 29 Phase 2), build clean

---

### Phase 1 — Auth & User Management (All 11 tasks)

- **Completed:** 2026-03-19
- **Agent:** Multi-agent (backend, architect, ui, qa)

#### S7-F1-01: NextAuth.js with credentials provider

- `src/lib/auth.ts` — NextAuth v4 config with CredentialsProvider, JWT session strategy (24hr maxAge)
- `authorize()`: finds user by email, checks isActive/deletedAt, validates bcryptjs password, updates lastLoginAt
- JWT callback adds: id, role, branchId, firstName, lastName, trainerProfileId, clientProfileId
- `getServerSession()` wrapper + `hasRole()` helper
- `src/types/next-auth.d.ts` — module augmentation for User, Session, JWT

#### S7-F1-02: Next.js middleware

- `src/middleware.ts` — public paths (/login, /api/auth), role-to-path mapping, root redirect
- Injects x-branch-id, x-user-id, x-user-role headers for API routes
- Unauthenticated users redirected to /login with callbackUrl

#### S7-F1-03: Login page

- `src/app/(auth)/login/page.tsx` — email/password form with signIn('credentials')
- Role-based redirect after login via /api/auth/me
- `src/app/api/auth/[...nextauth]/route.ts` + `src/app/api/auth/me/route.ts`

#### S7-F1-04: Auth integration tests

- `tests/unit/auth.test.ts` — 15 tests covering:
  - hasRole utility (true/false/empty cases)
  - authorize: missing credentials, empty fields, user not found, inactive user, soft-deleted user, wrong password, successful auth, lastLoginAt update
  - JWT callback: adds user fields, preserves token on subsequent calls
  - Session callback: adds token fields to session.user

#### S7-F1-05: User CRUD service

- `src/services/user.service.ts` — createUser, getUsers, getUserById, updateUser, deleteUser
- Branch scoping on all queries, audit logging on all mutations
- Creates role-specific profiles (TrainerProfile for TRAINER/KICKBOXING_TRAINER, ClientProfile for CLIENT)
- Soft delete (deletedAt + isActive=false)
- Paginated list with role filter

#### S7-F1-06: User CRUD API routes

- `src/app/api/admin/users/route.ts` — GET (list) + POST (create), SUPER_ADMIN/BRANCH_ADMIN only
- `src/app/api/admin/users/[id]/route.ts` — GET, PUT, DELETE, SUPER_ADMIN/BRANCH_ADMIN only
- Zod validation on input, branchId from session, actorId from session
- Next.js 16 async params pattern (`Promise<{ id: string }>`)

#### S7-F1-07: Admin client list page

- `src/app/(dashboard)/admin/clients/page.tsx` — searchable table, status filter, pagination
- Client name, email, phone, fitness goals, active/inactive badge

#### S7-F1-08: Admin client profile page

- `src/app/(dashboard)/admin/clients/[id]/page.tsx` — personal info + health metrics cards
- Fields: name, phone, emergency contact, height, weight, body fat, medical conditions, fitness goals, session duration override

#### S7-F1-09: Admin trainer list page

- `src/app/(dashboard)/admin/trainers/page.tsx` — searchable table with specialties badges, working hours

#### S7-F1-10: Admin trainer profile page

- `src/app/(dashboard)/admin/trainers/[id]/page.tsx` — personal info + professional details
- Working days toggle buttons, specialties/certifications as comma-separated

#### S7-F1-11: User CRUD tests

- `tests/unit/user-service.test.ts` — 16 tests covering:
  - createUser: duplicate email, client creation with profile, trainer creation with profile, audit logging
  - getUsers: branch scoping, role filtering, pagination math
  - getUserById: found, not found, branch isolation
  - updateUser: not found, base fields, trainer profile, client profile, audit logging
  - deleteUser: not found, soft delete, audit logging
- `tests/integration/user-api.test.ts` — 20 tests covering:
  - GET /api/admin/users: 403 unauthenticated/CLIENT/TRAINER, success for admin, role filter, SUPER_ADMIN access
  - POST /api/admin/users: 403, validation error, success 201, duplicate email 409
  - GET /api/admin/users/[id]: 403, success, 404 not found
  - PUT /api/admin/users/[id]: 403 non-admin, success
  - DELETE /api/admin/users/[id]: 403 non-admin, success, 404 not found

**Notes:**

- Used NextAuth v4.24.13 (v5 not stable yet)
- Tests excluded from main tsconfig (run through Vitest's own TS transform)
- base-ui Select onValueChange passes `string | null` — wrapped with null coalescing
- All 51 tests pass, TypeScript type-check clean

---

### Phase 0 — Foundation (All 13 tasks)

- **Completed:** 2026-03-19
- **Agent:** Multi-agent (devops, architect, backend, ui, qa)

#### S7-F0-01: Initialize Next.js project

- Next.js 16.2.0 with App Router, TypeScript 5.x strict mode, Tailwind CSS 4, ESLint 9 (flat config), Prettier
- Created full `src/` directory structure per CLAUDE.md

#### S7-F0-02: Docker + env + npm scripts

- `docker-compose.yml` with PostgreSQL 16 + Redis 7
- `.env.example` with all variables from architecture.md
- All npm scripts: dev, build, lint, type-check, test, db:push/migrate/generate/seed/studio

#### S7-F0-03: Testing framework

- Vitest + @testing-library/react + @testing-library/jest-dom + Supertest
- `vitest.config.ts` with jsdom environment, @/ path alias, coverage config
- `tests/setup.ts`, `tests/helpers.ts` (mock request/session factories)
- `tests/unit/`, `tests/integration/`, `tests/e2e/` directories

#### S7-F0-04: TypeScript strict + git hooks

- tsconfig with `noUncheckedIndexedAccess`, `noFallthroughCasesInSwitch`, `forceConsistentCasingInFileNames`
- Path alias `@/` → `./src/*` (already from create-next-app)
- Husky + lint-staged pre-commit hooks (eslint --fix + prettier --write on TS/TSX files)

#### S7-F0-05: Prisma schema

- Complete schema with all 20 models, 12 enums, all relations, indexes, and @@map annotations
- Using Prisma 5.x (as specified in architecture.md)
- `prisma generate` runs successfully

#### S7-F0-06: Prisma client singleton

- `src/lib/prisma.ts` — singleton pattern for serverless (global cache in dev, fresh in prod)
- Debug logging in development mode

#### S7-F0-07: Zod validation schemas

- `src/lib/validators.ts` — all Zod schemas matching every API input contract
- Covers: auth, admin CRUD, scheduling, sessions, workouts, leaves, payments, kickboxing, exercises, analytics, settings, audit logs, notifications
- Type exports via `z.infer<>`

#### S7-F0-08: TypeScript types

- `src/types/enums.ts` — re-exports all Prisma enums + local AttendanceStatus
- `src/types/domain.ts` — re-exports Prisma model types + custom composed types (UserWithProfile, SessionInstanceWithRelations, SessionTimer)
- `src/types/api.ts` — API response types (ApiResponse, ApiError, PaginatedResponse, Conflict, SessionStartResponse, ClientDashboard, etc.)

#### S7-F0-09: AppError class

- `src/lib/errors.ts` — AppError class with code, message, statusCode + toErrorResponse utility

#### S7-F0-10: Audit log utility

- `src/lib/audit.ts` — auditLog() function that writes to AuditLog table with Prisma.InputJsonValue typing

#### S7-F0-11: shadcn/ui components

- Initialized shadcn/ui (uses base-ui instead of Radix in latest version)
- 17 components installed: Button, Input, Card, Badge, Dialog, Table, Select, Tabs, Tooltip, Sheet, DropdownMenu, Calendar, Label, Textarea, Separator, Avatar, Skeleton

#### S7-F0-12: Dashboard layout shell

- `src/components/layout/Sidebar.tsx` — role-based navigation with active state highlighting
- `src/components/layout/TopNav.tsx` — user menu, branch selector dropdown (admin only), notification bell with badge, mobile hamburger menu
- `src/app/(dashboard)/layout.tsx` — desktop sidebar + mobile drawer layout, role-based nav switching
- `src/lib/constants.ts` — navigation items for admin (12 items), trainer (5 items), client (5 items)
- Placeholder pages: `/admin`, `/trainer`, `/client`

#### S7-F0-13: Test fixtures factory

- `tests/fixtures/factory.ts` — factories for Branch, BranchSettings, User, Admin, TrainerProfile, Trainer (user+profile), ClientProfile, Client (user+profile), PtPackage, SessionSchedule, SessionInstance, Exercise
- All factories accept partial overrides, use auto-incrementing IDs

**Notes:**

- Used Prisma 5.x (not 7.x which has breaking changes with config files)
- Used Next.js 16.2.0 (latest available via create-next-app)
- shadcn/ui latest uses base-ui instead of Radix — no `asChild` prop, different API
- TypeScript type-check and Next.js build both pass with zero errors

#### Ad-hoc (2026-06-12): Client dashboard workout calendar card

- `GET /api/client/workout-calendar?month=YYYY-MM` — completed PT session days + PR-day flags (contract added to `memory/api-contracts.md`, validated by `workoutCalendarQuerySchema`)
- `getWorkoutCalendar()` in `src/services/workout.service.ts` — PR detection mirrors the community auto-post rule (compound lift day-max strictly beats all-time best; history bounded at month end so past months stay accurate)
- `src/components/calendar/WorkoutCalendarCard.tsx` — Monday-first month grid (green ring = workout day, amber star = PR day, orange ring = today), month navigation capped at current month, day click opens a Dialog with the session summary (time, trainer, muscle chips, per-exercise set summary) + link to full session
- Placed as the 3rd card on `/client` dashboard, before the engagement stats strip; skeleton updated
- Tests: `tests/unit/workout-calendar.test.ts` (7 passing); lint + type-check clean
- Scope cut per operator: no double-session / high-intensity markers

#### Ad-hoc (2026-07-11): PWA pull-to-refresh

- `src/components/layout/PullToRefresh.tsx` — Chrome-style pull-to-refresh gesture for the installed PWA (native gesture is disabled by `overscroll-behavior-y: none` and standalone mode has no refresh UI). Floating spinner badge follows the damped pull; release past 70px triggers a full `window.location.reload()` (universal — pages fetch client-side, so `router.refresh()` wouldn't refresh them; workout logging survives reloads via the durable outbox)
- Wrapped `{children}` inside the dashboard `<main>` scroller in `src/app/(dashboard)/layout.tsx` — covers all admin/trainer/client pages
- Guards: engages only when the scroller is at the top, vertical-dominant swipes only (calendar/chart h-scroll untouched), skips touches inside nested scrollers that are mid-scroll, offline pull shows a toast instead of reloading, single-fire while a refresh is in flight
- Tests: `tests/unit/pull-to-refresh.test.tsx` (8 passing); lint + type-check clean
- Not yet verified on a physical device (touch gesture) — needs an on-device eyeball on iOS standalone PWA

#### Ad-hoc (2026-07-11): Splash screen gating (once per 24h, never on pull-to-refresh)

- `src/lib/splash.ts` — `shouldPlaySplash()` (memoized per page load so SplashScreen + SplashGate always agree): skips if a one-shot `sessionStorage` flag is set (consumed without touching the daily stamp) or if the splash played within the last 24h (`localStorage` timestamp); otherwise plays and stamps. Storage errors fall back to always playing. `skipSplashOnNextLoad()` sets the one-shot flag
- `SplashScreen.tsx` + `SplashGate.tsx` gate their render/inert behavior on `shouldPlaySplash()`
- `PullToRefresh.tsx` default reload now calls `skipSplashOnNextLoad()` first — a refresh is never treated as a cold start
- Tests: `tests/unit/splash-gating.test.ts` (6 passing; in-memory Storage stub per the workout-outbox pattern — jsdom storage is unreliable here); lint + type-check clean

#### Ad-hoc (2026-07-11): Pull-to-refresh → soft refresh (header stays mounted)

- Full `window.location.reload()` tore down the whole app on pull-to-refresh, showing the dashboard boot skeleton including the header row. Now the dashboard layout passes `onRefresh` to `PullToRefresh`: `router.refresh()` (server data) + a `refreshKey` bump that remounts only the page subtree via `<Fragment key>` so client fetches re-run — TopNav/sidebar/tab bar never unmount, no boot skeleton, no splash
- `PullToRefresh` `onRefresh` may now return a promise; the spinner holds until it settles, then retracts and the gesture re-arms (full-reload default unchanged as fallback)
- Tests updated/added in `tests/unit/pull-to-refresh.test.tsx` (10 passing); lint + type-check + prod build clean

#### Ad-hoc (2026-07-11): False-logout hardening (deploy-window session hiccups)

- Context: deploy-time "logouts" were (a) the predicted one-time 24h-token tail from the maxAge 7d fix and (b) a real bug — a transient /api/auth/session fetch failure makes next-auth report unauthenticated with a valid cookie, and the dashboard layout bounced straight to /login, which never sent authed users back
- `src/middleware.ts` — /login now gets its own branch (before PUBLIC_PATHS, which no longer lists it): authenticated tokens with a known role + branchId are redirected to a safe relative callbackUrl or their role dashboard; tokens without branchId/known role fall through to the form (avoids redirect loops). Matcher UNTOUCHED — /api/\* still never reaches middleware (the 8c4cee2 CPU win is preserved; cost is one getToken on /login page loads only)
- `src/app/(dashboard)/layout.tsx` — on "unauthenticated", waits 1s and retries the session once via useSession().update() (which refetches into the provider) before redirecting to /login; retry re-arms after each authenticated period
- Tests: `tests/unit/middleware-login-bounce.test.ts` (7 passing — bounce, callbackUrl preference, open-redirect guard, no-token/no-branchId/unknown-role fall-throughs, protected-page redirect regression); lint + type-check + prod build clean

---

### Ad-hoc: Admin Sessions page — filters, stats & full redesign

- **Agent:** @ui (+ thin @backend additions to the existing sessions route)
- **Completed:** 2026-07-16
- **Files Changed:**
  - `src/app/api/admin/sessions/route.ts` — response now carries `stats: { total, byStatus }` (groupBy over the full filtered range, status filter deliberately excluded) + new `search` param (case-insensitive contains on client/trainer first+last name, applied to stats too)
  - `src/lib/validators.ts` — `listSessionsSchema` + `search` (trim, max 100)
  - `src/lib/sessionStatsLabel.ts` (new) — scope/date describers + shared time/date formatters
  - `src/lib/sessionOverrun.ts` (new) — `overrunMinutes()` for IN_PROGRESS overrun detection
  - `src/app/(dashboard)/admin/sessions/page.tsx` — full redesign: clickable status stat-cards ARE the status filter; one-row toolbar (server-side search, trainer select, cascading client picker restricted to the trainer's mapped clients via `/api/admin/mappings?trainerId=`, date presets, reset); scope line; day-grouped list with initials avatars; filtered-out person column hidden; "+Xm over" pill on overrunning sessions; refetch dims list; rows open a detail drawer
  - `src/app/(dashboard)/admin/sessions/SessionDetailSheet.tsx` (new) — right-side Sheet: contact, timeline, full workout log with volume, notes; SCHEDULED sessions get Reschedule (PATCH) + two-step Cancel (DELETE) — both endpoints already audit + notify
  - `tests/unit/session-stats-label.test.ts` (8) + `tests/unit/session-overrun.test.ts` (6)
- **Memory Updated:** `memory/api-contracts.md` (GET /api/admin/sessions: stats block + search param)
- **Verified:** live against local dev: stats breakdown, stats ignore status filter by design, trainer-scoped stats, mapped-client cascade, name search, detail endpoint. Lint + type-check clean for changed files
- **Notes:** no schema changes; no new dependencies; list/stats read-only, mutations reuse existing audited endpoints

---

## S7-CL-02 — Client Weigh-In Nudge (PWA)

**Agent:** @backend + @ui
**Completed:** 2026-08-26
**ADR:** ADR-049

### Goal

Prompt clients on the dashboard when they haven't logged their weight in a while,
framed as motivation (how far they've come) rather than a compliance nag, and let
them close the loop inline without leaving the page.

### Files added

- `src/lib/weighIn.ts` — `buildWeighInNudge(entries, thresholdDays, now)`. Pure, no
  Prisma. Decides `shouldPrompt` / `reason`, and assembles days-since, first/last
  weigh-in, net change, entry count, tracked span, and a 12-point sparkline series.
- `src/components/progress/WeighInNudge.tsx` — the modal. Progression hero, hand-rolled
  SVG sparkline whose dashed tail renders the current silence as a visible gap,
  supporting stat chips (sessions / streak / top PR), inline weight input, and a
  saved state that immediately recomputes and shows the new total change.
- `tests/unit/weigh-in-nudge.test.ts` — 19 cases: never-logged, threshold boundaries
  (28/29/30/31 days), branch-specific and zero thresholds, body-fat-only entries not
  resetting the clock, future-dated entries, unordered input, rounding, single-entry,
  series ordering and the 12-point cap, unparseable dates, non-finite weights.

### Files modified

- `src/app/api/client/dashboard/route.ts` — added the `weighIn` block. Costs one extra
  `BranchSettings` query; the progress entries it computes from were already loaded by
  the existing per-metric latest/previous logic.
- `src/app/(dashboard)/client/page.tsx` — renders the nudge, queued behind the badge
  celebration so the overlays never stack. Arms once per page load via a ref so
  refetches (session ended, weight logged) can't pop it back open. 7-day localStorage
  snooze on dismiss, cleared on save.
- `memory/api-contracts.md` — documented `weighIn`, and backfilled `packageExpiry` +
  `engagementStats`, which had shipped earlier without a contract entry. Also corrected
  the stale claim that `latestProgress` returns `recordedAt` — it does not.
- `memory/decisions.md` — ADR-049.

### Decisions

- Threshold reuses `BranchSettings.measurementReminderDays` (default 30) — the same
  value already driving the trainer/admin "No measurements" badge.
- Only `weightKg` resets the clock; body-fat-only or measurement-only entries don't.
- Dismissal is client-side only (`sector7.weighInNudge.snoozedUntil`, 7 days).
- No goal-weight ring: there is no numeric target field, and `ClientProfile.currentWeight`
  is admin-entered and never synced from progress entries, so it is NOT a usable
  "current weight". Adding `targetWeightKg` is the follow-up if a ring is wanted.
- The sparkline's "now" is derived from the server's `daysSinceLastWeighIn`, not
  `Date.now()` — keeps the render pure (react-hooks/purity) and immune to clock skew.

### Checks

- `npm run type-check` — 0 errors.
- `npm run lint` — 0 errors in changed files (3 remaining errors are pre-existing, all
  inside `mobile/build/` Flutter artifacts; 8 `<img>` warnings pre-existing).
- `npx vitest run tests/unit/weigh-in-nudge.test.ts` — 19/19 passing.
- Full unit suite: 41 failures, all pre-existing (stale Prisma mocks / drifted return
  shapes in service tests I did not touch).
- Live smoke test against the local Docker DB as `ammu@gmail.com`: `shouldPrompt: true`,
  `reason: STALE`, 59 days since last weigh-in, −3.7 kg over 44 weigh-ins. Posting a
  weight via the modal's endpoint flipped `shouldPrompt` to false and recalculated the
  total to −4.2 kg. The smoke-test row was deleted afterwards, restoring the 59-day
  stale state for manual testing.

### Not done

- **Not verified in a browser.** No browser automation is installed in this repo, so
  the modal's layout, dark mode, and the sparkline gap have not been looked at on a
  real screen. Needs an eyeball at 320px before shipping.
- Flutter mobile client not covered — out of scope for v1 (see ADR-049). It needs no
  backend work when it is picked up.

---

## S7-CL-03 — Intake Measurements Seed the Progress Timeline

**Agent:** @architect + @backend
**Completed:** 2026-08-26
**ADR:** ADR-050 (supersedes an ADR-049 consequence)

### Goal

`ClientProfile.currentWeight` / `bodyFatPercentage` were write-only fields — set by the
admin at signup, never synced from `progress_entries`, and read only to re-fill the form
that wrote them. Their names claimed to be live values. They also cost the ADR-049
weigh-in nudge its true baseline: a client weighed at 80 kg on signup whose first logged
entry was 75 kg six months later was told they'd lost 1 kg, not 6.

### Migration

`prisma/migrations/20260826124934_rename_client_intake_measurements` —
`currentWeight` → `intakeWeight`, `bodyFatPercentage` → `intakeBodyFat`.

Hand-written as `ALTER TABLE ... RENAME COLUMN`. Prisma renders a field rename as
DROP + ADD, which would have destroyed the stored intake data. Applied to LOCAL Docker
only (Rule 0) via `migrate deploy` with a forced local `DATABASE_URL`/`DIRECT_URL` —
`migrate dev` cannot run in this non-interactive shell.

**Data verified identical across the rename:** 79 client_profiles rows, 62 non-null
weights, 19 non-null body-fat values, before and after.

**NOT applied to Neon.** That is a separate deliberate deploy step.

### Files changed

- `prisma/schema.prisma` — both fields renamed, with doc comments stating they are
  signup-day records, not live values.
- `src/services/user.service.ts` — renamed fields; `createUser` now calls
  `createProgressEntry` when intake weight and/or body fat is supplied
  (`notes: 'Recorded at signup'`, recorded by the creating admin). Wrapped in try/catch
  so it can never block client creation. Reusing the service means the intake entry gets
  the same audit log and badge evaluation as any other measurement.
- `src/lib/validators.ts` — `createUserSchema` field rename.
- `src/app/(dashboard)/admin/clients/new/page.tsx` — renamed; labels now "Starting
  weight (kg)" / "Starting body fat %".
- `src/app/(dashboard)/admin/clients/[id]/page.tsx` — renamed; labels now "Intake
  weight (kg)" / "Intake body fat %".
- `src/app/(dashboard)/admin/clients/page.tsx` — interface rename.
- `prisma/seed.ts`, `prisma/seed-dev-ammu.ts` — renamed.
- `tests/unit/user-service.test.ts` — updated the one test that asserted on the old
  field name (it was genuinely passing before the rename, unlike the file's 18
  pre-existing failures).
- `tests/unit/intake-progress-seed.test.ts` — NEW, 7 cases: weight-only, weight+body fat,
  body-fat-only, profile still stores the values, no entry when neither given, no entry
  for a trainer, and creation still succeeds when the seed write throws.
- `memory/schema.md`, `memory/api-contracts.md`, `memory/decisions.md` (ADR-050).

### Checks

- Local migration applied; `npx prisma generate` succeeded; dev server restarted to pick
  up the regenerated client.
- `npm run type-check` — 0 errors.
- `npm run lint` — 0 findings in changed files.
- `npx vitest run tests/unit/intake-progress-seed.test.ts` — 7/7 passing.
- Full unit suite: 41 failures, matching the pre-existing baseline exactly. Baseline was
  measured in a throwaway `git worktree` at HEAD (18 failures in `user-service.test.ts`
  before, 18 after the test fix) — NOT via `git stash`.
- **Live end-to-end**: created a client through `POST /api/admin/users` with
  `intakeWeight: 82.5, intakeBodyFat: 24.1` → profile stored both, a `progress_entries`
  row appeared with 82.5 / 24.1 / "Recorded at signup", and both `USER_CREATED` and
  `PROGRESS_CREATED` audit entries were written. Test client and its rows deleted after.
- No references to the old names remain in `src/`, `prisma/`, or `mobile/lib/`.

### Not done

- **Existing clients are not backfilled.** Clients whose intake weight predates their
  first `ProgressEntry` still have the truncated baseline. Suggested follow-up: insert a
  `ProgressEntry` dated `clientProfile.createdAt` from `intakeWeight` where the client
  has no entry at or before that date.
- Neon migration not applied — deliberate, separate deploy step.
- Admin forms not eyeballed in a browser after the relabel.
