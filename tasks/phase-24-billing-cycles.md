# Phase 24 — Per-Package Billing Cycles & Onboarding Adjustments

**Drafted:** 2026-05-08
**Driver:** Onboarding existing gym clients whose billing cycles do not align with calendar months.
**Status:** Plan — awaiting `@architect` to start on S7-BC-01.

---

## Problem

Today every counter (client dashboard, admin consumption summary, month-end carry-forward) keys off **calendar months**. This breaks two real scenarios:

1. **Mid-month joiner.** Client joined Apr 15; their gym membership cycle runs Apr 15 → May 14, not Apr 1 → Apr 30. Today the system over-counts by splitting their first cycle across two calendar buckets.
2. **App onboarding.** Client started physically on Apr 15 and has already used 6 sessions before the app went live. There is no way to record those used sessions without faking `SessionInstance` rows, which would corrupt attendance, workout history, and analytics.

## Solution shape

Two orthogonal additions on `PtPackage`:

- **Anchored billing cycle** (replaces calendar-month assumption per package).
- **Onboarding offset** (one-shot integer that auto-clears once its cycle ends).

Plus: a single pure cycle helper, a daily idempotent cron that processes cycle ends per package, and audit coverage on every onboarding-offset write/auto-clear.

## Tradeoff resolutions (recap)

1. **Cycle-end processing** → daily idempotent cron over all active packages, guarded by `lastProcessedCycleStart`. Re-runs are no-ops; failures self-heal.
2. **Anchor day 29/30/31 + Feb** → clamp rule `cycleStart = min(anchorDay, daysInMonth)`. Anchor is preserved (never drifts). Locked down with a unit test matrix.
3. **Onboarding offset visibility** → loud banner while active, auto-clears on cycle rollover, every set/edit/clear audited.

---

## Schema changes (`prisma/schema.prisma`)

### New enum

```prisma
enum BillingCycleType {
  CALENDAR_MONTH   // Cycle = calendar month (existing behavior, default)
  ANCHORED         // Cycle = anchor-day → day before next anchor
}
```

### `PtPackage` additions

```prisma
model PtPackage {
  // ... existing fields ...

  // ─── Billing cycle (Phase 24) ───
  billingCycleType         BillingCycleType @default(CALENDAR_MONTH)
  billingAnchorDay         Int?             // 1–31; required when billingCycleType=ANCHORED
  lastProcessedCycleStart  DateTime?        // bookkeeping for the cycle-end cron

  // ─── Onboarding offset (Phase 24) ───
  onboardingUsedSessions   Int              @default(0)
  onboardingCycleStart     DateTime?        // cycle-start that the offset belongs to (null when offset=0)
  onboardingNotes          String?

  // ─── Per-package carry-forward override (Phase 24) ───
  carryForwardLimit        Int?             // null = inherit branch default
}
```

**Backward compatibility:** existing rows default to `CALENDAR_MONTH` + offset 0. Behavior unchanged for all current data.

### Migration

- Name: `20260508100000_add_billing_cycles_and_onboarding`
- **Local Docker first**, then Neon (per project rule 0).
- Includes: enum creation, `ALTER TABLE pt_packages ADD COLUMN ...` for the six new columns, no backfill required.

---

## Cycle helper (new module)

**File:** `src/lib/billing-cycle.ts` (pure functions, no I/O — testable in isolation).

```typescript
export interface BillingCycle {
  start: Date; // 00:00 local on cycle start day
  end: Date; // 23:59:59.999 local on cycle end day (inclusive)
  label: string; // "Apr 15 – May 14, 2026" or "April 2026"
}

export interface CycleConfig {
  type: 'CALENDAR_MONTH' | 'ANCHORED';
  anchorDay?: number | null; // 1–31
}

// Cycle that contains `refDate`.
export function getCycleForDate(cfg: CycleConfig, refDate: Date): BillingCycle;

// Cycle immediately before `cycle`.
export function previousCycle(cfg: CycleConfig, cycle: BillingCycle): BillingCycle;

// Cycle immediately after `cycle`.
export function nextCycle(cfg: CycleConfig, cycle: BillingCycle): BillingCycle;
```

### CYCLE BOUNDARY RULE (document at top of file)

> For `ANCHORED` cycles: `cycleStart = min(anchorDay, daysInMonth)`. Cycle ends at 23:59:59.999 the day before the next cycle's start. The anchor day never drifts — it is restored as soon as a month has it (e.g. anchor 31: Feb 28 → Mar 30, then Mar 31 → Apr 29).

### Test matrix (`tests/unit/billing-cycle.test.ts`)

Anchor ∈ {1, 15, 28, 29, 30, 31} crossed with refDate spanning:

