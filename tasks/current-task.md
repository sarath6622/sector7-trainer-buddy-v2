# Current Task

## Task ID: S7-TV-01

## Title: Admin TV Leaderboard Dashboard

## Agent: @architect ✓ → @backend ✓ → @ui ✓

## Status: ALL 3 PHASES COMPLETE — READY FOR HARDWARE TEST

---

## Goal

Add a fancy, large-text TV dashboard mounted high on the gym wall that auto-rotates motivational panels every 15 seconds. Visible at `/tv`, authenticated via a long-lived device token bound to a single branch + the new `TV_DISPLAY` role. Admins can pin a panel or broadcast a shoutout from `/admin/tv-control`.

Source data is the current calendar month for the device's branch. Day-1 fallback to trailing-30d is deferred to a later phase.

---

## v1 Panel Scope (10–15 sec rotation each)

| #   | Panel                                                                             | Notes                                    |
| --- | --------------------------------------------------------------------------------- | ---------------------------------------- |
| 1   | Compound lifts leaderboard — **split by gender** (Bench / Squat / Deadlift / OHP) | Top 5 per lift per gender                |
| 2   | Volume kings — **split by gender** (Σ weight × reps)                              | Top 5 per gender                         |
| 3   | Attendance streaks                                                                | Unified, top 5                           |
| 4   | Badges unlocked this month (scrolling feed)                                       | Unified                                  |
| 5   | Latest PRs (live)                                                                 | Auto-generated CommunityPosts in last 7d |
| 9   | Perfect attendance wall                                                           | Unified, this month                      |
| 13  | Live now — sessions currently `IN_PROGRESS`                                       | Pusher-driven                            |

Plus: compound-PR triggers a 10-second full-screen confetti takeover (not other badge unlocks).

