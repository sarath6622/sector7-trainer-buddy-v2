# Architectural Decisions — Sector 7

> Append-only. Never delete or modify a decision. If a decision is reversed, add a new ADR referencing the old one.

---

## ADR-001: Single Next.js Repo Over Turborepo Monorepo

**Date:** March 2026
**Status:** Accepted
**Context:** The RequirementsHub project used Turborepo with separate web and API apps. Sector 7 is a simpler operational tool — one app, one database, one deployment target.
**Decision:** Use a single Next.js 14+ repo with App Router. API routes and server actions handle backend logic. No separate backend service.
**Consequences:** Simpler deployment (one Vercel project), shared types without package boundaries, faster iteration. Trade-off: harder to split if backend needs to scale independently later.

---

## ADR-002: Full-Stack Next.js with Service Layer Pattern

**Date:** March 2026
**Status:** Accepted
**Context:** Without a separate NestJS backend, we need clear separation between HTTP handling and business logic.
**Decision:** API routes are thin handlers (validate → call service → return). All business logic lives in `src/services/`. Services receive `branchId` as a mandatory parameter. Prisma is accessed only from services, never from API routes or components directly.
**Consequences:** Testable business logic, consistent branch scoping, clear ownership boundaries for agents.

---

## ADR-003: Branch-Scoped Multi-Tenant from Day One

**Date:** March 2026
**Status:** Accepted
**Context:** Sector 7 plans to expand to multiple branches and franchise locations.
**Decision:** Every database entity (except Exercise library) includes `branchId`. Middleware extracts `branchId` from the authenticated user's session. All queries are scoped. Branch settings are per-branch.
**Consequences:** No schema migration needed for multi-branch. Slightly more complex queries, but prevents a painful retrofit later.

---

## ADR-004: Dexie.js + Workbox for Offline Workout Logging

**Date:** March 2026
**Status:** Accepted
**Context:** Gyms often have poor connectivity. Trainers need to log workouts without interruption.
**Decision:** Use Dexie.js (IndexedDB wrapper) for local-first workout storage. Workbox background sync queues writes and syncs when online. Conflict resolution: last-write-wins with timestamp comparison.
**Consequences:** Reliable gym-floor experience. Complexity in sync logic and conflict handling. Requires thorough testing with network toggling.

---

## ADR-005: WhatsApp Business API + FCM Dual-Channel Notifications

**Date:** March 2026
**Status:** Accepted
**Context:** WhatsApp is the dominant messaging platform for the target user base (India/Kerala). In-app notifications are needed for real-time events.
**Decision:** Use WhatsApp Business API with pre-approved templates for scheduled notifications (reminders, leave updates, reassignment). Use Firebase Cloud Messaging (FCM) for in-app push. WhatsApp failures fall back to in-app only.
**Consequences:** Requires Meta Business verification and template approval (start early). Two notification code paths to maintain.

---

## ADR-006: Soft Conflict Detection for Scheduling

**Date:** March 2026
**Status:** Accepted
**Context:** Trainers at Sector 7 sometimes handle multiple clients simultaneously (based on expertise).
**Decision:** Scheduling conflicts (two clients overlapping with same trainer) trigger a soft warning, not a hard block. Admin can acknowledge and override. All overrides are logged in the audit trail.
**Consequences:** Flexible real-world scheduling. Requires clear UI for conflict visibility and override confirmation.

---

## ADR-007: Audit Log as Append-Only PostgreSQL Table

**Date:** March 2026
**Status:** Accepted
**Context:** Business requires indefinite audit retention for trust and debugging.
**Decision:** AuditLog table is append-only (no UPDATE or DELETE). Stores old/new values as JSONB. Indexed by branchId, action, subjectType, actorId, and createdAt. Partition by month after first year if volume requires it.
**Consequences:** Simple, reliable, queryable. May grow large — partition strategy documented for future.

---

## ADR-008: shadcn/ui for Component Primitives

**Date:** March 2026
**Status:** Accepted
**Context:** Need a consistent, customizable UI component system without framework lock-in.
**Decision:** Use shadcn/ui (copy-paste components built on Radix UI + Tailwind). Components live in `src/components/ui/` and are fully owned by the project.
**Consequences:** Full control over components, no dependency on external package updates. Initial setup time to install needed components.

---

## ADR-009: Dark Theme with Orange Accent — Always-Dark Mode

**Date:** March 2026
**Status:** Accepted
**Context:** Sector 7's main website (sector7.in) uses a dark theme with orange (#E8651A) accent color. The PWA should match the gym's brand identity for a cohesive experience.
**Decision:** App uses dark mode only (no light/dark toggle). The `dark` class is applied to `<html>` root. Both `:root` and `.dark` CSS custom properties are set to the same dark theme values. Primary color is Sector 7 orange (`oklch(0.637 0.179 38.5)` ≈ `#E8651A`). Background is near-black (`oklch(0.13 0 0)`). Cards/popovers use slightly lighter dark (`oklch(0.17 0 0)`). Sidebar uses `oklch(0.15 0 0)` for visual hierarchy.
**Consequences:** Consistent brand identity. No need to maintain two color schemes. All semantic color tokens (bg-background, text-foreground, etc.) automatically apply the dark theme.

