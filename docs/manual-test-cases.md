# Sector 7 — Manual Test Cases

> Version: 2026-03-28 | Environment: http://localhost:3000
> Run these top-to-bottom in a fresh browser session. Each section depends on the previous.

---

## Legend

| Symbol | Meaning                                               |
| ------ | ----------------------------------------------------- |
| ✅     | Expected pass — verify this exact outcome             |
| 🔴     | Known failure indicator — if you see this, file a bug |
| 📸     | Take a screenshot for bug reporting                   |
| 👤     | Login required as this role                           |
| 🔁     | Repeat action                                         |

---

## Prerequisites — Reset State

Before starting, ensure:

- App is running: `npm run dev`
- Database is seeded (admin account exists)
- You have 3 browser windows/tabs ready (one per role)

**Admin credentials (default):** `admin@sector7.in` / `password123` _(adjust to your seed)_

---

---

# BLOCK 1 — ADMIN: SETUP

## TC-001: Admin Login

**Role:** 👤 Admin
**URL:** `http://localhost:3000/login`

| Step | Action                                            | Expected Result                                  |
| ---- | ------------------------------------------------- | ------------------------------------------------ |
| 1    | Open `/login`                                     | ✅ Dark login page loads. Sector 7 logo visible. |
| 2    | Enter wrong email + password → click "Sign In"    | ✅ Error message appears (do not navigate away)  |
| 3    | Enter correct admin credentials → click "Sign In" | ✅ Redirects to `/admin` dashboard               |
| 4    | Refresh the page                                  | ✅ Stays on admin dashboard (session persists)   |

---

## TC-002: Create a Trainer Account

**Role:** 👤 Admin
**URL:** `http://localhost:3000/admin/trainers/new`

| Step | Action                                                                                                                                    | Expected Result                                                               |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 1    | Navigate to `/admin/trainers`                                                                                                             | ✅ Trainer list page loads                                                    |
| 2    | Click "+ New Trainer" button                                                                                                              | ✅ Navigates to `/admin/trainers/new` form                                    |
| 3    | Leave all fields empty → click Submit                                                                                                     | ✅ Validation errors shown (do not submit)                                    |
| 4    | Fill in: First Name: **Test**, Last Name: **Trainer**, Email: **trainer.test@sector7.in**, Phone: **9876543210**, Password: **Test@1234** |                                                                               |
| 5    | Click Submit                                                                                                                              | ✅ Success toast. Redirected to trainer list. "Test Trainer" appears in list. |
| 6    | Try to create another trainer with same email                                                                                             | ✅ Error: email already exists                                                |

**Note the trainer's ID from the URL when you click their name — you'll need it later.**

---

## TC-003: Create a Client Account

**Role:** 👤 Admin
**URL:** `http://localhost:3000/admin/clients/new`

| Step | Action                                                                                                                                  | Expected Result                                   |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| 1    | Navigate to `/admin/clients`                                                                                                            | ✅ Client list loads                              |
| 2    | Click "+ New Client"                                                                                                                    | ✅ Navigates to `/admin/clients/new`              |
| 3    | Fill in: First Name: **Test**, Last Name: **Client**, Email: **client.test@sector7.in**, Phone: **9123456789**, Password: **Test@1234** |                                                   |
| 4    | Click Submit                                                                                                                            | ✅ Success. "Test Client" appears in client list. |
| 5    | Create a second client: **Test Client Two** / `client2.test@sector7.in`                                                                 | ✅ Both clients now in list                       |

---

## TC-004: Create a PT Package (Map Trainer → Client)

**Role:** 👤 Admin
**URL:** `http://localhost:3000/admin/clients/[clientId]`

| Step | Action                                                                                       | Expected Result                                                               |
| ---- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 1    | Go to client detail page for "Test Client"                                                   | ✅ Client profile visible                                                     |
| 2    | Find the "PT Package" or "Assign Trainer" section                                            | ✅ Section visible                                                            |
| 3    | Select Trainer: **Test Trainer**, Sessions/Month: **8**, Charge: **5000**, Start Date: today |                                                                               |
| 4    | Click Save/Assign                                                                            | ✅ PT package created. Trainer name and session count visible on client page. |
| 5    | Check `/admin/trainers/[trainerId]`                                                          | ✅ "Test Client" appears in their client list                                 |