- Calendar-month case (`type: CALENDAR_MONTH`, anchor ignored).
- Same-month containment (refDate = anchor + 5 days).
- Boundary day exactly (refDate = cycleStart 00:00).
- Last-day-of-cycle (refDate = cycleEnd 23:59).
- Feb in a non-leap year (anchor 29/30/31).
- Feb in a leap year (anchor 29/30/31).
- `previousCycle` and `nextCycle` round-trip identity for all of the above.

Target: ~25 assertions. No DB. Runs in <100ms.

---

## Service layer changes

### `session.service.ts` — `getSessionCounts`

Currently takes `month: string`. New shape:

```typescript
interface SessionCountInput {
  clientProfileId: string;
  branchId: string;
  cycle?: BillingCycle; // if omitted, derive from active PtPackage + today
}
```

Body changes:

1. If `cycle` not passed, fetch active `PtPackage` for client → call `getCycleForDate(cfgFromPkg, new Date())`.
2. Replace `getMonthRange(month)` with `cycle.start` / `cycle.end`.
3. After counting, if `pkg.onboardingCycleStart` equals `cycle.start`, add `pkg.onboardingUsedSessions` to `used`.
4. Return shape unchanged plus `cycle: { start, end, label }`.

**Callers to update** (search for `getSessionCounts`):

- `src/app/api/client/dashboard/route.ts`
- `src/app/(dashboard)/admin/scheduling/page.tsx` flow (via API route `getPackageInfo`)
- `src/app/api/trainer/clients/route.ts`

For paths that need historical counts ("this month"), pass an explicit cycle. For "current cycle" callers, omit `cycle` and let the service derive.

### `carryforward.service.ts` — rename + retarget

- `processMonthEnd(branchId, month, actorId)` → `processCycleEndsForPackages(branchId?, actorId)`. Returns the same shape.
- New behavior: iterate all active `PtPackage` (optionally filtered by branch), and for each:
  - `prev = previousCycle(cfgFromPkg, getCycleForDate(cfgFromPkg, today))`
  - `effectiveLimit = pkg.carryForwardLimit ?? branchSettings.carryForwardLimit ?? 3`
  - If `prev.end < now AND pkg.lastProcessedCycleStart != prev.start`, run the existing carry-forward logic against `prev` using `effectiveLimit`, then auto-clear onboarding offset if `pkg.onboardingCycleStart <= prev.start`, then set `pkg.lastProcessedCycleStart = prev.start`.
- `getConsumptionSummary(branchId, ?cycleRef)` — same swap; if `cycleRef` not passed, return current cycle for each package.
- Existing `ALREADY_PROCESSED` 409 path is removed (`lastProcessedCycleStart` makes re-runs naturally idempotent).

### `pt-package.service.ts` — extended writes

`createPtPackage` and `updatePtPackage` accept:

- `billingCycleType?: 'CALENDAR_MONTH' | 'ANCHORED'`
- `billingAnchorDay?: number | null` (validator enforces required when type = ANCHORED, range 1–31)
- `onboardingUsedSessions?: number` (≥ 0)
- `onboardingCycleStart?: string | null`
- `onboardingNotes?: string | null`
- `carryForwardLimit?: number | null` (≥ 0; null = inherit branch default)

Audit actions:

- `ONBOARDING_OFFSET_SET` — when offset transitions 0 → N
- `ONBOARDING_OFFSET_EDITED` — when N → M (both non-zero)
- `ONBOARDING_OFFSET_CLEARED` — when N → 0; metadata `{ trigger: 'manual' | 'auto-cycle-rollover' }`

`metadata` on every audit entry includes `cycleStart`, `cycleEnd`, `anchorDay`, `cycleType`.

---

## Cron job

**File:** `src/app/api/cron/process-cycles/route.ts`

```
POST /api/cron/process-cycles
Header: Authorization: Bearer ${CRON_SECRET}
Body: {} (or { branchId } for targeted runs)
Returns: { processed: number, packagesAdvanced: number, errors: [] }
```

- Auth: bearer token from `process.env.CRON_SECRET`. Reject otherwise (401).
- Calls `processCycleEndsForPackages()` from carryforward service.
- Vercel cron config in `vercel.json`:
  ```json
  { "crons": [{ "path": "/api/cron/process-cycles", "schedule": "0 20 * * *" }] }
  ```
  (20:00 UTC = 01:30 IST nightly.)
- Manual admin trigger: keep the existing "Process now" admin button wired to a per-branch call of the same endpoint (or a dedicated `/api/admin/cycles/process` route).

---

## API contract changes (`memory/api-contracts.md`)

### Modified