---

## ADR-010: Light/Dark Theme Toggle (Supersedes ADR-009)

**Date:** 2026-03-21
**Status:** Accepted (supersedes ADR-009)
**Context:** ADR-009 mandated always-dark mode. Post-launch UX review revealed that a light mode option improves usability in bright gym environments and aligns with modern SaaS expectations. The Sector 7 brand identity (orange accent, dark sidebar) is preserved in both modes.
**Decision:** Support both light and dark themes via `next-themes` with a toggle in TopNav. Dark mode remains the default. CSS custom properties use oklch color system with Tailwind v4's `@custom-variant dark`. The brand logo PNG (white text + orange 7 on transparent bg) is placed inside a dark rounded pill container (`bg-zinc-900 rounded-lg`) in light mode to maintain visibility; in dark mode the pill is removed (`dark:bg-transparent`).
**Consequences:** All pages and components must work in both themes. The `dark:` variant is used throughout Tailwind classes. Login page remains always-dark for brand consistency.

---

## ADR-011: Button Color Theory — Semantic Colors Over Primary Accent

**Date:** 2026-03-21
**Status:** Accepted
**Context:** The primary orange accent (`#E8652C`) was being used on all buttons regardless of action type. Orange reads as "warning" in UI conventions, making the interface feel aggressive and reducing visual hierarchy.
**Decision:** Reserve orange/primary for brand elements only (logo, active nav highlight, avatar accents). Assign semantic colors based on action type:

- **Blue** (`bg-blue-600`): Create/Add actions (Add Client, Add Trainer, New Schedule, Generate, Search)
- **Emerald green** (`bg-emerald-600`): Approve/Start/Confirm positive actions (Approve Leave, Start Session)
- **Red** (`destructive` variant): Destructive/dangerous actions (Delete, Reject)
- **Outline** (`variant="outline"`): Secondary/Cancel actions
- **Default/Ghost**: Navigation, toggles, minor actions
  **Consequences:** More intuitive UI — users can quickly identify action types by color. Applied across: admin scheduling, leaves, clients, trainers, exercises, kickboxing, reassignments, audit log pages.

---

## ADR-012: Status Badge Color Semantics

**Date:** 2026-03-21
**Status:** Accepted
**Context:** Active/Inactive and Paid/Pending badges all used the orange `default` Badge variant, making status information look like warnings.
**Decision:** Use semantic colors for status badges:

- **Active / Paid** → Emerald green (`bg-emerald-500/15 text-emerald-600`)
- **Pending** → Amber (`bg-amber-500/15 text-amber-600`)
- **Inactive** → Neutral zinc gray (`bg-zinc-500/15 text-zinc-500`)
  All use `variant="secondary"` as the base with custom color classes applied via `cn()`.
  **Consequences:** Badges convey meaning at a glance. Green = healthy/complete, amber = needs attention, gray = dormant.

---

## ADR-013: Inter + JetBrains Mono as App Fonts (originally ADR-010)

**Date:** March 2026
**Status:** Accepted
**Context:** Need a modern, highly legible font for a gym management app used on mobile. Default Geist font was functional but didn't match the brand's aesthetic.
**Decision:** Replace Geist with Inter (sans-serif) and JetBrains Mono (monospace), loaded via `next/font/google` for zero layout shift. Inter provides excellent readability at all sizes, widely adopted in modern SaaS/fitness apps.
**Consequences:** Slightly larger font download on first visit. Better brand alignment and readability.

---

## ADR-014: Dedicated Active Session Page Instead of Embedded Panel

**Date:** 2026-03-28
**Status:** Accepted
**Context:** The trainer dashboard had the active session timer, WorkoutLogger, and End Session button all embedded in the dashboard page. This made the dashboard cluttered and the workout logger hard to use on a phone.
**Decision:** Extracted the active session experience to `/trainer/session/[id]` (full-screen fixed layout). The dashboard now shows only a compact tappable banner for any IN_PROGRESS session. On Start, the API is called then `router.push('/trainer/session/${id}')` navigates away.
**Consequences:** Clean separation of concerns. Dashboard is a summary view; the session page owns the entire gym-floor workflow. Cannot go back to the dashboard accidentally mid-session.

---

## ADR-015: Idempotent Workout Saves via Delete-Then-Recreate

**Date:** 2026-03-28
**Status:** Accepted
**Context:** Each "Save Workout" call was creating NEW WorkoutLog records instead of replacing existing ones, causing duplicate exercise cards and split sets.
**Decision:** `createWorkoutLogs` in `workout.service.ts` now runs inside a transaction that: (1) finds all existing WorkoutLog IDs for the session, (2) deletes child WorkoutSet records first (FK constraint), (3) deletes parent WorkoutLog records, (4) re-creates everything fresh. This makes every save idempotent.
**Consequences:** Each save results in exactly one WorkoutLog per exercise. Stale duplicates in the DB (from before the fix) are handled by a client-side merge/dedup strategy in WorkoutLogger and the read-only session views.