---

## TC-005: Schedule Sessions for the Month

**Role:** 👤 Admin
**URL:** `http://localhost:3000/admin/scheduling`

| Step | Action                                                                   | Expected Result                                                                             |
| ---- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| 1    | Navigate to `/admin/scheduling`                                          | ✅ Scheduling page loads with calendar                                                      |
| 2    | Select client: **Test Client**                                           | ✅ Trainer auto-fills as "Test Trainer"                                                     |
| 3    | Select Day of Week: **Monday**, Time: **07:00 AM**, Duration: **60 min** |                                                                                             |
| 4    | Set Valid From: first Monday of current month                            |                                                                                             |
| 5    | Click "Save Schedule"                                                    | ✅ Schedule created. Confirmation shown.                                                    |
| 6    | Click "Generate Sessions" for current month                              | ✅ Sessions generated. Count matches Mondays in the month.                                  |
| 7    | Navigate to `/admin/sessions`                                            | ✅ Generated sessions appear with status "Scheduled", date, time, client name, trainer name |
| 8    | Generate sessions again for same month                                   | ✅ No duplicate sessions created (idempotent)                                               |

---

## TC-006: Admin Sessions List — Filtering

**Role:** 👤 Admin
**URL:** `http://localhost:3000/admin/sessions`

| Step | Action                               | Expected Result                       |
| ---- | ------------------------------------ | ------------------------------------- |
| 1    | Open sessions page                   | ✅ Sessions list with pagination      |
| 2    | Filter by Status: **Scheduled**      | ✅ Only scheduled sessions shown      |
| 3    | Filter by Trainer: **Test Trainer**  | ✅ Only that trainer's sessions shown |
| 4    | Filter by Date range (current month) | ✅ Only sessions in range shown       |
| 5    | Clear all filters                    | ✅ All sessions return                |

---

## TC-007: Log a Payment

**Role:** 👤 Admin

| Step | Action                                                                  | Expected Result                                                  |
| ---- | ----------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 1    | Navigate to client "Test Client" detail or `/admin/payments`            | ✅ Payment section visible                                       |
| 2    | Click "+ Log Payment"                                                   | ✅ Payment form opens                                            |
| 3    | Fill: Amount: **5000**, Method: **Cash**, Status: **Paid**, Date: today |                                                                  |
| 4    | Submit                                                                  | ✅ Payment record appears in list with correct amount and status |

---

---

# BLOCK 2 — TRAINER: DAILY WORKFLOW

> Open a **new private/incognito window** for trainer login.

## TC-008: Trainer Login

**Role:** 👤 Trainer
**URL:** `http://localhost:3000/login`

| Step | Action                                              | Expected Result                                               |
| ---- | --------------------------------------------------- | ------------------------------------------------------------- |
| 1    | Login as `trainer.test@sector7.in` / `Test@1234`    | ✅ Redirected to `/trainer` dashboard                         |
| 2    | Verify dashboard shows: today's date, session stats | ✅ "Sessions this month" shows correct count from TC-005      |
| 3    | Verify "Today's Sessions" section                   | ✅ Shows session for today if one was scheduled (Monday test) |
| 4    | Verify "Upcoming Sessions" section                  | ✅ Shows next 14 days of scheduled sessions                   |

---

## TC-009: Trainer Dashboard Stats

**Role:** 👤 Trainer
**URL:** `http://localhost:3000/trainer`

| Step | Action                                                                         | Expected Result                                                                                            |
| ---- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| 1    | Check stat cards: Sessions this month / Completed / No-shows / Completion rate | ✅ All 4 cards visible, numbers are integers (not decimals)                                                |
| 2    | If no session today: Upcoming section shows future sessions                    | ✅ Sessions grouped by date header                                                                         |
| 3    | Resize browser to mobile width (375px)                                         | ✅ Stat cards in 2×2 grid. Action buttons (Start/No Show) stack vertically below client name. No overflow. |

---

## TC-010: Start a Session

