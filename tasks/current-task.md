# Current Task

## Task ID: S7-PC-07

## Title: Admin Package Audit Table — one page to reconcile paid vs used per client

## Agent: @backend + @ui

## Status: COMPLETE (2026-10-10) — unstaged, not committed, not deployed

---

## Goal

Give the admin a single sortable/filterable **table** that answers "has this client
been charged and credited correctly?" without opening each client card one by one.

Operator framing (2026-10-10): a new client is given a package of e.g. 8 or 12
sessions; each completed/started PT session should decrement it, and the admin
needs to see the running total per client. Before changing any more counting
logic, surface the current state so it can be audited against the trainers'
own records (meeting with trainer Sumayya).

---

## Why a new page rather than extending `/admin/clients`

`/admin/clients` is a card list, shows only the **active** package, and — verified
2026-10-10 — still computes `used` with the pre-`billing-cycle` formula
(`endDate ?? startDate + 30d`, 4 occurrences in `user.service.ts`). It therefore
under-reports by ~**1,518 sessions across 172 clients** versus
`getPackageWindowCounts`, which is GRACE-aware. The audit page must use the
`billing-cycle.ts` math so it agrees with the trainer scheduling card.

Migrating `/admin/clients` itself is tracked separately (see Follow-ups) so this
task stays reviewable.

---

## Acceptance Criteria

1. New route `GET /api/admin/package-audit` — BRANCH_ADMIN | SUPER_ADMIN only,
   branch-scoped, documented in `memory/api-contracts.md` BEFORE implementation.
2. Bulk computation — **no N+1**. Two queries total (packages, sessions), the
   per-client math done in memory.
3. Uses `getPackageState` / `getCountingWindowEnd` from `src/lib/billing-cycle.ts`,
   mirroring `getPackageWindowCounts` exactly (two-pass: nominal window to resolve
   state, then the real counting window) so the numbers match the trainer card.
4. Each row carries BOTH views, clearly distinguished:
   - **Current package**: plan, paid (`totalSessions`), used, upcoming, remaining, state, cycle.
   - **Lifetime across all packages**: packages count, total paid, total used,
     real session rows, onboarding offset, last session date.
     The lifetime columns are the figure clients actually mean (the renewal reset,
     S7-PC-03) and the reason this page exists.
5. `onboardingUsedSessions` is surfaced as its own column — it counts toward `used`
   but has NO backing `SessionInstance` rows (ADR-030), so an auditor must see it
   separately or the arithmetic looks wrong.
6. Page `/admin/package-audit` — real table, sortable, text filter, and quick
   filters for the states that need attention. CSV export so it can be taken
   into the gym.
7. Admin nav entry under the People group.
8. Tests: service unit tests (mocked Prisma) covering lifetime vs current split,
   onboarding offset, multi-package clients, no-package clients, branch scoping.
9. `npm run type-check` and `npm run lint` clean.

## Explicitly out of scope

- Changing any counting logic. This task only _reports_.
- Migrating `/admin/clients` to `billing-cycle.ts` (follow-up).
- The renewal-reset decision (S7-PC-03) — this page makes it visible, not fixed.

## Follow-ups to raise after this lands

- `/admin/clients` + `user.service.ts` still on the old formula (~1,518 sessions under-reported).
- `api/admin/clients/expiring/route.ts` computes `usedSessions` independently too.