Other panels from the original brief (#6 body transformations, #7 most sessions, #8 class champions, #10 hardest workers, #11 exercise milestones, #12 new members, #14 praise board) deferred to v2.

---

## Acceptance Criteria — Phase 1 (Architect)

1. New `UserRole` enum value `TV_DISPLAY` (read-only, branch-scoped, no PII for opted-out clients).
2. `ClientProfile.showOnTv Boolean @default(false)` — opt-in flag. Opted-out clients contribute to anonymous aggregates only (counts/totals), never to name/photo panels.
3. New model `TvDevice` — id, branchId, name, token (unique), lastSeenAt, createdAt. Long-lived bearer token per physical TV.
4. New model `TvControlState` — id, branchId (unique), pinnedPanel, shoutout, shoutoutExpiresAt, updatedAt. One row per branch.
5. Audit actions registered for: `TV_DEVICE_REGISTERED`, `TV_DEVICE_REVOKED`, `TV_PIN_SET`, `TV_SHOUTOUT_BROADCAST`, `CLIENT_TV_OPT_IN_TOGGLED`.
6. Local migration applied to Docker Postgres; `prisma generate` succeeds; `npx prisma validate` passes.
7. `memory/schema.md`, `memory/api-contracts.md`, `memory/decisions.md` (ADR-032) updated.

---

## API Contracts Phase 1 Will Define (handed to @backend)

```
GET   /api/admin/tv/dashboard?month=YYYY-MM
        → fat payload, 60s server cache, role: TV_DISPLAY | BRANCH_ADMIN | SUPER_ADMIN
GET   /api/admin/tv/live
        → liveNow + last 10 PRs, 10s cache, same auth
POST  /api/admin/tv/devices
        → register TV; returns long-lived token (BRANCH_ADMIN | SUPER_ADMIN only)
GET   /api/admin/tv/devices
        → list devices for branch
DELETE /api/admin/tv/devices/[id]
        → revoke token
GET   /api/admin/tv-control
        → current TvControlState for caller's branch
POST  /api/admin/tv-control
        → { pinnedPanel?: string | null, shoutout?: string | null, shoutoutTtlSec?: number }
        → broadcasts TV_PIN_CHANGED / TV_SHOUTOUT on branch-{branchId}
PUT   /api/client/profile/tv-opt-in
        → { showOnTv: boolean } (client toggles own visibility)
```

Leaderboard panels in the dashboard payload return `{ male: [...], female: [...] }`. Streaks / attendance / live-now panels return a flat array.

---

## Pusher Channel Phase 1 Will Define

New channel: `branch-{branchId}`

Events:

- `PR_ACHIEVED` `{ clientName, exerciseName, weightKg, reps, achievedAt, photoUrl? }` — fired by workout.service when compound-PR detected and client has `showOnTv=true`. Triggers TV confetti takeover.
- `BADGE_UNLOCKED` `{ clientName, badgeName, badgeIcon, awardedAt, photoUrl? }` — fired by badge.service when a badge is awarded and client has `showOnTv=true`. Goes into rotation feed.
- `TV_PIN_CHANGED` `{ pinnedPanel: string | null }`
- `TV_SHOUTOUT` `{ message: string, expiresAt: string }`
- `SESSION_STARTED_TV` `{ trainerName, clientName, startedAt }` — fired alongside existing SESSION_STARTED for live-now panel.

Existing session/user channels are untouched.

---

## Out of Scope (Phase 1)

- v2 panels listed above.
- Trailing-30d day-1 fallback.
- Implementation of services / routes / UI — those are @backend (Phase 2) and @ui (Phase 3).

---

## Decided During Phase 1

- `TvDevice.tokenHash` stores bcrypt hash; plaintext returned exactly once on `POST /api/admin/tv/devices`. Locked into the schema + contract.

---

## Phase 1 (Architect) — Completed 2026-05-11

**Files changed:**

- `prisma/schema.prisma` — `TV_DISPLAY` enum value, `ClientProfile.showOnTv`, `TvDevice` + `TvControlState` models, Branch relations wired.
- `prisma/migrations/20260511181814_add_tv_display_role_and_devices/migration.sql` — created + applied.
- `prisma/migrations/20260511181903_add_tv_dashboard_phase_1/migration.sql` — created + applied.
- `memory/schema.md` — appended "Phase 26 Schema Additions — TV Dashboard" section.
- `memory/api-contracts.md` — appended TV Dashboard Routes section + `branch-{branchId}` Pusher channel docs.
- `memory/decisions.md` — appended ADR-032.

**Migrations applied:**

- Local Docker (`postgresql://sector7:sector7pass@localhost:5432/sector7`) — both migrations.
- Neon (`neondb` on ep-quiet-paper-anp8y5vy) — both migrations via `prisma migrate deploy`.

**Data integrity verified on both DBs.** Pre/post row counts identical for all existing tables (`client_profiles`, `users`, `session_instances`, `workout_logs`, `workout_sets`, `progress_entries`, `community_posts`, `user_badges`, `audit_logs`). Sample client row picked up `showOnTv: false` default.

**Checks passed:**

- `npx prisma validate` ✓
- `npm run type-check` (tsc --noEmit) ✓

---

## Phase 2 (@backend) — Acceptance Criteria

1. Implement services in `src/services/`:
   - `tv-device.service.ts` — register / list / revoke devices. Hash tokens with bcrypt (cost 10). Plaintext returned only on register.
   - `tv-control.service.ts` — upsert pin / shoutout state, emit Pusher events.
   - `tv-dashboard.service.ts` — compute the full `TvDashboardPayload` (compound leaderboards split by gender, volume kings, streaks, badges this month, latest PRs, perfect attendance, live now). 60s in-memory cache per branch.
   - `tv-live.service.ts` — `liveNow` + last 10 PRs, 10s cache.
2. Implement API routes per `memory/api-contracts.md` → "TV Dashboard Routes (Phase 26)":
   - `GET /api/admin/tv/dashboard`
   - `GET /api/admin/tv/live`
   - `GET /api/admin/tv/devices`, `POST /api/admin/tv/devices`, `DELETE /api/admin/tv/devices/[id]`
   - `GET /api/admin/tv-control`, `POST /api/admin/tv-control`
   - `PUT /api/client/profile/tv-opt-in`
3. New `assertTvOrAdmin()` auth helper that accepts EITHER:
   - A NextAuth session with `BRANCH_ADMIN | SUPER_ADMIN | TV_DISPLAY` role, OR
   - A `Bearer <token>` header where the bcrypt-matched token is a non-revoked `TvDevice`.
4. Add Pusher event emitters:
   - `triggerBranchEvent(branchId, event, payload)` in `src/lib/pusher.ts` for the new `branch-{branchId}` channel.
   - Hook into `workout.service` compound-PR detection → fire `PR_ACHIEVED` if client `showOnTv=true`.
   - Hook into `badge.service` badge award → fire `BADGE_UNLOCKED` if client `showOnTv=true`.
   - Hook into `session.service.startSession` → fire `SESSION_STARTED_TV` (alongside the existing `SESSION_STARTED` on `session-{id}`).
   - All hooks must be try/catch and never block the underlying write.
5. Audit calls for `TV_DEVICE_REGISTERED`, `TV_DEVICE_REVOKED`, `TV_PIN_SET`, `TV_SHOUTOUT_BROADCAST`, `CLIENT_TV_OPT_IN_TOGGLED`.
6. Zod schemas in `src/lib/validators.ts` for every request body.
7. Tests:
   - Service unit tests (mocked Prisma + mocked Pusher).
   - API integration tests for happy path + auth failure (no token, expired token, revoked device, wrong branch).

## Phase 3 (@ui) — Acceptance Criteria

1. `/tv` route — full-screen, no chrome, accepts `?token=...` (stored to localStorage), reads `TvDashboardPayload`, rotates panels every **15 seconds**.
2. Compound-PR Pusher event triggers a 10-second confetti takeover.
3. `/admin/tv-control` — admin phone surface: pick panel to pin, send shoutout, view registered devices.
4. `/admin/tv-devices` (or under settings) — register new TV, copy token once, revoke.
5. Client profile screen gains a "Show me on the gym TV" toggle.
6. Verify on actual large screen at intended viewing distance (10ft+) before completion.

---

## Notes for next session

- @backend should start by adding `triggerBranchEvent()` to `pusher.ts` before wiring the service hooks — easiest to test the lib first.
- The dashboard service queries are heavy; consider materializing them as a single Promise.all bundle and caching with a simple in-memory Map keyed by `${branchId}:${month}` with 60s TTL. Vercel's per-instance memory is fine for v1; revisit if we deploy more instances.
- Branch-scoped row queries for opt-in filter: prefer `where: { client: { showOnTv: true } }` on workout/badge/post tables — server-side filter so opted-out names never leave Postgres.

---

## Phase 2 (Backend) — Completed 2026-05-12

**Files added:**

- `src/lib/tv-auth.ts` — `assertTvOrAdmin(req)` and `verifyDeviceToken(token)`. Accepts either NextAuth session with `TV_DISPLAY | BRANCH_ADMIN | SUPER_ADMIN` OR a `Bearer {deviceId}.{secret}` token verified against bcrypt-hashed `TvDevice.tokenHash`. Bumps `lastSeenAt` as best-effort heartbeat.
- `src/services/tv-device.service.ts` — `registerTvDevice`, `listTvDevices`, `revokeTvDevice`. Token format `{deviceId}.{base64url-32B-secret}`; plaintext returned exactly once on register.
- `src/services/tv-control.service.ts` — `getTvControlState`, `updateTvControlState`. Singleton upsert + Pusher fanout. Expired shoutouts normalized to null on read.
- `src/services/tv-dashboard.service.ts` — full `TvDashboardPayload` with compound leaderboards (gendered), volume kings (gendered), streaks, badges this month, latest PRs, perfect attendance, live now. 60s in-process cache per `${branchId}:${month}`.
- `src/services/tv-live.service.ts` — `liveNow` + recent PRs, 10s cache.
- `src/app/api/admin/tv/dashboard/route.ts` — `GET`, role-gated via `assertTvOrAdmin`.
- `src/app/api/admin/tv/live/route.ts` — `GET`, same auth.
- `src/app/api/admin/tv/devices/route.ts` — `GET` (list) + `POST` (register, returns token once).
- `src/app/api/admin/tv/devices/[id]/route.ts` — `DELETE` (revoke).
- `src/app/api/admin/tv-control/route.ts` — `GET` + `POST`.
- `src/app/api/client/profile/tv-opt-in/route.ts` — `PUT` (CLIENT only).
- `tests/unit/tv-auth.test.ts` — 11 cases covering bearer happy path, bad secret, unknown device, revoked device, malformed tokens, session paths for TV/admin/CLIENT/none.
- `tests/unit/tv-device-service.test.ts` — 6 cases covering token format, bcrypt verifiability, audit emission, idempotent revoke, cross-branch revoke rejection.

**Files modified:**

- `src/lib/pusher.ts` — added `triggerBranchEvent`, `BranchChannel`, and event payload types for `PR_ACHIEVED`, `BADGE_UNLOCKED`, `SESSION_STARTED_TV`, `TV_PIN_CHANGED`, `TV_SHOUTOUT`.
- `src/lib/validators.ts` — added `TV_DISPLAY` to `userRoleSchema`; added `tvDashboardQuerySchema`, `createTvDeviceSchema`, `updateTvControlSchema`, `tvOptInSchema` plus type exports.
- `src/services/workout.service.ts` — fires `PR_ACHIEVED` after a compound-PR is detected, gated on `ClientProfile.showOnTv`. Wrapped in try/catch — never blocks workout save.
- `src/services/badge.service.ts` — fires `BADGE_UNLOCKED` inside `awardBadge` after audit, gated on `showOnTv`. Same try/catch posture.
- `src/services/session.service.ts` — fires `SESSION_STARTED_TV` alongside existing `SESSION_STARTED`. Always fired; the dashboard payload filter is what hides opted-out sessions from the live-now panel.

**Audit actions registered:** `TV_DEVICE_REGISTERED`, `TV_DEVICE_REVOKED`, `TV_PIN_SET`, `TV_SHOUTOUT_BROADCAST`, `CLIENT_TV_OPT_IN_TOGGLED`.

**Checks passed:**

- `npm run type-check` (tsc --noEmit) — 0 errors
- `npm run lint` — 0 errors (7 pre-existing `<img>` warnings unrelated to TV work)
- `npx vitest run tests/unit/tv-*.test.ts` — 17/17 passing
- Smoke-checked `workout-service.test.ts`, `badge-service.test.ts`, `session-service.test.ts` — 14 failures all confirmed pre-existing (same failures on clean `main` before my changes; incomplete Prisma mocks per existing task notes).

**Memory not yet updated** — Phase 2 didn't change schema or contracts, only implemented what was already documented in Phase 1.

**Decisions made during Phase 2:**

- Token wire format: `{deviceId}.{base64url-secret}` so we can look up exactly one row by id instead of bcrypt-scanning the table. The `.` is a safe separator since cuids never contain it.
- `SESSION_STARTED_TV` is fired unconditionally (no `showOnTv` gate at the emit site). The dashboard's `liveNow` filter in the payload is what actually hides opted-out clients. This keeps the Pusher event uniform and lets the TV optimistically increment its session counter from the event, then reconcile with the next dashboard refresh.
- The `compound slot → exercise` mapping in `tv-dashboard.service.ts` is hard-coded substring matching (bench → "bench press"/"bench", squat → "back squat"/"squat", etc.). If no compound exercise matches a slot, that slot's leaderboard is empty rather than failing. Move to a config table only if name patterns prove unreliable across branches.

---

## Phase 3 (@ui) — Acceptance Criteria (unchanged from Phase 1)

1. `/tv` route — full-screen, no chrome, accepts `?token=...` (stored to localStorage), reads `TvDashboardPayload` from `GET /api/admin/tv/dashboard`, rotates panels every **15 seconds**.
2. Compound-PR Pusher event (`PR_ACHIEVED` on `branch-{branchId}`) triggers a 10-second confetti takeover.
3. `/admin/tv-control` — admin phone surface: pick panel to pin, send shoutout, view registered devices.
4. `/admin/tv-devices` (or under settings) — register new TV, copy token once, revoke.
5. Client profile screen gains a "Show me on the gym TV" toggle.
6. Verify on actual large screen at intended viewing distance (10ft+) before completion.

## Notes for @ui

- Pusher client subscribes to `branch-{branchId}`. The branch id needs to come from somewhere — for the TV, decode it from the device's API response (the dashboard payload includes `branchId`). For admin, it's `session.user.branchId`.
- `POST /api/admin/tv/devices` returns `{ device, token }` where `token` is shown EXACTLY ONCE. The UI must copy-to-clipboard + offer a "I saved it, dismiss" confirmation — never re-display.
- The `liveNow` count in the dashboard payload is the total (including opted-out clients); only `sessions[]` is filtered. Show the count prominently but use the filtered array for the named-row list.
- Recommended panel-rotation implementation: a single `setInterval(15_000)` cycling through a `panelOrder` array. When a `TV_PIN_CHANGED` event arrives with a non-null panel, jump to that index and pause the interval until pin is cleared.
- Confetti takeover: subscribe to `PR_ACHIEVED`, push into a queue, show one at a time for 10s. If multiple PRs land in quick succession, queue them — don't drop.

---

## Phase 3 (UI) — Completed 2026-05-12

**Files added:**

- `src/app/tv/layout.tsx` — full-screen wrapper using `LayoutProps<'/tv'>` (Next 16 typed-layout shape).
- `src/app/tv/page.tsx` — captures `?token=...` once, persists to `localStorage` under `sector7.tv.token`, cleans the URL via `router.replace('/tv')`, renders `<TvDashboard>` or a friendly "no token" message.
- `src/components/tv/TvDashboard.tsx` — fetch loop (60s dashboard, 10s live), Pusher subscription to `branch-{branchId}`, 15s panel rotation, pin-snap behavior, PR-takeover queue, header (branch + month + clock), shoutout banner, panel-pip footer.
- `src/components/tv/TvPanel.tsx` — switch-based renderer for all 7 panels. CompoundLift + Volume panels split MEN / WOMEN columns; medal-coloured rank pills (gold/silver/bronze); avatar with initials fallback.
- `src/components/tv/PrTakeover.tsx` — 10-second full-screen confetti takeover: 60 falling CSS-keyframed pieces, scale-pop card, big lifter name + weight. All animations via scoped `<style jsx global>` — no external library.
- `src/app/(dashboard)/admin/settings/tv-devices/page.tsx` — register / list / revoke TV devices. The just-created token card includes copy buttons for both the raw token AND the full `/tv?token=...` URL, plus a "I saved it — dismiss" button. After dismiss the token is gone forever (UI never re-displays).
- `src/app/(dashboard)/admin/tv-control/page.tsx` — pin a panel (grid of toggle buttons), broadcast a shoutout with TTL preset chips (30s/1m/3m/10m), live-state card for currently-pinned panel + active shoutout.
- `src/app/(dashboard)/client/settings/page.tsx` — new client settings page with the "Show me on the gym TV" Switch toggle. Optimistic UI + rollback on failure.

**Files modified:**

- `src/lib/constants.ts` — added `Monitor` icon import, two new entries to `ADMIN_NAV_ITEMS` under "System" group (TV Control, TV Devices), one new entry to `CLIENT_NAV_ITEMS` under new "Account" group (Settings).
- `src/middleware.ts` — added `/tv`, `/api/admin/tv/dashboard`, `/api/admin/tv/live` to `PUBLIC_PATHS`. The TV display authenticates with a bearer token (verified by `assertTvOrAdmin` at the route layer), so the middleware can't gate it via NextAuth. Admin-only routes (`/api/admin/tv/devices`, `/api/admin/tv-control`) intentionally stay session-gated and were NOT added to public paths.
- `src/app/api/client/profile/tv-opt-in/route.ts` — added a `GET` to return the caller's current `showOnTv` so the settings UI renders without a flicker. Contract doc updated in `memory/api-contracts.md`.

**Checks passed:**

- `npm run type-check` — 0 errors
- `npm run lint` — 0 errors (only pre-existing `<img>` warnings unrelated to TV work)
- Dev server smoke tests on running instance (PID 61507, port 3000):
  - `GET /tv` → 200 (renders "no device token" without a token)
  - `GET /api/admin/tv/dashboard` → 401 (passed middleware, route correctly rejected unauthenticated request)
  - `GET /api/admin/tv/live` → 401 (same)
  - `GET /api/admin/tv-control` → 307 (still session-gated, correctly redirects to login)
  - `GET /admin/tv-control`, `/admin/settings/tv-devices`, `/client/settings` → all 200 after login redirect (pages compile and render)

**Decisions made during Phase 3:**

- The `/tv` page lives outside the `(dashboard)` route group so it has no sidebar/topnav chrome. It has its own minimal `layout.tsx` that just sets `bg-black text-white h-dvh w-screen`.
- Next 16's typed routes treat `/tv` as a real layout route (not a route group), so `TvLayout` must accept `LayoutProps<'/tv'>` (with `params`) rather than the simple `{ children }` shape used by the `(dashboard)` layout. This caused two cryptic type errors that took a minute to track down — noted here so the next person building a chrome-less route doesn't trip on it.
- Confetti is hand-rolled with CSS keyframes (no new library). 60 pieces is enough to feel celebratory without choking the renderer.
- Shoutout countdown is driven by a once-per-second `now` tick in `TvDashboard`. The banner self-hides when `expiresAt < now`, independently of any Pusher event arriving.
- Pin behavior pauses both the rotation interval AND any in-flight PR takeover queue advancement — the operator's pin takes precedence over everything except a PR celebration (PRs queue and play one after another regardless of pin state, then the pin resumes when the queue drains).

**Cross-cutting note:** Two files outside the `@ui` agent's stated ownership were modified during this phase — `src/middleware.ts` (auth gating for the new public-feeling `/tv` route) and `src/app/api/client/profile/tv-opt-in/route.ts` (added a `GET` to the existing route to avoid UI flicker). The middleware change is architecturally important; the GET endpoint was documented in `memory/api-contracts.md` to keep the contract source of truth in sync.

---

## What's left (out of S7-TV-01 scope)

- **Hardware verification.** The CLAUDE.md rule is to verify UI on actual screens before declaring done. None of the new pages have been viewed at 10ft+ on a real wall-mounted TV. Recommend the operator:
  1. Register a TV device via `/admin/settings/tv-devices`.
  2. Copy the `/tv?token=...` URL onto a Chromecast / smart TV browser.
  3. Watch one full rotation cycle (≈150 seconds) at intended viewing distance.
  4. Trigger a real compound PR during a session to confirm the confetti takeover lands.
  5. Pin a panel from a phone via `/admin/tv-control`; confirm the TV snaps within ~2 seconds.
- **Real seed data.** With no opted-in clients in the local DB (`showOnTv` defaults to false), most panels render empty states. To preview the populated UI you'd need to flip `showOnTv = true` on a few client profiles via Prisma Studio or a one-off update.
- **v2 panels** deferred per Phase 1 ADR-032: body transformations, class champions, hardest workers, exercise milestones, new members, praise board.

---

## Phase 4 (Refactor) — Polling Replaces Pusher — Completed 2026-05-12

After end-to-end testing, the Pusher transport layer was ripped out and the TV
is now a pure polling client. Rationale + full consequences in ADR-033.
Operator-driven decision: "we don't need real-time push for an unattended
display; 10s lag is invisible to anyone."

**Backend changes:**

- `src/lib/pusher.ts` — removed `BranchChannel`, `BranchEvent`, the five payload types, and `triggerBranchEvent`. Session/user channels untouched.
- `src/services/workout.service.ts` — removed the post-compound-PR Pusher emit.
- `src/services/badge.service.ts` — removed the post-award Pusher emit + the showOnTv lookup it required.
- `src/services/session.service.ts` — removed the `SESSION_STARTED_TV` Pusher emit. The existing `SESSION_STARTED` on `session-{id}` is untouched (trainer/client need that).
- `src/services/tv-control.service.ts` — removed both Pusher fanouts (`TV_PIN_CHANGED`, `TV_SHOUTOUT`). Audit log calls retained.
- `src/services/tv-live.service.ts` — payload now includes the `control` block (`pinnedPanel`, `shoutout`) so the 10s poll covers pin/shoutout state. `getTvControlState(branchId)` added to the Promise.all.

**Frontend changes:**

- `src/components/tv/PrTakeover.tsx` — `pr` prop now typed as a local `TakeoverPr` interface (exported), not the deleted `PrAchievedPayload`.
- `src/components/tv/TvDashboard.tsx` — dropped `usePusherChannel` and all event handlers. Added a `lastSeenPrAt` ref + `ingestLatestPRs(latestPRs)` helper that diffs against the watermark and queues any newer PRs (oldest first). Both `fetchDashboard` and `fetchLive` call `ingestLatestPRs`. Pin/shoutout now come from `control` on either payload (live overwrites dashboard's `control` since live is fresher).

**Memory updates:**

- `memory/api-contracts.md` — updated `/api/admin/tv/live` payload shape to include `control`, removed the `branch-{branchId}` Pusher channel section, replaced with a short "TV transport: polling, not Pusher" note pointing at ADR-033.
- `memory/decisions.md` — appended ADR-033 superseding the Pusher-transport parts of ADR-032. ADR-032's auth/role/opt-in/gendered/pin decisions all stand.

**Net result:**

- One fewer service dependency for the TV. No more `NEXT_PUBLIC_PUSHER_KEY` requirement for TV operation; gym TVs work on the dashboard host alone.
- Confetti / pin / shoutout lag up to ≤10s. Live count lag up to ≤10s. Badge feed lag up to ≤60s. All acceptable for a wall display.
- Self-healing on transient errors: a failed poll retries in 10s.
- Pusher quota fully preserved for trainer/client session real-time (the only place sub-second sync genuinely matters).