**Role:** 👤 Trainer
**URL:** `http://localhost:3000/trainer`

> **Setup:** Ensure there is a session scheduled for today. If not, ask admin to create one via `/admin/sessions` → edit date to today.

| Step | Action                                                       | Expected Result                                                  |
| ---- | ------------------------------------------------------------ | ---------------------------------------------------------------- |
| 1    | Find today's session for "Test Client" in "Today's Sessions" | ✅ Shows client name, time, "Scheduled" badge                    |
| 2    | Click **"Start Session"** button                             | ✅ API call fires. Navigates to `/trainer/session/[id]`          |
| 3    | Verify session page header                                   | ✅ "TK" (initials) avatar, "Test Client", date/time visible      |
| 4    | Verify live timer                                            | ✅ Green pulsing dot + timer counting up (e.g. "00:12")          |
| 5    | Verify meta chips                                            | ✅ "60 min · 0 exercises logged · IN PROGRESS"                   |
| 6    | Go back to `/trainer`                                        | ✅ Compact emerald "Session in progress" banner shows with timer |
| 7    | Click the banner                                             | ✅ Returns to `/trainer/session/[id]`                            |

---

## TC-011: Workout Logger — Add Exercise

**Role:** 👤 Trainer
**URL:** `http://localhost:3000/trainer/session/[id]`

| Step | Action                                                    | Expected Result                                                  |
| ---- | --------------------------------------------------------- | ---------------------------------------------------------------- |
| 1    | Tap **"Add First Exercise"** or **"Add Exercise"** button | ✅ Search panel slides in below button                           |
| 2    | Type "bench" in search box                                | ✅ Results appear: "Bench Press" with type badge "Weighted"      |
| 3    | Tap **"Bench Press"**                                     | ✅ Exercise card appears with blue left border. 1 empty set row. |
| 4    | Tap **"Add Exercise"** again, search "squat"              | ✅ "Squat" results appear                                        |
| 5    | Select Squat                                              | ✅ Second exercise card added below Bench Press                  |
| 6    | Press Escape in search box                                | ✅ Search closes                                                 |

---

## TC-012: Workout Logger — Log Sets

**Role:** 👤 Trainer
**URL:** `http://localhost:3000/trainer/session/[id]`

| Step | Action                                                      | Expected Result                                              |
| ---- | ----------------------------------------------------------- | ------------------------------------------------------------ |
| 1    | In Bench Press card: tap Reps field for Set 1, enter **10** | ✅ Value shows as 10                                         |
| 2    | Tap KG field, enter **60**                                  | ✅ Value shows as 60                                         |
| 3    | Tap RPE field, enter **7**                                  | ✅ Value shows as 7                                          |
| 4    | Tap **"+ Add Set"**                                         | ✅ Set 2 row appears below Set 1                             |
| 5    | Enter Set 2: Reps **8**, KG **65**, RPE **8**               | ✅ Both sets visible                                         |
| 6    | Check if sticky "Save Workout" bar appears at bottom        | ✅ Orange/primary "Save Workout" bar visible (unsaved state) |
| 7    | Tap the **X** (remove set) on Set 2                         | ✅ Set 2 removed. Only Set 1 remains. Set numbers renumber.  |
| 8    | Re-add Set 2 with different values                          |                                                              |
| 9    | In Squat card: tap **collapse chevron** (^)                 | ✅ Sets hide. Only header with "1 set" badge visible.        |
| 10   | Tap chevron again                                           | ✅ Sets expand back                                          |

---

## TC-013: Workout Logger — Save and Idempotency

**Role:** 👤 Trainer

| Step | Action                                                    | Expected Result                                                  |
| ---- | --------------------------------------------------------- | ---------------------------------------------------------------- |
| 1    | With 2 exercises and sets entered, tap **"Save Workout"** | ✅ "Workout saved" toast. Save bar disappears (all saved state). |
| 2    | Refresh the page (`F5` or pull-to-refresh)                | ✅ Both exercises reload. Sets preserved. No duplicates.         |
| 3    | Verify no duplicate cards                                 | ✅ Bench Press appears ONCE with 2 sets, Squat appears ONCE      |
| 4    | Change a value (e.g. KG 60 → 62)                          | ✅ Save bar reappears                                            |
| 5    | Tap Save again                                            | ✅ Saved. Refresh again — still no duplicates                    |
| 6    | Add a 3rd exercise (e.g. "Barbell Row"), save             | ✅ 3 exercise cards total, each with correct sets                |

