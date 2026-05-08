# Phase 25 — PT Package Plans (Catalog)

**Drafted:** 2026-05-08
**Driver:** Admin types `sessionsPerMonth` + `sessionCharge` from scratch every time a trainer is assigned to a client. Same combinations get repeated for many clients. Errors creep in (typos, mismatched prices, inconsistency across the gym).
**Status:** Plan — independent of Phase 24, can ship before, after, or in parallel.

---

## Problem

The current mapping form on the admin client page asks for raw numbers:

> Sessions/Month: `[12]` Session Charge: `[400]` Start Date: `[…]`

In practice the gym sells a small fixed set of plans — e.g. "Standard 12", "Premium 20", "Trial Pack 8". Admin retypes the same values every time. There's no central place to see "what plans do we offer?", to change a price across the catalog, or to retire an old plan.

## Solution

A small **catalog of branch-scoped, named plans**. Admin defines plans once on a settings page; the mapping form gets a dropdown that auto-fills `sessionsPerMonth` + `sessionCharge` from the selected plan. Values remain editable (override per client), and a "Custom" option preserves the existing freeform flow for one-offs.

A `planId` foreign key on `PtPackage` records which plan an assignment came from, so reports can answer "how many clients are on Standard 12?".

## Why this is small and contained

- Pure additive change. Existing `PtPackage` rows get `planId = null` and continue to work unchanged.
- No service-layer math changes (cycle counting, carry-forward, etc. all unaffected).
- One new table, one new admin page, one form-field change.
- No dependency on Phase 24 — they touch different concerns (cycles vs catalog).

---

## Schema changes (`prisma/schema.prisma`)

### New model

```prisma
model PtPackagePlan {
  id                  String   @id @default(cuid())
  branchId            String
  name                String   // "Standard 12"
  sessionsPerMonth    Int
  pricePerCycle       Float    // total price per billing cycle
  sessionChargeAmount Float?   // optional per-session breakdown if branch quotes that way
  description         String?
  isActive            Boolean  @default(true)
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  branch   Branch      @relation(fields: [branchId], references: [id])
  packages PtPackage[]

  @@unique([branchId, name])  // plan names unique within a branch
  @@index([branchId, isActive])
  @@map("pt_package_plans")
}
```

### `PtPackage` addition

```prisma
model PtPackage {
  // ... existing fields ...
  planId  String?
  plan    PtPackagePlan? @relation(fields: [planId], references: [id])
}
```

### Migration

- Name: `20260508110000_add_pt_package_plans`
- **Local Docker first**, then Neon.
- Pure additive: new table + nullable FK column. No backfill.

---

## API contract

### New routes

```
GET    /api/admin/package-plans              → ?activeOnly=true&page&pageSize → Paginated<PtPackagePlan>
POST   /api/admin/package-plans              → { name, sessionsPerMonth, pricePerCycle, sessionChargeAmount?, description? } → PtPackagePlan
GET    /api/admin/package-plans/[id]         → {} → PtPackagePlan (with assignment count)
PUT    /api/admin/package-plans/[id]         → { ...updatable fields, isActive? } → PtPackagePlan
DELETE /api/admin/package-plans/[id]         → {} → { success } (soft — sets isActive=false; rejects with 409 if active assignments still reference it unless `?force=true`)
```

### Modified routes

```
POST /api/admin/mappings   body now also accepts: planId?  (when set, server uses plan defaults but client-supplied sessionsPerMonth/sessionCharge override)
```

Response shape on mappings now includes the linked `plan: { id, name }` (or `null`) so the UI can label the assignment card.

---

## Service layer

**New file:** `src/services/pt-package-plan.service.ts`

Standard CRUD + audit, mirroring `pt-package.service.ts` patterns:

- `createPlan`, `getPlans`, `getPlanById`, `updatePlan`, `deactivatePlan`
- All branch-scoped, all audit-logged (`PT_PACKAGE_PLAN_CREATED / UPDATED / DEACTIVATED`).
- `deactivatePlan` checks for active assignments referencing the plan; returns 409 unless `force=true`. (Active assignments are not unlinked — they keep their `planId` for historical reference; only future mapping creations are blocked from picking the plan.)

**Modified:** `pt-package.service.ts` — `createPtPackage` accepts optional `planId`. If provided, validates the plan belongs to the same branch and is active, then sets `data.planId = planId`. Plan provides defaults; per-mapping overrides win.

---

## UI changes