---

## ADR-016: Score-Based Set Deduplication for Legacy Duplicate Records

**Date:** 2026-03-28
**Status:** Accepted
**Context:** Before ADR-015, the DB accumulated multiple WorkoutLog records for the same exercise in a session. The client-side dedup strategy needed to merge these without losing data.
**Decision:** For each group of duplicate WorkoutLog records (same exercise, same session), merge their sets by set number. For a given set number, keep whichever version has the most non-null fields (score = count of non-null fields). Applied identically in WorkoutLogger (editable), client session view (read-only), and trainer session view (read-only).
**Consequences:** No data loss from dedup. Works correctly even if the same set number appears in multiple logs with different data.

---

## ADR-017: Exercise Progress Modal in WorkoutLogger (Trainer Only)

**Date:** 2026-03-28
**Status:** Accepted
**Context:** Trainers need to quickly reference a client's historical performance for a specific exercise while logging the current session — without leaving the workout page.
**Decision:** Added a `TrendingUp` icon button to each exercise card in WorkoutLogger. Only rendered when `clientProfileId` prop is passed (trainer view). Tapping opens an in-page bottom-sheet modal that fetches from `GET /api/trainer/clients/[id]/exercise-progress?exerciseId=xxx` and renders an AreaChart with Latest / Best / Change stats.
**Consequences:** New optional prop `clientProfileId` on WorkoutLogger. New trainer API endpoint. The client read-only session view (`/client/session/[id]`) does not show this button as it doesn't pass `clientProfileId`.

---

## ADR-018: CROSSFIT_TRAINER as a Distinct UserRole

**Date:** 2026-04-04
**Status:** Accepted
**Context:** CrossFit module needs a trainer who can mark attendance but has no access to PT scheduling, workout logging, or other trainer features.
**Decision:** Add `CROSSFIT_TRAINER` as a new value in the `UserRole` enum, mirroring the `KICKBOXING_TRAINER` pattern. This keeps role-based access clean and explicit.
**Consequences:** Middleware and `hasRole()` checks throughout the codebase need to include `CROSSFIT_TRAINER` where `KICKBOXING_TRAINER` is included (e.g., admin user creation). Sidebar renders different nav for this role.

---

## ADR-019: CrossFit Community Feed Is Branch-Scoped

**Date:** 2026-04-04
**Status:** Accepted
**Context:** Phase 21 will add a community leaderboard and feed. Decision needed on whether community is per-branch (members see only their gym) or global (all branches see each other).
**Decision:** Community feed and leaderboard are branch-scoped. Members of Branch A cannot see posts or scores from Branch B. This matches the multi-tenant isolation model of the entire application.
**Consequences:** All `CommunityPost`, `CommunityReaction`, `CommunityComment` queries must be scoped to `branchId`. Leaderboard queries are also per-branch. No cross-branch data leakage.

---

## ADR-020: Auto-Post on Compound PR Is Opt-Out (Default On)

**Date:** 2026-04-04
**Status:** Accepted
**Context:** Phase 21 will auto-create community posts when a new compound lift PR is detected. Decision: opt-in (user must explicitly share) or opt-out (shared by default, user can hide).
**Decision:** Auto-post is opt-out — PRs are automatically shared to the community feed with `isAutoGenerated: true`. The trainer page shows a subtle banner "New PR detected — posted to community" with an option to remove the post. This maximises community engagement without friction.
**Consequences:** Need a delete/hide endpoint for auto-generated posts. Client profile settings should eventually include a "share PRs automatically" toggle (post-launch).

---

## ADR-021: shadcn Command Component for CrossFit Attendance Search

**Date:** 2026-04-04
**Status:** Accepted
**Context:** CrossFit trainer attendance page needs a searchable client picker. Options: add `react-select` npm package, or use shadcn's built-in `Command` component (Radix UI based).
**Decision:** Use shadcn `Command` component with `CommandInput` + `CommandList` for the attendance search combobox. This avoids a new npm dependency and is fully consistent with the existing shadcn/ui component system.
**Consequences:** No new dependency. The Command component already follows the project's Tailwind + dark/light theme setup. Search is triggered on each keystroke (debounced 300ms) via a client-side fetch to `/api/crossfit/clients/search?q=`.

---

## ADR-022: Multi-Shift Model Replaces Single Working-Hours Window