```
POST /api/admin/mappings    body: { ..., billingCycleType?, billingAnchorDay?,
                                    onboardingUsedSessions?, onboardingCycleStart?,
                                    onboardingNotes? }
PUT  /api/admin/mappings/[id]   same additional fields, all optional
GET  /api/client/dashboard  → response now includes `sessionCount.cycle: { start, end, label }`
```

### New

```
POST /api/cron/process-cycles    (internal, secret-auth)
POST /api/admin/cycles/process   { branchId? } → { processed, packagesAdvanced }   (admin manual trigger)
```

---

## UI changes

### `src/app/(dashboard)/admin/clients/[id]/page.tsx` — Trainer Mappings section

**1. Add to "Assign Trainer" form and "Edit" form:**

- Radio: **Billing cycle**
  - `Calendar month` (default)
  - `Anchored to a day` → reveals number input for anchor day (1–31, default = `startDate.getDate()`)
- Collapsible "Onboarding adjustment" group (only visible when creating/editing):
  - Number input: "Sessions already completed this cycle" (default 0)
  - Helper text: _"Use only when onboarding clients who started before the app went live. Auto-clears after the cycle ends."_
  - Optional textarea: notes (e.g. "Client confirmed 6 sessions Apr 15–28, signed off by manager.")
- Number input: **Carry-forward limit (override)** — placeholder shows the branch default; leaving empty = inherit. Helper text: _"Maximum unused sessions that roll into next cycle for this client. Leave blank to use the branch default."_

**2. On the package card (when offset > 0):**

Render a banner above the existing card body:

```
⚠ Onboarding adjustment active
   6 sessions counted as already used for cycle Apr 15 – May 14, 2026
   [Edit] [Clear]
```

**3. Cycle label on the package card:**

Replace the bare "12 sessions/mo" line with cycle-aware wording:

- Calendar mode: `12 sessions/cycle (calendar month)`
- Anchored mode: `12 sessions/cycle (15th → 14th)`

### Reusable across other surfaces

Both the trainer client list (`/api/trainer/clients`) and the client dashboard show "X used of Y this month". Both should switch to "this cycle" using the cycle label returned from `getSessionCounts`. No new components — just label changes and binding to the new `cycle` field on the response.

---

## Memory file updates

- `memory/schema.md` — append a "Phase 24 Schema Additions (2026-05-08)" section documenting the enum + 5 new columns, in the same style as Phase 22/23.
- `memory/api-contracts.md` — patch mappings routes, add `/api/cron/process-cycles` and `/api/admin/cycles/process`.
- `memory/decisions.md` — new ADRs:
  - **ADR-023:** Per-Package Billing Cycles (anchor-day model, clamp rule).
  - **ADR-024:** Onboarding Adjustment as Offset, Not Synthetic Sessions.
  - **ADR-025:** Cycle-End Processing via Idempotent Daily Cron.
  - **ADR-026:** Per-Package Carry-Forward Override (falls back to branch default).
- `memory/architecture.md` — new "Secrets & Cron" section documenting `CRON_SECRET`:
  - **Format:** ≥ 32-char random hex (`openssl rand -hex 32`).
  - **Storage:** Vercel Environment Variables (Production + Preview), `.env.local` for dev.
  - **Rotation:** quarterly cadence, or immediately on suspected exposure. Procedure: generate new secret → update Vercel env → redeploy → update local `.env.local`. No grace-period dual-secret support (cron caller is single-tenant).
  - **Verification path:** `Authorization: Bearer ${CRON_SECRET}` checked at the top of every `/api/cron/*` route; mismatch returns 401 with no body.

---

## Task list

