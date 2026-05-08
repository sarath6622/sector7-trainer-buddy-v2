# Current Task

## Phase 25 — PT Package Plans (Catalog) + Window Accounting + Onboarding Backfill

**Active as of:** 2026-05-08
**Status:** Backend + UI + memory all shipped. **Only S7-PP-08 (tests) remains.**
**Full plan:** [phase-25-package-plans.md](./phase-25-package-plans.md)

---

### Completed in this phase

- [x] **S7-PP-01** | @architect | M | `PtPackagePlan` model + `planId` FK on `PtPackage`. Migration `20260508110000_add_pt_package_plans` (local Docker → Neon).
- [x] **S7-PP-02** | @architect | S | Validators (`createPackagePlanSchema`, `updatePackagePlanSchema`, `listPackagePlansSchema`); `createMappingSchema`/`updateMappingSchema` extended with `planId`, `totalSessions`, `onboardingUsedSessions`, `onboardingNotes`.
- [x] **S7-PP-03** | @backend | M | `pt-package-plan.service.ts` — CRUD + audit + 409-on-active-assignments deactivation guard.
- [x] **S7-PP-04** | @backend | M | `/api/admin/package-plans` CRUD routes (BRANCH_ADMIN | SUPER_ADMIN). DELETE supports `?force=true`.
- [x] **S7-PP-05** | @backend | S | `createPtPackage` / `updatePtPackage` validate + persist `planId`; mapping responses include `plan: { id, name }`.
- [x] **S7-PP-06** | @ui | L | Admin settings page `/admin/settings/package-plans` (table + create/edit modal + deactivate/reactivate). Sidebar entry.
- [x] **S7-PP-07** | @ui | M | Mapping form — plan dropdown, auto-fill, "edited from plan default" banner, plan chip on card.
- [x] **S7-PP-09** | @architect | S | Memory: `schema.md` (Phase 25 additions), `api-contracts.md` (mapping + plan + window-counts routes), ADR-027/028/029/030 in `decisions.md`.
- [x] **S7-PP-10** | @architect+@ui | M | (Follow-up) `durationDays` on `PtPackagePlan` + end-date auto-derivation in mapping form. ADR-028.
- [x] **S7-PP-11** | @architect+@backend+@ui | L | (Follow-up) `totalSessions` + onboarding backfill on `PtPackage`, new `getPackageWindowCounts` helper, `GET /api/admin/mappings/[id]/window-counts` endpoint, scheduling modal rebound. ADR-029, ADR-030.

### Remaining

_None — Phase 25 complete._

### Recently completed

- [x] **S7-PP-08** | @qa | M | 50 tests across 5 files, all passing:
  - `tests/unit/pt-package-plan-service.test.ts` — 14 tests covering catalog CRUD + unique-name guard + deactivation guard (409 vs `?force=true`) + audit calls
  - `tests/unit/pt-package-window-counts.test.ts` — 9 tests covering window math, used/upcoming/remaining accounting, onboarding offset, cancelled exclusion, fake-timer days math, endDate fallback
  - `tests/unit/pt-package-with-plan.test.ts` — 7 tests covering totalSessions auto-compute (12 × round(90/30) = 36), explicit override, custom-no-plan fallback, onboarding persistence, PLAN_NOT_FOUND/PLAN_INACTIVE, non-monthly rounding
  - `tests/integration/package-plans-api.test.ts` — 15 tests covering all 5 routes, role guards, validation, force-flag passthrough
  - `tests/integration/mappings-window-counts-api.test.ts` — 5 tests covering auth, branch scoping, payload shape, 404

---

## Up next — Phase 24 (Carry-Forward + Cron) — substantially reduced scope

Most of original Phase 24 was absorbed into Phase 25 via per-package window accounting (ADR-029)
and onboarding backfill (ADR-030). What remains:

- **S7-BC-06** Cycle-end carry-forward (roll unused into next package, idempotent)
- **S7-BC-09** `/api/cron/process-cycles` route + manual admin trigger
- **S7-BC-10** Vercel cron config + `CRON_SECRET` rotation docs
- **S7-BC-11** Per-package `carryForwardLimit` override (`Int?` on `PtPackage`)
- **S7-BC-14** Integration tests for the above

The original phase-24 plan doc at [phase-24-billing-cycles.md](./phase-24-billing-cycles.md)
is now partially obsolete — needs a rewrite/trim before this phase resumes.

---

## Notes

- Pre-existing test failures in `tests/unit/pt-package-service.test.ts` (3 cases) — incomplete Prisma mocks from Phase 0-3, unrelated to Phase 25.
- `current-task.md` will get a fresh task next session.