**Date:** 2026-04-23
**Status:** Accepted
**Context:** `TrainerProfile` had `workingHoursStart`, `workingHoursEnd`, `workingDays` — a single contiguous availability window per trainer per week. This didn't support trainers who work split shifts (e.g., morning 6–10 AND evening 17–21), or trainers whose shift times differ by day.
**Decision:** Introduce a `TrainerShift` model (`id, branchId, trainerProfileId, label, startTime, endTime, days: DayOfWeek[]`). A trainer can have multiple shifts. `workingHoursStart`/`workingHoursEnd` are deprecated (nulled by migration, kept nullable for one release cycle). `workingDays` is kept as a derived cache (union of all shift days), recomputed on every shift write via `recomputeWorkingDays()`.
**Zero-shift rule:** A trainer with no `TrainerShift` records is treated as all-day available on all days (backward compatibility). Services enforce this consistently in `isTimeWithinShifts()`.
**Predefined presets:** Morning (8 variants, 05:00–15:30 range) and Evening (8 variants, 15:30–23:00 range) presets surfaced in the UI. Custom shifts also supported.
**Admin pages:** `/admin/shifts` is the primary shift management surface (all trainers, all shifts). The trainer edit page (`/admin/trainers/[id]`) shows current shifts read-only and links to `/admin/shifts`. The new trainer page has an inline shift builder (shifts sent as part of `POST /api/admin/users`).
**Consequences:** Schedule creation, reassignment, availability-check, and availability-override services all use shift-based eligibility checks. The `availability-check` API smart mode and trainer mode both respect shift windows.

---

> **Note on ADR-023 → ADR-026 (reserved by Phase 24 plan):** These numbers are reserved for the
> per-package billing-cycle work outlined in `tasks/phase-24-billing-cycles.md`. Phase 24 was
> originally going to introduce `BillingCycleType` (CALENDAR_MONTH vs ANCHORED), an anchor-day
> clamp helper, idempotent cycle-end cron, and per-package carry-forward override. As of
> 2026-05-08, much of Phase 24's intent has been absorbed into Phase 25 by switching to
> per-package window accounting (ADR-029). The remaining Phase 24 work is the carry-forward
> processing cron and per-package carry-forward limit override, which will fill in 023–026
> when implemented.

---

## ADR-027: Branch-Scoped PT Package Plans Catalog

**Date:** 2026-05-08
**Status:** Accepted
**Context:** Admins were retyping `sessionsPerMonth` + `sessionCharge` for every new client mapping. Same combinations (e.g. 12 sessions / ₹4000 / monthly) recurred across many clients, causing typos and inconsistency. There was no central place to view, edit, or retire offered packages.
**Decision:** Introduce `PtPackagePlan` — a per-branch catalog of named plans (`name`, `sessionsPerMonth`, `pricePerCycle`, `sessionChargeAmount?`, `durationDays`, `description?`, `isActive`). Mapping carries an optional `planId` FK; selecting a plan in the mapping form auto-fills the relevant fields, but values stay editable per assignment. Plans cannot be hard-deleted — soft-deactivate via `isActive=false`, and `DELETE /api/admin/package-plans/[id]` returns 409 `PLAN_HAS_ACTIVE_ASSIGNMENTS` unless `?force=true` is passed (existing assignments keep their `planId` for historical reference).
**Consequences:** New admin page `/admin/settings/package-plans` for catalog management. Plan name uniqueness enforced per-branch (`@@unique([branchId, name])`). Mapping responses everywhere include `plan: { id, name } | null` so cards/chips can label assignments. Custom (no-plan) workflow preserved via `Custom (enter manually)` dropdown option.

---

## ADR-028: Plan Duration in Days for End-Date Auto-Derivation

**Date:** 2026-05-08
**Status:** Accepted
**Context:** When admin assigned a plan to a client (e.g. "Standard 3 — 90-day quarterly"), they still had to compute and enter the mapping's `endDate` manually. This was friction-heavy and error-prone for non-monthly plans.
**Decision:** Add `durationDays Int @default(30)` to `PtPackagePlan` (range 1–365). The mapping form auto-fills `endDate = startDate + durationDays` whenever a plan is selected. Recomputes if `startDate` is changed while a plan is selected. Admin can manually override the end date after auto-fill (override sticks until plan or start date changes again). UI surfaces preset chips (Monthly 30 / 60 / Quarterly 90 / 6 months 180 / Annual 365) plus a free number input.
**Consequences:** `durationDays` becomes the source of truth for "how long is one cycle." Combined with `sessionsPerMonth` it lets us compute `totalSessions` (see ADR-029). Edit-mode does not re-derive end date — start date isn't editable in the edit form, and historical `endDate` values are preserved unless admin explicitly changes the plan.

---

## ADR-029: Package-Window Session Accounting Replaces Calendar-Month Counting (Mapping Surfaces)

