# Current Task

_No active task. Phase 24 + 25 fully shipped as of 2026-05-08; QA backlog (S7-CF-10, S7-LB-11, S7-BC-14) closed in the same window. Backlog has zero open items._

## Recent phases

- **Phase 25 — PT Package Plans + Window Accounting + Onboarding Backfill** ([phase-25-package-plans.md](./phase-25-package-plans.md))
- **Phase 24 — Cycle-End Carry-Forward + Cron** (per-package `carryForwardLimit` override, `processCycleEndsForPackages`, `/api/cron/process-cycles` + `/api/admin/cycles/process`, Vercel cron config, "Secrets & Cron" architecture docs)

## Notes

- Pre-existing test failures in `tests/unit/pt-package-service.test.ts` (3 cases) — incomplete Prisma mocks from Phase 0-3, unrelated to recent work.
- Old `processMonthEnd` flow in `carryforward.service.ts` is preserved alongside the new `processCycleEndsForPackages` — no surface still calls it but it's not removed yet.

## Possible next steps

- Build a UI surface (admin client page) that displays a previous package's `carryForwardOutSessions` as a "credit available" hint when admin creates the next mapping for that client.
- Migrate `/api/client/dashboard` and `/api/trainer/clients` to package-window counts (from current calendar-month `getSessionCounts`).
- Remove the now-orphan `processMonthEnd` once nothing references it.