| ID       | Owner      | Size | Description                                                                                                                                                                                                                                                                                                                                                                 |
| -------- | ---------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S7-BC-01 | @architect | M    | Add `BillingCycleType` enum + 6 columns to `PtPackage` in `schema.prisma` (`billingCycleType`, `billingAnchorDay`, `lastProcessedCycleStart`, `onboardingUsedSessions`, `onboardingCycleStart`, `onboardingNotes`, `carryForwardLimit`). Run migration `20260508100000_add_billing_cycles_and_onboarding` against local Docker, then Neon. Regenerate Prisma client.        |
| S7-BC-02 | @architect | S    | Extend Zod validators (`createMappingSchema`, `updateMappingSchema`) with the new fields incl. `carryForwardLimit`. Refine: `billingCycleType=ANCHORED` requires `billingAnchorDay` 1–31. Add `BillingCycle` type to `src/types/domain.ts`.                                                                                                                                 |
| S7-BC-03 | @architect | M    | Implement `src/lib/billing-cycle.ts` — pure helpers `getCycleForDate`, `previousCycle`, `nextCycle`. Comment with the CYCLE BOUNDARY RULE.                                                                                                                                                                                                                                  |
| S7-BC-04 | @qa        | M    | Unit tests for `billing-cycle.ts` — full anchor × refDate matrix incl. Feb leap/non-leap. ~25 assertions.                                                                                                                                                                                                                                                                   |
| S7-BC-05 | @backend   | L    | Refactor `getSessionCounts` (session.service.ts) to take optional `cycle` and apply onboarding offset when cycle matches. Update return shape (add `cycle`).                                                                                                                                                                                                                |
| S7-BC-06 | @backend   | L    | Refactor `carryforward.service.ts`: rename → `processCycleEndsForPackages`, iterate per-package, idempotency via `lastProcessedCycleStart`, per-package `carryForwardLimit ?? branchSettings.carryForwardLimit`, auto-clear onboarding offset on rollover, audit `ONBOARDING_OFFSET_CLEARED` with `trigger: auto-cycle-rollover`. Update `getConsumptionSummary` similarly. |
| S7-BC-07 | @backend   | M    | Extend `pt-package.service.ts` write paths to accept billing cycle + onboarding fields. Audit `ONBOARDING_OFFSET_SET / EDITED / CLEARED (manual)`.                                                                                                                                                                                                                          |
| S7-BC-08 | @backend   | S    | Update callers of `getSessionCounts`: `/api/client/dashboard`, `/api/trainer/clients`, scheduling page's package-info endpoint. Surface `cycle.label` to UI.                                                                                                                                                                                                                |
| S7-BC-09 | @backend   | M    | Create `/api/cron/process-cycles` route with bearer-token auth + `/api/admin/cycles/process` for manual admin trigger.                                                                                                                                                                                                                                                      |
| S7-BC-10 | @devops    | S    | Add Vercel cron config (`vercel.json`) for `/api/cron/process-cycles` at 20:00 UTC daily. Add `CRON_SECRET` to `.env.example`.                                                                                                                                                                                                                                              |
| S7-BC-11 | @ui        | L    | Admin client page mapping form: billing cycle radio + anchor-day input + onboarding adjustment fields + carry-forward limit override (create + edit forms). Validation surfacing.                                                                                                                                                                                           |
| S7-BC-12 | @ui        | M    | Active mapping card: onboarding offset banner with Edit / Clear, cycle-aware label.                                                                                                                                                                                                                                                                                         |
| S7-BC-13 | @ui        | S    | Client dashboard + trainer client list: bind to `cycle.label` instead of hard-coded "this month".                                                                                                                                                                                                                                                                           |
| S7-BC-14 | @qa        | L    | Integration tests: mid-month joiner cycle math; onboarding offset applied this cycle, ignored next; cron idempotency (run twice → same outcome); manual admin process; auto-clear audit.                                                                                                                                                                                    |
| S7-BC-15 | @architect | S    | Update `memory/schema.md`, `memory/api-contracts.md`, add ADR-023/024/025/026 to `memory/decisions.md`, add "Secrets & Cron" section to `memory/architecture.md`.                                                                                                                                                                                                           |

**Total estimate:** ~5 large + 6 medium + 4 small ≈ 50–60 hours of focused work.

---

## Order of operations (recommended)

1. **S7-BC-01 → S7-BC-04** ship together as one PR (schema + helper + tests). No behavior change yet — safe to land immediately.
2. **S7-BC-05 → S7-BC-08** as the second PR (service refactor + caller updates). Existing CALENDAR_MONTH packages behave identically; new ANCHORED packages now compute correctly.
3. **S7-BC-09 → S7-BC-10** third PR (cron). Replaces the existing month-end button wiring.
4. **S7-BC-11 → S7-BC-13** fourth PR (UI surface).
5. **S7-BC-14 → S7-BC-15** final PR (tests + memory).

Each PR ships independently, no breaking changes, easy to revert.

---

## Resolved decisions (2026-05-08)

1. **Default for new mappings:** `CALENDAR_MONTH`. Admin must explicitly opt in to anchored cycles.
2. **Carry-forward limit:** **per-package** with branch-default fallback. New column `carryForwardLimit Int?` on `PtPackage`; `null` = inherit `BranchSettings.carryForwardLimit`. Documented as ADR-026.
3. **Cron secret:** no existing convention. Establishing one as part of S7-BC-15 — see "Secrets & Cron" addition to `memory/architecture.md` in the Memory file updates section above.

## Related work — Phase 25 (PT Package Plans)

Phase 25 introduces a per-branch catalog of named package plans (e.g. "Standard 12 — ₹4000") that admins pick from a dropdown in the mapping form, instead of typing `sessionsPerMonth` + `sessionCharge` every time. **Phase 25 is not a hard prerequisite for Phase 24** — they're independent — but landing Phase 25 first means the mapping form in S7-BC-11 is built once with the dropdown integrated. See [phase-25-package-plans.md](./phase-25-package-plans.md).