---

## TC-014: Exercise Progress Modal

**Role:** 👤 Trainer

| Step | Action                                                        | Expected Result                                                   |
| ---- | ------------------------------------------------------------- | ----------------------------------------------------------------- |
| 1    | In any exercise card, tap the **TrendingUp (📈) icon** button | ✅ Bottom sheet modal slides up                                   |
| 2    | Verify modal header                                           | ✅ "Exercise Progress" label + exercise name (e.g. "Bench Press") |
| 3    | If client has no history for this exercise                    | ✅ Empty state: "No history yet" message                          |
| 4    | If client has history                                         | ✅ 3 stat pills: Latest / Best / Change. Area chart below.        |
| 5    | Tap backdrop (outside modal)                                  | ✅ Modal closes                                                   |
| 6    | Tap ✕ button                                                  | ✅ Modal closes                                                   |
| 7    | Open modal for a CARDIO exercise                              | ✅ Unit shows "sec" or "km" not "kg"                              |

---

## TC-015: End Session

**Role:** 👤 Trainer
**URL:** `http://localhost:3000/trainer/session/[id]`

| Step | Action                                                    | Expected Result                                                                          |
| ---- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 1    | Tap **"End Session"** button at bottom                    | ✅ Confirmation dialog: "Are you sure you want to end this session?"                     |
| 2    | Tap **Cancel**                                            | ✅ Dialog closes. Session still active. Timer still running.                             |
| 3    | Tap "End Session" again → tap **"End Session"** in dialog | ✅ "Session ended" toast. Navigates to `/trainer`.                                       |
| 4    | Check dashboard                                           | ✅ No active session banner. "Completed" count incremented.                              |
| 5    | Find the session in "Today's Sessions"                    | ✅ Status badge changed to "Completed". "View Workout" button visible.                   |
| 6    | Tap **"View Workout"**                                    | ✅ Navigates to `/trainer/sessions/[id]` — read-only session view                        |
| 7    | Verify session view                                       | ✅ Client avatar + name + "Completed" badge. All exercises and sets displayed read-only. |

---

## TC-016: Mark No-Show

**Role:** 👤 Trainer