### New page — `src/app/(dashboard)/admin/settings/package-plans/page.tsx`

A simple management surface (no fancy dashboards):

- Table: name · sessions/cycle · price · per-session price · # active assignments · status
- "Create Plan" button → modal with the same fields
- Row actions: Edit · Deactivate
- Reachable from the admin sidebar (under "Settings" group).

### Mapping form (`src/app/(dashboard)/admin/clients/[id]/page.tsx`)

In the existing "Assign Trainer" / "Edit" panels, add a new field at the top of the form:

- **Plan:** `<select>` with options:
  - `— Select plan —` (placeholder)
  - Active plans: `Standard 12 · 12 sessions · ₹4000`
  - `Custom (enter manually)` — clears the field, leaves `sessionsPerMonth` / `sessionCharge` blank for free entry.

When a plan is selected, `sessionsPerMonth` and `sessionCharge` auto-populate but remain editable (with a small "edited from plan default" badge if the admin changes them after selection).

Active mapping cards display a `Plan: Standard 12` chip when `pkg.plan` is set, alongside the existing `12 sessions/mo · ₹400/session` line.

---

## Memory file updates

- `memory/schema.md` — append "Phase 25 Schema Additions (2026-05-08)" with the new `PtPackagePlan` model and `planId` FK.
- `memory/api-contracts.md` — patch mappings route, add the five `/api/admin/package-plans` routes.
- `memory/decisions.md`:
  - **ADR-027:** Branch-scoped PT Package Plans as a Catalog (mapping carries optional FK; values stay editable per assignment).

---

## Task list

| ID       | Owner      | Size | Description                                                                                                                                                                              |
| -------- | ---------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| S7-PP-01 | @architect | M    | Add `PtPackagePlan` model + `planId` FK on `PtPackage`. Migration `20260508110000_add_pt_package_plans` (local Docker → Neon). Regenerate Prisma client.                                 |
| S7-PP-02 | @architect | S    | Zod validators (`createPackagePlanSchema`, `updatePackagePlanSchema`, `listPackagePlansSchema`). Extend `createMappingSchema` with optional `planId`. Add `PtPackagePlanWithCount` type. |
| S7-PP-03 | @backend   | M    | `pt-package-plan.service.ts` — CRUD + audit + deactivation guard (409 on active assignments unless `force=true`).                                                                        |
| S7-PP-04 | @backend   | M    | `/api/admin/package-plans` CRUD routes + role guard (BRANCH_ADMIN                                                                                                                        | SUPER_ADMIN). |
| S7-PP-05 | @backend   | S    | Extend `createPtPackage` in `pt-package.service.ts` to validate + persist `planId`. Include `plan: { id, name }` in mapping responses.                                                   |
| S7-PP-06 | @ui        | L    | Admin settings page `/admin/settings/package-plans` — table + create/edit modal + deactivate flow. Sidebar link under Settings.                                                          |
| S7-PP-07 | @ui        | M    | Mapping form: plan dropdown with `Custom` option, auto-fill on select, "edited from plan default" badge. Plan chip on the assignment card.                                               |
| S7-PP-08 | @qa        | M    | Tests: plan CRUD, unique-name-per-branch enforcement, deactivation guard, mapping creation with plan vs custom, plan→mapping defaults applied correctly.                                 |
| S7-PP-09 | @architect | S    | Memory updates: `memory/schema.md`, `memory/api-contracts.md`, ADR-027 in `memory/decisions.md`.                                                                                         |

**Total estimate:** ~3 medium + 4 small + 2 large ≈ 22–28 hours.

---

## Order of operations (recommended)

1. **S7-PP-01 → S7-PP-02** as one PR (schema + validators). No behavior change.
2. **S7-PP-03 → S7-PP-05** second PR (service + API + mapping integration on the backend).
3. **S7-PP-06 → S7-PP-07** third PR (UI surface).
4. **S7-PP-08 → S7-PP-09** final PR (tests + memory).

---

## Recommended sequencing relative to Phase 24

Either order works; both are independent. **Suggestion: ship Phase 25 first.**

Reasons:

- Smaller in scope (~25 hrs vs ~55 hrs).
- Reduces admin friction immediately for every new client created today.
- The Phase 24 mapping form (S7-BC-11) then gets built once with the plan dropdown already in place, instead of being modified twice.

If Phase 24 ships first instead, S7-PP-07 will need a small follow-up to slot the dropdown into the now-busier mapping form. Not a blocker, just slightly more rework.