**Date:** 2026-05-08
**Status:** Accepted (supersedes parts of `tasks/phase-24-billing-cycles.md` regarding anchored cycles)
**Context:** Counting sessions by calendar month broke for any client whose membership cycle didn't align with calendar months — e.g. a 90-day plan starting Apr 23 spans portions of three calendar months, and the legacy "12 remaining this month" chip was meaningless. Phase 24 originally proposed a `BillingCycleType` enum + anchor-day helper to model recurring anchored cycles, but for our actual use case (one package = one finite window with `startDate` / `endDate`) that abstraction was overkill.
**Decision:** Treat each `PtPackage` as a single finite window. Add `totalSessions Int` to `PtPackage` as the authoritative count for the full window. New helper `getPackageWindowCounts(ptPackageId, branchId)` returns `{ totalSessions, used (= COMPLETED + NO_SHOW + onboardingUsedSessions across the window), upcoming (= SCHEDULED + IN_PROGRESS across the window), remaining (= max(0, total − used − upcoming)) }` plus `window: { start, end, totalDays, daysElapsed, daysRemaining }`. The scheduling modal binds to this helper via `GET /api/admin/mappings/[id]/window-counts`. `totalSessions` is auto-computed at create time as `sessionsPerMonth × round(durationDays / 30)` when a plan is selected; admin can override per assignment.
**Consequences:** "Remaining" is now package-wide, not month-wide — admins booking sessions for a 90-day plan see "30 remaining" instead of "12 remaining (this calendar month)". `sessionsPerMonth` survives as the rate label but is no longer authoritative. Other surfaces that still use calendar-month counters (`/api/client/dashboard`, `/api/trainer/clients`) are unaffected for now and will be migrated only if/when they need the package-window view; this ADR scopes the change to the scheduling/mapping surfaces. When Phase 24's recurring-cycle cron eventually lands, it will create new `PtPackage` rows for each cycle rollover rather than re-using the same row across multiple cycles — so the per-window model continues to apply.

---

## ADR-030: Onboarding Backfill as Integer Offset on PtPackage (Not Synthetic Session Rows)