> **Setup:** Admin must create another session for today for Test Client Two (who won't show up).

| Step | Action                                | Expected Result                                                               |
| ---- | ------------------------------------- | ----------------------------------------------------------------------------- |
| 1    | Find that session in Today's Sessions | ✅ "Scheduled" status, Start + No Show buttons                                |
| 2    | Tap **"No Show"** button              | ✅ Confirmation dialog: "Mark this client as no-show?"                        |
| 3    | Tap Cancel                            | ✅ Nothing changes                                                            |
| 4    | Tap No Show → confirm                 | ✅ Session status changes to "No Show" (amber badge). No session page opened. |
| 5    | Check dashboard stats                 | ✅ No-shows incremented by 1. Completion rate recalculated.                   |

---

## TC-017: Trainer — View Client Progress

**Role:** 👤 Trainer
**URL:** `http://localhost:3000/trainer/clients`

| Step | Action                                         | Expected Result                                                          |
| ---- | ---------------------------------------------- | ------------------------------------------------------------------------ |
| 1    | Navigate to `/trainer/clients`                 | ✅ Only assigned clients shown (Test Client, Test Client Two)            |
| 2    | Tap **Test Client**                            | ✅ Client detail page                                                    |
| 3    | Find "View Progress" or "Progress" link/button | ✅ Navigates to `/trainer/clients/[id]/progress`                         |
| 4    | Verify layout                                  | ✅ 2×2 stat grid. Weight/Body Fat/Muscle/Waist tiles. Full-width 3 tabs. |
| 5    | All numbers                                    | ✅ Max 1 decimal place (e.g. "54.1 kg", not "54.1026...")                |
| 6    | Tap **Body Metrics** tab                       | ✅ Weight chart + Body Fat % chart visible                               |
| 7    | Tap **"+ Log"** next to Weight                 | ✅ Quick log dialog opens                                                |
| 8    | Enter weight: **75.5** → tap Save              | ✅ "Saved!" confirmation. Dialog auto-closes. Chart updates.             |
| 9    | Tap **History** tab                            | ✅ Entry cards with date block, metric grid, LATEST badge on newest      |
| 10   | Tap **pencil (edit)** icon on any entry        | ✅ Edit dialog opens with prefilled values                               |
| 11   | Change a value → Save                          | ✅ Updated value shown in history                                        |
| 12   | Tap **Workouts** tab                           | ✅ WorkoutProgressionPanel loads. If exercises logged, dropdown appears. |

---

---

# BLOCK 3 — CLIENT: VIEW EXPERIENCE

> Open a **third browser window** (or different browser) for client login.

## TC-018: Client Login

**Role:** 👤 Client
**URL:** `http://localhost:3000/login`

| Step | Action                                          | Expected Result                      |
| ---- | ----------------------------------------------- | ------------------------------------ |
| 1    | Login as `client.test@sector7.in` / `Test@1234` | ✅ Redirected to `/client` dashboard |
| 2    | Verify header shows client name "Test Client"   | ✅ Avatar initials "TC" in top-right |

---

## TC-019: Client Dashboard

**Role:** 👤 Client
**URL:** `http://localhost:3000/client`

| Step | Action                                                  | Expected Result                                                             |
| ---- | ------------------------------------------------------- | --------------------------------------------------------------------------- |
| 1    | Verify greeting                                         | ✅ "Hey, [First Name]" visible                                              |
| 2    | Verify **Fitness Journey** section (if progress logged) | ✅ Weight and Body Fat cards with 1-decimal values                          |
| 3    | Weight card                                             | ✅ Value like "75.5 kg" (not "75.4999..."). Delta arrow (↓ green or ↑ red). |
| 4    | Personal Records card                                   | ✅ Shows exercises logged in sessions with max weight                       |
| 5    | Verify **Sessions ring**                                | ✅ Donut ring shows used/total. Numbers: Used, Remaining, Total, Carry Fwd  |
| 6    | Verify **Next Session** card                            | ✅ Date, time, trainer name, duration. Correct after TC-005 scheduling.     |
| 7    | Verify **Your Trainer** card                            | ✅ Trainer name "Test Trainer". Sessions per month.                         |
| 8    | Resize to 375px mobile                                  | ✅ No horizontal scroll. All sections stack properly.                       |

---

## TC-020: Client Dashboard — Active Session Banner

**Role:** 👤 Client + Trainer simultaneously

| Step | Action                                           | Expected Result                                                              |
| ---- | ------------------------------------------------ | ---------------------------------------------------------------------------- |
| 1    | Trainer starts a session (TC-010)                |                                                                              |
| 2    | Client refreshes their dashboard                 | ✅ Emerald "Active Session" banner appears with client's name and live timer |
| 3    | Client taps the banner                           | ✅ Navigates to `/client/session/[id]` — live read-only view                 |
| 4    | Verify live view header                          | ✅ Trainer name, date, time, "LIVE" pill                                     |
| 5    | Trainer adds an exercise (Bench Press) and saves |                                                                              |
| 6    | Wait 10 seconds OR tap "Refresh"                 | ✅ Bench Press card appears in client's view                                 |
| 7    | Trainer ends session                             |                                                                              |
| 8    | Client waits 10 seconds                          | ✅ Live banner disappears or changes state                                   |

---

## TC-021: Client Sessions Page

**Role:** 👤 Client
**URL:** `http://localhost:3000/client/sessions`

| Step | Action                         | Expected Result                                                         |
| ---- | ------------------------------ | ----------------------------------------------------------------------- |
| 1    | Navigate to `/client/sessions` | ✅ Page loads with month navigator                                      |
| 2    | Verify stat row                | ✅ Done / Upcoming / No Show / Cancelled counts visible                 |
| 3    | Navigate to previous month     | ✅ Left arrow works. Month label updates. Sessions for that month load. |
| 4    | Navigate back to current month | ✅ Current month's sessions visible                                     |
| 5    | Find a **Completed** session   | ✅ "Completed" emerald badge. **"View workout"** button visible.        |
| 6    | Tap **"View workout"**         | ✅ Navigates to `/client/session/[id]`                                  |
| 7    | Verify session detail          | ✅ Trainer name, date, time. All exercises and sets shown read-only.    |
| 8    | Find a **Scheduled** session   | ✅ "Scheduled" blue badge. No "View workout" button.                    |
| 9    | Find a **No Show** session     | ✅ Amber badge. No view button.                                         |

---

## TC-022: Client Workout History

**Role:** 👤 Client
**URL:** `http://localhost:3000/client/workouts`

| Step | Action                         | Expected Result                                                                           |
| ---- | ------------------------------ | ----------------------------------------------------------------------------------------- |
| 1    | Navigate to `/client/workouts` | ✅ Quick stats: Sessions / Exercises / Total Sets                                         |
| 2    | Session cards visible          | ✅ Each card shows date block, trainer name, time, muscle tags, exercise count, set count |
| 3    | Tap any session card           | ✅ Navigates to `/client/session/[id]` — same read-only view                              |
| 4    | Tap **Filters** toggle         | ✅ Filter panel expands with Muscle Group dropdown + From/To dates                        |
| 5    | Select Muscle Group: **Chest** | ✅ Only sessions containing chest exercises shown                                         |
| 6    | Set date range to last 7 days  | ✅ Only sessions in range shown                                                           |
| 7    | Tap **"Clear all filters"**    | ✅ All sessions return                                                                    |

---

## TC-023: Client Progress Page

**Role:** 👤 Client
**URL:** `http://localhost:3000/client/progress`

| Step | Action                         | Expected Result                                                         |
| ---- | ------------------------------ | ----------------------------------------------------------------------- |
| 1    | Navigate to `/client/progress` | ✅ Page loads: header "My Progress", entries count                      |
| 2    | Verify 2×2 stat grid           | ✅ Weight / Body Fat / Muscle Mass / Waist tiles                        |
| 3    | Values                         | ✅ Max 1 decimal (e.g. "75.5 kg", NOT "75.4999...")                     |
| 4    | Delta arrows                   | ✅ "First entry" shown if only one reading. Arrow + number if multiple. |
| 5    | Tap **Body Metrics** tab       | ✅ Weight Trend chart + Body Fat % chart (AreaChart with gradient fill) |
| 6    | Chart header                   | ✅ Shows current value, delta pill "▼ 0.8 kg", "Start: 54.9kg"          |
| 7    | Tap a dot on the chart         | ✅ Tooltip appears with date + value                                    |
| 8    | Tap **Workouts** tab           | ✅ Exercise selector visible if workouts logged                         |
| 9    | Tap **History** tab            | ✅ Entry cards with date block, metric grid, LATEST badge               |
| 10   | Mobile 375px                   | ✅ All tabs fit in one row. No overflow. Charts are full width.         |

---

---

# BLOCK 4 — ADMIN: LEAVE & REASSIGNMENT

## TC-024: Trainer Applies for Leave

**Role:** 👤 Trainer
**URL:** `http://localhost:3000/trainer`

| Step | Action                                                                     | Expected Result                                                                |
| ---- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 1    | Find "Leave" section in trainer sidebar/navigation                         | ✅ Navigates to leave request page                                             |
| 2    | Click "+ Request Leave"                                                    | ✅ Leave form opens                                                            |
| 3    | Select Start Date: next Monday, End Date: next Tuesday, Reason: "Personal" |                                                                                |
| 4    | Submit                                                                     | ✅ Leave request created with status "Pending". Shows affected sessions count. |

---

## TC-025: Admin Approves Leave

**Role:** 👤 Admin
**URL:** `http://localhost:3000/admin/leaves`

| Step | Action                                                  | Expected Result                                                    |
| ---- | ------------------------------------------------------- | ------------------------------------------------------------------ |
| 1    | Navigate to `/admin/leaves`                             | ✅ Test Trainer's leave request visible with "Pending" status      |
| 2    | Click the leave entry                                   | ✅ Detail view shows affected sessions (clients impacted)          |
| 3    | Click **"Approve"**                                     | ✅ Status changes to "Approved". Sessions for those dates flagged. |
| 4    | Navigate to `/admin/sessions` and filter by those dates | ✅ Sessions exist but trainer is on leave                          |
| 5    | Reassign one session to another trainer                 | ✅ Session shows new trainer name                                  |

---

---

# BLOCK 5 — REGRESSION: BUG CATCH LIST

These are specific checks for previously found and fixed bugs. If any of these fail, a regression has occurred.

## TC-R01: Floating Point Numbers (Fixed 2026-03-28)

| Check               | Where                             | Expected                            |
| ------------------- | --------------------------------- | ----------------------------------- |
| Weight display      | `/client` dashboard               | "54.1 kg" ✅ NOT "54.1026877..." 🔴 |
| Body Fat display    | `/client` dashboard               | "21.4%" ✅ NOT "21.43978..." 🔴     |
| Weight stat tile    | `/client/progress`                | "75.5 kg" ✅                        |
| Body Fat stat tile  | `/client/progress`                | "21.4%" ✅                          |
| Weight stat tile    | `/trainer/clients/[id]/progress`  | "75.5 kg" ✅                        |
| History card values | `/client/progress` → History tab  | "75.5 kg" ✅ NOT raw float 🔴       |
| Chart header value  | `/client/progress` → Body Metrics | "54.1 kg" ✅                        |

---

## TC-R02: Duplicate Exercise Cards (Fixed 2026-03-28)

| Step | Action                             | Expected                                                              |
| ---- | ---------------------------------- | --------------------------------------------------------------------- |
| 1    | Log Bench Press with 2 sets. Save. | ✅ 1 Bench Press card with 2 sets                                     |
| 2    | Change a set value. Save again.    | ✅ Still 1 Bench Press card with 2 sets (updated values)              |
| 3    | Refresh page.                      | ✅ Still 1 card. No duplicates.                                       |
| 4    | Save 5 more times. Refresh.        | ✅ Still 1 card. 🔴 If 5 cards appear, delete-then-recreate is broken |

---

## TC-R03: Set Count Accuracy (Fixed 2026-03-28)

| Step | Action                                                   | Expected                     |
| ---- | -------------------------------------------------------- | ---------------------------- |
| 1    | Log 2 sets for Bench Press. Save.                        | ✅ Card shows "2 sets" badge |
| 2    | Refresh page                                             | ✅ Both sets still visible   |
| 3    | Open client session view while trainer has 2 sets logged | ✅ Client sees 2 sets, not 1 |

---

## TC-R04: Client Sessions API branchId (Fixed 2026-03-28)

| Check                                             | Expected                                               |
| ------------------------------------------------- | ------------------------------------------------------ |
| `/client/sessions` loads without error            | ✅ No 500 error                                        |
| `/client` dashboard loads Fitness Journey section | ✅ No 500 error in console for `/api/client/dashboard` |

---

## TC-R05: Trainer Session 404 After Ending (Fixed 2026-03-28)

| Step | Action                                                               | Expected                                                                   |
| ---- | -------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 1    | End a session                                                        | ✅ Navigates back to `/trainer` dashboard                                  |
| 2    | In Today's Sessions, tap **"View Workout"** on the completed session | ✅ Navigates to `/trainer/sessions/[id]` (plural). Page loads. 🔴 NOT 404. |
| 3    | Verify exercises shown                                               | ✅ All logged exercises and sets displayed                                 |

---

## TC-R06: exerciseType Missing (Fixed 2026-03-28)

| Step | Action                                                | Expected                                        |
| ---- | ----------------------------------------------------- | ----------------------------------------------- |
| 1    | Add a CARDIO exercise (e.g. "Treadmill") to a session | ✅ Red left border on card                      |
| 2    | Open the exercise card                                | ✅ Columns show "sec" / "km" (not Reps/KG)      |
| 3    | Reload the page                                       | ✅ Card reloads without TypeError in console 🔴 |
| 4    | Client opens `/client/session/[id]`                   | ✅ CARDIO card renders correctly, no crash      |

---

---

# BLOCK 6 — MOBILE RESPONSIVENESS

Test each page at **375px width** (iPhone SE / most Android phones).

| Page                    | URL                              | Checks                                                                                                            |
| ----------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Trainer Dashboard       | `/trainer`                       | ✅ 2×2 stat grid. Start+No Show buttons stacked vertically (not side by side). Upcoming header fits 1 line.       |
| Active Session          | `/trainer/session/[id]`          | ✅ Header has client name + timer. Meta chips wrap if needed. Workout log scrolls. End Session button full width. |
| WorkoutLogger           | (inside session page)            | ✅ Set input cells fit 4 columns (Set / Reps / KG / RPE). Inputs h-10. No horizontal scroll.                      |
| Client Dashboard        | `/client`                        | ✅ Fitness Journey 2-col grid. Sessions ring centered. Next session card.                                         |
| Client Sessions         | `/client/sessions`               | ✅ 4-col stats row fits. Session cards no overflow.                                                               |
| Client Progress         | `/client/progress`               | ✅ 2×2 stat tiles. Full-width tabs. Charts fill width. History cards readable.                                    |
| Client Workout History  | `/client/workouts`               | ✅ Session cards tappable. Muscle tags wrap. No overflow.                                                         |
| Trainer Client Progress | `/trainer/clients/[id]/progress` | ✅ Same as client progress. "+ Log" buttons visible.                                                              |

---

---

# BLOCK 7 — EDGE CASES

## TC-E01: No Sessions Scheduled

| Setup                                      | Expected                                                                                               |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Create a brand new client with no sessions | Client dashboard shows: empty sessions ring (0 of 0), no "Next Session" card, no active session banner |
| Trainer dashboard with no sessions today   | "No sessions scheduled for today" message in Today's Sessions section                                  |

---

## TC-E02: No Progress Data

| Setup                                 | Expected                                                                                                 |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Client with no progress entries       | Fitness Journey section hidden on dashboard. Progress page shows empty state with "Log Measurement" CTA. |
| Trainer views client with no progress | All 4 stat tiles show "—". Charts show "No data available".                                              |

---

## TC-E03: Session Already In Progress

| Step                                       | Expected                                        |
| ------------------------------------------ | ----------------------------------------------- |
| Two trainers try to start the same session | Second start call returns error                 |
| Trainer tries to start a COMPLETED session | Error toast. Does not navigate to session page. |

---

## TC-E04: Search Empty State

| Step | Action                                | Expected                                                         |
| ---- | ------------------------------------- | ---------------------------------------------------------------- |
| 1    | Open exercise search in WorkoutLogger | ✅ "Start typing to search…" message                             |
| 2    | Type a nonsense query: "zzzzzzz"      | ✅ "No exercises found" message (not a crash or empty white box) |

---

## TC-E05: Timer Accuracy

| Step | Action                                          | Expected                                                          |
| ---- | ----------------------------------------------- | ----------------------------------------------------------------- |
| 1    | Start a session                                 | ✅ Timer starts at 00:00 and counts up                            |
| 2    | Navigate away to dashboard (banner shows timer) | ✅ Timer in banner continues counting (not reset)                 |
| 3    | Navigate back to session page                   | ✅ Timer in header reflects correct elapsed time (not reset to 0) |

---

---

# Bug Report Template

When you find a bug, copy this template:

```
## Bug: [Short description]

**TC Reference:** TC-XXX (step N)
**URL:** http://localhost:3000/...
**Role:** Admin / Trainer / Client
**Steps to reproduce:**
1.
2.
3.

**Expected:** [What TC says should happen]
**Actual:** [What actually happened]
**Screenshot:** [attach]
**Console errors:** [paste any red errors from browser DevTools → Console]
**Network errors:** [paste any 4xx/5xx from browser DevTools → Network]
```

---

_Last updated: 2026-03-28 | Coverage: Admin setup, Trainer session flow, Client views, Mobile responsiveness, Regression checks_
