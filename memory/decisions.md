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