**Date:** 2026-05-08
**Status:** Accepted
**Context:** Onboarding scenario: a client physically started months ago and has already used some sessions before the app went live. We need to record those used sessions so the remaining-sessions count is accurate, without polluting attendance, workout history, or trainer utilization analytics with fake events.
**Decision:** Add `onboardingUsedSessions Int @default(0)` and `onboardingNotes String?` to `PtPackage`. The integer counts toward `used` in `getPackageWindowCounts` but creates no `SessionInstance` rows. The mapping form exposes both fields under an "Onboarding adjustment" group on create and edit. Audit log captures every change to these fields (set/edit/clear) via the existing `PT_PACKAGE_UPDATED` audit action with old/new values.
**Consequences:** No data-pollution side effects on attendance, no-show rates, or workout reports. The offset is per-package and does not auto-clear at cycle end (Phase 24's cron, when it lands, will optionally clear it on rollover). Admin can edit at any time. The amber "Onboarding adjustment" group label on the mapping form keeps the offset visible so it's not forgotten. Once a future cycle starts (by creating a new `PtPackage`), it will not inherit the previous package's onboarding offset.

---

## ADR-031: Rest Timer in Postgres, Not Redis (Recovers from Earlier Redis Choice)

**Date:** 2026-05-10
**Status:** Accepted (supersedes the brief Phase 1 decision to use Upstash Redis for the rest timer)
**Context:** The trainer's rest timer started life as an in-process `Map` in a Next.js route handler, which broke under any restart or multi-instance deploy. The fix initially shipped used Upstash Redis with a 2h TTL key per session. After deploying, two issues surfaced: (a) the rest timer must be visible to the **client** as well as the trainer (PT clients log in on their own device during a session and want to see "01:54 remaining" too), which makes it shared state — fine on Redis, but the keepalive + GET-prev-before-PUT pattern was projected to consume ~390K Upstash commands/month at 50 PT clients/day, leaving zero free-tier headroom for growth; (b) Postgres (Neon) is already paid for, the data is small (one row per active session), and a periodic cleanup of `WHERE updatedAt < now() - 1 day` solves the lack of native TTL.
**Decision:** Store the rest timer in Postgres as a dedicated `RestTimer` model keyed by `sessionInstanceId` (1:1 with `SessionInstance`, `onDelete: Cascade`). Wire format on the API stays the same (ms-since-epoch numbers) so the existing `useRestTimer` hook is unchanged. Pusher (`REST_TIMER_UPDATED` event on `session-{id}`) keeps cross-device sync between trainer and client without polling. Auth: any actor with `assertSessionAccess` (trainer or client of the session, branch-scoped) can read **and** mutate — keeps current UX where the client can also tap Stop on their own pill.
**Consequences:** Zero recurring cost for rest timer storage. Free Phase-4 analytics path: a future `RestEvent` log table can be added alongside without disturbing the live-state row. Lose the auto-eviction TTL Redis gave us, replaced with a daily cleanup job (or query-time filter). Slightly higher per-write latency (~10ms Postgres vs ~5ms Upstash REST) — irrelevant for the tap-Start UX. Removes Redis as a dependency entirely; `@upstash/redis` uninstalled, `UPSTASH_*` env vars removed.

---

## ADR-032: Admin TV Leaderboard Dashboard — Device Bearer Auth + Opt-In Display + Branch-Scoped Pusher

**Date:** 2026-05-11
**Status:** Accepted
**Context:** Gym wants a wall-mounted TV that rotates motivational panels — top lifters this month, attendance streaks, badges unlocked, latest PRs, live "now training" status — to differentiate from neighbouring gyms. The TV is unattended, mounted high (so text must be large), and shows the same client data the app already collects. Three design questions had to be resolved together before any code: (a) how does an unattended device authenticate without a username/password, (b) what's the consent posture for displaying a member's name/photo/PR on a public wall, and (c) how do we celebrate fresh PRs in real time without rewiring the existing `session-{id}` / `user-{id}` Pusher channels.

**Decision:**

- **New role + new auth surface.** Add `TV_DISPLAY` to `UserRole`. The TV authenticates with a long-lived bearer token from a new `TvDevice` row keyed to a branch (registered by `BRANCH_ADMIN`). Tokens are stored as bcrypt hashes; plaintext is returned exactly once on creation. The role has read-only access to `/api/admin/tv/*` and is branch-scoped — it cannot read any other admin surface, can never see PII for opted-out clients, and never mutates. This pattern lets us tighten the role's data access independently of the BRANCH_ADMIN persona.
- **Opt-in display.** Add `ClientProfile.showOnTv Boolean @default(false)`. Clients with `showOnTv=false` are excluded from name/photo panels and live PR/badge takeovers, but still count toward anonymous aggregates (total volume, attendance counts). Default-off is the conservative choice — putting someone's name and weight loss on a public TV without consent is exactly the kind of thing that erodes trust, and the marginal cost of a one-tap opt-in is low. Client-facing toggle lives at `PUT /api/client/profile/tv-opt-in`.
- **Branch-scoped Pusher channel.** New channel `branch-{branchId}` carries five events: `PR_ACHIEVED`, `BADGE_UNLOCKED`, `SESSION_STARTED_TV`, `TV_PIN_CHANGED`, `TV_SHOUTOUT`. `PR_ACHIEVED` triggers a 10-second full-screen confetti takeover and is **only** fired for compound-PR detections (squat / bench / deadlift / OHP, matching the existing `Exercise.isCompound` flag) — not every badge unlock, because frequent takeovers fatigue viewers. Existing `session-{id}` / `user-{id}` channels are untouched.
- **Admin pin / shoutout from phone.** New `TvControlState` singleton per branch. Admin hits `POST /api/admin/tv-control` from `/admin/tv-control` on their phone to freeze the rotation on one panel (`pinnedPanel`) or push a transient banner (`shoutout` with `shoutoutExpiresAt`). Pusher broadcasts the change to the TV so it reacts within a couple of seconds.
- **Strict calendar month window.** All month-scoped aggregates use the calendar month (Asia/Kolkata). A trailing-30d fallback for day-1 (when month-counts are sparse) is explicitly punted to v2.
- **Server-side caching.** `GET /api/admin/tv/dashboard` is 60s-cached per branch; `GET /api/admin/tv/live` is 10s-cached. TVs hit the dashboard once a minute and rely on Pusher for fresh PR events between refreshes.
- **15-second panel rotation, gendered lift / volume panels.** Per operator preference: enough time to read at 10ft. Lift and volume leaderboards return `{ male: [...], female: [...] }` shaped payloads; streaks / attendance / live-now panels stay flat (unisex metrics).

**Consequences:**

- Three new audit actions registered: `TV_DEVICE_REGISTERED` / `TV_DEVICE_REVOKED`, `TV_PIN_SET`, `TV_SHOUTOUT_BROADCAST`, plus `CLIENT_TV_OPT_IN_TOGGLED` for the client toggle.
- All existing role checks in services and middleware must include `TV_DISPLAY` in their negative lists (it can NEVER appear in a write path) and in the positive list for the new `/api/admin/tv/*` read paths.
- `workout.service` and `badge.service` gain a one-line hook to fire the new Pusher events when the actor has `showOnTv=true`. Hooks are best-effort (try/catch with log) — never block the underlying write on Pusher failure.
- Token storage as bcrypt means we cannot show the token after creation; ops needs to record it during device pairing or revoke and re-issue.
- v2 panels (body transformations, class champions, hardest workers, exercise milestones, new members, praise board) are deliberately out of scope for this phase; the dashboard payload shape leaves room to add them without contract breaks.
- Future option: a `TvDevice.allowedPanels String[]` field could let different TVs in the same branch show different subsets — not built now, but the schema accommodates it as a low-friction addition.

---

## ADR-033: TV Display Uses Polling, Not Pusher (Supersedes the Pusher Transport Decision in ADR-032)

**Date:** 2026-05-12
**Status:** Accepted (supersedes the Pusher-transport parts of ADR-032; the auth, role, opt-in, and pin/shoutout decisions in ADR-032 stand unchanged)

**Context:** ADR-032 specified a new `branch-{branchId}` Pusher channel as the transport for fresh PR celebrations, badge unlocks, live-now updates, and admin pin/shoutout broadcasts to the gym TV. The motivation was "instant" UI updates. After building it end-to-end, the picture changed: the TV is an unattended, wall-mounted display with no user input. A 5–10 second lag between a workout being logged and the confetti firing is not visible to anyone — by the time someone looks up at the TV, polling will have caught the event. Pusher was buying us "instant" rather than "≤10s" at the cost of: an additional always-on service dependency, env-var sprawl, a silent-failure mode (a dropped Pusher connection looks identical to "no PRs happening"), and operational complexity for what is fundamentally a one-way display.

**Decision:** Remove the `branch-{branchId}` Pusher channel and all its event types (`PR_ACHIEVED`, `BADGE_UNLOCKED`, `SESSION_STARTED_TV`, `TV_PIN_CHANGED`, `TV_SHOUTOUT`). The TV display fetches everything via two HTTP polls:

- `GET /api/admin/tv/dashboard` every **60s** — the heavy aggregates (compound leaderboards, volume kings, streaks, badges this month, perfect attendance).
- `GET /api/admin/tv/live` every **10s** — `liveNow` sessions, `latestPRs` (last 7 days), AND the current `control` block (`pinnedPanel`, `shoutout`). The `control` block was moved into this faster cadence so pin/shoutout reactions feel responsive (≤10s) without speeding the heavy dashboard call.

Confetti detection: the TV client keeps a `lastSeenPrAt` watermark (ref, not state). On the first successful payload it sets the watermark to the newest existing PR's `achievedAt`, suppressing replay. On subsequent payloads, any PR with `achievedAt > watermark` is queued for a 10-second full-screen takeover (oldest first if multiple) and the watermark advances. Both `/dashboard` and `/live` feed the same diff function — they can return the same PR and the watermark check de-dupes.

Removed code: `triggerBranchEvent` and its payload types from `src/lib/pusher.ts`; the hook in `workout.service.ts` after compound-PR detection; the hook in `badge.service.ts` `awardBadge`; the `SESSION_STARTED_TV` fire in `session.service.ts` `startSession`; the Pusher fanout in `tv-control.service.ts` `updateTvControlState`. Pusher dependencies for trainer/client real-time (`session-{id}` rest timer + pause, `user-{id}` notifications) are untouched.

**Consequences:**

- Confetti, pin reactions, and shoutout banner all lag up to **10 seconds** behind the underlying event. Live-now session count lags up to 10s. Badge feed and other heavy panels lag up to 60s. All acceptable for a wall display.
- Removes a class of silent failures. If a poll fails, the next poll in 10s retries; the TV self-heals. Pusher would have shown a stale screen until manually reset.
- One fewer thing to provision for new deployments — TVs work as long as the device can reach the dashboard host. No new Pusher app, no new env vars, no NEXT_PUBLIC_PUSHER_KEY needed on the TV side.
- Bandwidth cost increases mildly: one extra `/live` call every 10s per TV. The payload is ~5KB, so 30KB/min/TV — negligible.
- The TV display's load on Pusher is now zero. The existing Pusher quota is reserved entirely for trainer/client session sync, which genuinely needs sub-second updates and won't be diluted by branch-wide fanout.
- ADR-032's other decisions (`TV_DISPLAY` role, `TvDevice` bearer auth, `ClientProfile.showOnTv` opt-in, gendered leaderboards, 15s rotation, admin pin from phone, strict-month window) all stand unchanged. Only the transport layer flipped.
- The `branch-{branchId}` channel name is now retired and should not be reused for unrelated purposes — naming consistency for any future broadcast feature is better than recycling.

---

## ADR-034: Cloudinary for Profile Image Storage with Face-Aware Crop Baked Into Stored URL

**Date:** 2026-05-13
**Status:** Accepted

**Context:** The TV leaderboard renders `User.profileImageUrl` directly via `<img>` tags in `TvPanel` (medal pips, volume rows, PR feed, etc.). Until now that field has been a free-text column with no upload mechanism — values were either null or seeded externally. We needed a real upload pipeline reachable by both admins (managing client records) and clients themselves (settings page). Constraints: small gym, a few dozen images per branch; TV display benefits from face-centered crops since heads get cut off when an off-center photo lands in a circular medal pip; storing image bytes in Postgres (bytea) bloats the DB and gives us no CDN.

**Decision:**

- **Storage:** Cloudinary, configured with `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET`. Uploads go into `sector7/profile-images/{branchId}/{userId}` with `overwrite: true`, so re-uploads replace the same asset (no Cloudinary asset cleanup needed on update). Cost: free tier covers many years of this workload.
- **Upload transport:** server-side multipart upload via API routes (`POST /api/admin/users/[id]/profile-image`, `POST /api/client/profile/image`). The browser sends `multipart/form-data` with a single `file` field to our Next.js route, the route streams the buffer to Cloudinary using the SDK and the secret. Rejected: client-side signed uploads — more moving parts (signature endpoint, CORS, browser-direct-to-third-party) for negligible bandwidth savings at our scale.
- **Stored URL form:** the value persisted into `User.profileImageUrl` is a Cloudinary delivery URL with face-aware crop baked in: `c_fill,g_face,w_400,h_400,f_auto,q_auto`. Consumers (TV panels, community feed, admin lists, client avatars) render the URL directly. They do not call back into Cloudinary for transforms, and they do not need to know which provider is behind the URL.
- **Validation at edge:** mime type ∈ {`image/jpeg`, `image/png`, `image/webp`}; size ≤ 5 MB. Both checked in the service layer before the Cloudinary call.
- **Auth surfaces, dual entry points:** admin endpoint is `BRANCH_ADMIN | SUPER_ADMIN`, branch-scoped to caller. Client endpoint is `CLIENT` only, always scoped to caller's own row — clients cannot upload for other users. The TV opt-in (`ClientProfile.showOnTv`) remains a separate, independent toggle: uploading a photo does not auto-opt-in to the TV; opting in without a photo just falls back to initials. Decoupling is intentional — uploading a photo is broadly useful (community feed, avatars), TV visibility is a separate consent.
- **Deletion semantics:** `DELETE` clears `User.profileImageUrl` to `null` but leaves the Cloudinary asset orphaned. Reasoning: assets are tiny (KBs), `overwrite: true` means re-uploads reclaim the slot, and Cloudinary's free tier is generous. Revisit if storage telemetry shows actual pressure.

**Consequences:**

- New runtime dependency on Cloudinary. Missing env vars surface as `CLOUDINARY_NOT_CONFIGURED` (500) with a clear message, not a silent fail.
- Two new audit actions: `USER_PROFILE_IMAGE_UPDATED`, `USER_PROFILE_IMAGE_REMOVED`. Audit captures old/new URL — useful for "who replaced this photo?".
- `User.profileImageUrl` semantics tightened: it is now a Cloudinary delivery URL with transforms baked in. Anything seeded outside Cloudinary will still work (it's just a string), but pages rendering at face-centered medal-pip sizes will look better when the value comes from this pipeline.
- Trainer photos use the same plumbing if a future task wires the admin trainer page through the same uploader and same `/api/admin/users/[id]/profile-image` endpoint — no new infrastructure needed.
- Optional follow-ups (not built now): (a) crop/zoom UI in the browser before upload; (b) explicit asset deletion on remove; (c) signed upload presets for client-direct-to-Cloudinary; (d) image moderation hook. All of these would slot in without breaking the stored-URL contract.

---

## ADR-035: TV Pin Is a Panel Subset, Not a Single Panel (Supersedes the Single-Pin Part of ADR-032)

**Date:** 2026-05-14
**Status:** Accepted (supersedes the single-`pinnedPanel` decision in ADR-032; everything else in ADR-032/033 stands)

**Context:** ADR-032 gave the admin a single-panel pin — `TvControlState.pinnedPanel String?`, where non-null froze the TV rotation on exactly one panel and null meant auto-rotate everything. In practice operators wanted to show a _handful_ of panels (e.g. the three compound lifts during a meet, skipping events/PRs) without freezing on just one. The single-pin model couldn't express "rotate through this subset."

**Decision:** Replace `pinnedPanel String?` with `pinnedPanels String[]` on `TvControlState`. Semantics:

- **`[]` (empty)** — auto-rotate through the full deck (leaderboards + latest PRs + events + announcement slides). Same as the old `null`.
- **One entry** — TV shows only that panel; rotation has nothing to advance to, so it is effectively frozen. Subsumes the old single-pin behavior.
- **Multiple entries** — TV rotates through only those panels, 15s each, in deck order.

The TV (`TvDashboard`) computes an `activeDeck` = the full deck filtered to the pinned subset (or the full deck when the subset is empty). Safety valve: if the pinned set matches _nothing_ currently in the deck (e.g. all pinned panels are hidden, like `events` with zero upcoming events), it falls back to the full deck so the screen never goes blank. Announcement slides are excluded from a non-empty pinned subset — pinning is about the fixed panels, announcements are their own opt-in deck.

Admin UI (`/admin/tv-control`) becomes a multi-select: each panel button toggles membership, a "Clear" button empties the set, and the banner reads "Rotating N: …" instead of "Currently pinned: …".

**Migration:** `20260514100000_tv_control_multi_pin` adds `pinnedPanels TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]`, backfills it from the old `pinnedPanel` (one-element array where it was set), then drops `pinnedPanel`. Applied to local Docker first, then Neon.

**Consequences:**

- `TV_PIN_SET` audit rows now carry `pinnedPanels` arrays in old/new value instead of a single string.
- `updateTvControlState` compares pin sets order-insensitively (`samePanels`) so re-saving the same subset in a different order doesn't emit a spurious audit row.
- API contract: `POST /api/admin/tv-control` takes `pinnedPanels?: string[]`; the `control` block in `TvLivePayload` / `TvDashboardPayload` carries `pinnedPanels: string[]`.
- The `TV_PIN_SET` audit action name is unchanged — it still describes the same intent, just with richer payload.
- ADR-032's auth/role/opt-in/gendered-leaderboard decisions and ADR-033's polling transport are untouched.
