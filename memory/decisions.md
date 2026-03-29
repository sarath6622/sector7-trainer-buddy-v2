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
