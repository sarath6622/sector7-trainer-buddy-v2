# Sector 7 — Flutter Mobile Migration Plan

> Status: Phase 1 scaffold complete · **Phase 0 auth core shipped (2026-06-13)** ·
> **Phase 2 Client MVP started (2026-06-14)** — shell + dashboard + sessions + profile live
> Scope decision (2026-06-11): **Mobile = Trainer + Client.** Admin & TV stay on the
> existing Next.js web app. Next.js becomes the **shared backend** for web + mobile.
> No business-logic rewrite — Flutter is a new client over the existing REST API.
>
> **Phase 0 done (2026-06-13):** mobile JWT auth (`/api/mobile/auth/{login,refresh,logout}`),
> a Bearer-aware `getServerSession()` (all routes accept a mobile token, zero call-site
> changes), middleware Bearer passthrough, and a rotating `MobileRefreshToken` store with
> reuse detection. Flutter auto-refresh-on-401 + server logout wired. Verified end-to-end
> against the local DB (login → Bearer `/api/client/dashboard` → refresh rotation →
> reuse-revokes-family → admin rejected → web cookie path intact). Remaining Phase 0 items
> (Pusher Bearer auth, FCM platform field) are deferred to their phases; **signed
> upload is now done (ADR-044)**.

---

## 1. Why this shape

The app is a mature Next.js 16 full-stack PWA (~70k LOC) where **all business logic
already lives server-side** in the service layer (`src/services/`, 32 services, Prisma).
API routes are thin (validate → service → `{ data }` envelope). 164 route handlers
back the whole product.

Therefore the migration is **"new frontend, same backend"**:

```
            ┌────────────────────────── Next.js (unchanged) ──────────────────────────┐
            │  API routes (164)  →  services (32)  →  Prisma  →  Postgres              │
            │  + web console (Admin, TV)                                               │
            └──────────────▲───────────────────────────────────▲──────────────────────┘
                           │ HTTPS  { data } / { error,code }   │
              cookie + CSRF │                                   │ Bearer JWT
            ┌──────────────┴───────────┐          ┌────────────┴───────────────┐
            │  Next.js web (Admin/TV)  │          │  Flutter app (Trainer/Client) │
            └──────────────────────────┘          └─────────────────────────────┘
```

Rewriting services/Prisma in Dart would be months of pure risk for zero product gain.

---

## 2. Tech mapping (web → Flutter)

| Concern         | Web (today)                          | Flutter                                                                |
| --------------- | ------------------------------------ | ---------------------------------------------------------------------- |
| Language/UI     | React 19 + Tailwind + shadcn/ui      | Dart + Material 3 design system                                        |
| State           | React hooks / context                | **Riverpod**                                                           |
| Navigation      | Next App Router + middleware         | **go_router** with role redirect                                       |
| Networking      | `fetch`                              | **dio** (+ retrofit codegen later)                                     |
| Auth            | NextAuth v4 (httpOnly cookie + CSRF) | **JWT Bearer** + `flutter_secure_storage` — needs Phase 0 backend work |
| Real-time       | `pusher-js`                          | `pusher_channels_flutter` (same Pusher app/channels)                   |
| Push            | FCM web-push (service worker)        | `firebase_messaging` (native APNs/FCM)                                 |
| Offline DB      | Dexie / IndexedDB                    | **Drift** (sqlite) or Isar                                             |
| Background sync | Serwist / Workbox                    | `workmanager` + custom sync queue                                      |
| Charts          | Recharts                             | **fl_chart**                                                           |
| Calendar        | FullCalendar                         | `table_calendar` / `syncfusion_flutter_calendar`                       |
| Tables          | TanStack Table                       | native `ListView` / `DataTable`                                        |
| Forms           | react-hook-form + Zod                | Flutter `Form` + validators (server Zod stays source of truth)         |
| Image upload    | Cloudinary widget                    | `image_picker` + signed upload endpoint                                |
| Excel export    | SheetJS (client)                     | stays server-side; mobile shares the file                              |

---

## 3. Phase 0 — Backend mobile-enablement (the prerequisite)

Native apps cannot ride NextAuth's cookie + CSRF flow. This is the **only backend work**
and it gates everything. Keep it additive — do not touch the web auth path.

### 3.1 Mobile auth endpoints (new)

```
POST /api/mobile/auth/login
  body: { email, password }
  → verify with bcrypt against User (reuse logic in src/lib/auth.ts authorize())
  → issue accessToken (JWT, ~15 min) + refreshToken (JWT, ~30 days, rotating)
  → { data: { accessToken, refreshToken, user: { id,email,role,branchId,
              firstName,lastName,trainerProfileId,clientProfileId } } }
  → reject SUPER_ADMIN / BRANCH_ADMIN at the mobile login (admins use web)

POST /api/mobile/auth/refresh
  body: { refreshToken }
  → verify + rotate → { data: { accessToken, refreshToken } }

POST /api/mobile/auth/logout
  → invalidate refresh token (store a hash / jti denylist, or token version on User)
```

JWT claims mirror the NextAuth token: `sub=userId, role, roles, branchId,
trainerProfileId, clientProfileId`. Sign with a **separate** `MOBILE_JWT_SECRET`.

### 3.2 Bearer-or-cookie auth shim

The 164 existing routes call `getServerSession()`. Introduce one helper that accepts
**either** a NextAuth cookie **or** a `Authorization: Bearer` mobile JWT, returning the
same session-user shape. Swap `getServerSession()` → `getSession(req)` route-by-route
(start with the Trainer/Client routes the app actually needs — not all 164).

```ts
// src/lib/mobile-auth.ts (new)
export async function getSession(req): Promise<SessionUser | null> {
  const bearer = req.headers.get('authorization');
  if (bearer?.startsWith('Bearer ')) return verifyMobileJwt(bearer.slice(7));
  return getServerSession(); // existing cookie path, unchanged for web
}
```

Branch scoping, RBAC (`hasRole`), and audit logging are unchanged — they read off the
returned session user exactly as today.

### 3.3 Other Phase 0 items

- **FCM device tokens:** native tokens register through the existing `FcmToken` model /
  notification endpoints. Confirm the register/unregister route accepts a `platform`
  field (ios/android) and Bearer auth.
- **Cloudinary signed upload:** ✅ **done (2026-06-14, ADR-044)** — `POST /api/mobile/upload/sign`
  returns branch-scoped signed params (`kind: profile|progress`); the app uploads directly to
  Cloudinary, secret stays server-side. Verified end-to-end against real Cloudinary. Profile-image
  can alternatively reuse the existing server-proxy `POST /api/client/profile/image`.
- **CORS:** allow the app origins for any browser-context calls; native dio calls are
  not CORS-bound but staging/web-debug builds are.
- **Pusher auth:** private/presence channels need an auth endpoint that accepts Bearer.

---

## 4. Per-screen plan (Trainer + Client)

Each screen maps to existing endpoints — no new business logic, just presentation.

### Client (Phase 2 — read-heavy, lowest risk)

> **Phase 2 nearly complete (2026-06-14):** bottom-nav shell (Home/Sessions/
> Progress/Profile) + enriched dashboard + sessions list/detail + profile +
> Progress charts (fl_chart) + workout history + **badges** + **availability
> (mark/remove)** + **reschedule (list + submit)** shipped and verified live
> against the local backend (incl. the app's first writes — unavailability
> POST/DELETE verified E2E). The Cloudinary **signed-upload backend is now done**
> (ADR-044); only the **settings/profile-image UI** remains (wire `image_picker`).
>
> Also fixed an auth gotcha surfaced here (**ADR-043**): client routes returned
> `403` for an _expired_ token, so the app's refresh-on-401 never fired (stuck on
> "Forbidden" until re-login). Now `requireRole()` returns **401** for no/expired
> session vs **403** for wrong role across all `/api/client/*`; the app also
> proactively refreshes on token `exp`. Trainer/admin routes migrate in Phase 3.

| Screen                                  | Endpoint(s)                                                      | Status        |
| --------------------------------------- | ---------------------------------------------------------------- | ------------- |
| Dashboard (counts, next/active session) | `GET /api/client/dashboard`                                      | ✅ done       |
| Sessions list & detail                  | `GET /api/client/sessions`, `/api/client/sessions/[id]`          | ✅ done       |
| Profile (info + sign out)               | from `/api/auth/me` session                                      | ✅ done       |
| Live session timer                      | Pusher channel + session detail                                  | ☐ Phase 4     |
| Workout history                         | `GET /api/client/workouts`                                       | ✅ done       |
| Progress charts                         | `GET /api/client/progress` (+ `/charts`) → fl_chart              | ✅ done       |
| Badges                                  | `GET /api/client/badges`                                         | ✅ done       |
| Mark unavailability                     | `GET/POST/DELETE /api/client/unavailability`                     | ✅ done       |
| Reschedule requests                     | `GET/POST /api/client/reschedule-requests`                       | ✅ done       |
| Community feed (if in scope)            | `GET /api/community/feed`, posts/react/comments                  | ☐ TBD         |
| Profile image (avatar)                  | proxy `GET/POST/DELETE /api/client/profile/image` (image_picker) | ✅ done       |
| Settings (edit name/phone/etc.)         | `PUT` user shape                                                 | ☐ not started |

> **Phase 3 started early (2026-06-14):** the **shared workout logger** (ADR-036 —
> the session's client _or_ trainer may save) was built **client-first, online**,
> since it unlocks client self-logging in the already-shipped Client app. The
> client session-detail now has a **Log/Edit workout** button → logger screen
> (exercise-library search/picker, add/edit/remove exercises + sets, mark-complete,
> full-snapshot save to `POST /api/sessions/[id]/workouts`). Verified E2E: a client
> token writes (201), idempotent net-zero re-post. **Still online-only** — the
> offline Drift queue (§5) is the next increment and is required by rule #3 before
> gym-floor use. The Trainer shell will reuse this same logger.

### Trainer (Phase 3 — includes the hard offline path)

| Screen                                       | Endpoint(s)                                              |
| -------------------------------------------- | -------------------------------------------------------- |
| Client list                                  | `GET /api/trainer/clients`                               |
| Client detail (history, progress, last sets) | `/api/trainer/clients/[id]/*`                            |
| Schedule                                     | `GET /api/trainer/schedule` → table_calendar             |
| Session start / end / no-show                | `POST /api/trainer/sessions/[id]/{start,end,no-show}`    |
| **Workout logger (offline-first)**           | `POST /api/sessions/[id]/workouts` (see §5)              |
| Progress editing                             | `PUT` progress endpoints                                 |
| Leaves                                       | `GET/POST /api/trainer/leaves`                           |
| Reschedule approve/reject                    | `/api/trainer/reschedule-requests/[id]/{approve,reject}` |

---

## 5. Offline-first workout logging (the riskiest feature)

> **Built (2026-06-14) — core offline layer shipped in `mobile/lib/src/features/workout/`.**
> The logger is now write-local-first + connectivity-driven diff sync. What landed and
> where it diverged from the original sketch below:
>
> - **Local store (Drift):** `app_database.dart` — `WorkoutDraftRows` (one row per session:
>   `draftJson` full editable snapshot, `baselineJson` last-synced save payload, `syncStatus`
>   pending|synced|failed) + `CachedExerciseRows`. **Per-session snapshot + baseline, not a
>   per-set `workout_queue`** — this matches how the web logger actually works post-ADR-041
>   (a `lastSavedPayloadRef` diffed against the current payload). Codegen needs
>   `dart run build_runner build --force-jit` (sqlite3's native-asset hook breaks the default
>   AOT entrypoint compile). Store contracts live in `local/workout_local_store.dart` with an
>   `InMemoryWorkoutStore` for tests.
> - **Write path:** the logger saves to Drift first, then `WorkoutSyncService.saveLocalAndSync`
>   flushes if online. Offline saves stay `pending` and show an on-device banner.
> - **Sync = scoped diff, not full-replace (ADR-041).** `diffExercises(baseline, current)` in
>   `domain/save_payload.dart` derives `dirtyExerciseIds` / `removedExerciseIds` /
>   `removedSetsByExerciseId` and POSTs those. **Idempotency comes from the diff being net-zero
>   on re-send** (sets upsert by number, deletes are explicit) — so no server `localId` upsert
>   was needed (the route doesn't accept one anyway). `connectivity_plus` drives the flush;
>   foreground save + app-resume + connectivity-return all trigger it.
> - **Exercise library cache:** `WorkoutRepository` searches the server online (caching results)
>   and falls back to the Drift cache offline; `prefetchExerciseLibrary()` warms it on login.
> - **Session continuity:** opening the logger _anchors_ a synced record (server snapshot) so
>   the session is editable if connectivity drops mid-edit, and a re-open restores unsynced edits.
>
> **Deferred:** `workmanager` true OS-background sync (needs iOS BGTaskScheduler config + can't
> verify on a simulator; the foreground/resume/connectivity path covers the gym-floor case —
> `WorkoutSyncService.flushPending` is the seam a headless task would call). Live session-timer
> continuity (the rest-timer pill) is Phase 4 real-time work, not part of this increment.
> **Not yet verified in airplane mode on the sim** — unit-tested (diff + sync engine, 18 cases);
> needs a real on-device offline→online E2E pass.

Original sketch (kept for reference):

- **Local store (Drift):** `workout_queue` (localId UUID, sessionInstanceId, exerciseId,
  sets JSON, syncStatus pending|synced|failed), `exercise_cache`, `session_state`.
- **Write path:** UI writes to Drift first (instant), enqueues a sync job.
- **Sync:** `connectivity_plus` + `workmanager` flush `pending` rows to
  `POST /api/sessions/[id]/workouts`; mark `synced`/`failed`; idempotent via `localId`
  (server should upsert on localId to make retries safe).
- **Exercise library cache:** pull `GET /api/exercises` on login + refresh; search local.
- **Session continuity:** persist active-session state so a cold start mid-session
  restores the timer and queued sets.

Test with airplane mode end-to-end. This is the one feature where parity matters most —
the trainer logs on the gym floor with flaky wifi.

---

## 6. Real-time & push

- **Pusher:** reuse the existing app, cluster, channels, and event names. Subscribe on
  the session/timer screens. Private channels authenticate via a Bearer-aware auth route.
- **FCM:** `firebase_core` + `firebase_messaging`; iOS needs an APNs key in the Firebase
  console + push capability + background modes. Register the native token through the
  existing `FcmToken` flow; the server already sends via `firebase-admin`.

---

## 7. Flutter project structure (scaffolded — `mobile/`)

```
mobile/
├── pubspec.yaml                     # riverpod, go_router, dio, secure_storage, fl_chart
└── lib/
    ├── main.dart                    # ProviderScope + MaterialApp.router
    └── src/
        ├── core/
        │   ├── config/app_config.dart        # API base URL via --dart-define
        │   ├── network/api_client.dart       # dio + Bearer + { data }/{ error } envelope
        │   ├── network/api_exception.dart
        │   ├── storage/token_storage.dart    # secure keychain tokens
        │   └── theme/app_theme.dart          # dark-first Material 3
        ├── routing/app_router.dart           # go_router role-based redirect (mirrors middleware.ts)
        └── features/
            ├── auth/      {domain, data, application, presentation}
            ├── client/    {data, presentation}   # dashboard wired to /api/client/dashboard
            ├── trainer/   {presentation}         # shell (Phase 3)
            └── shared/    {presentation}         # splash
```

Codegen (retrofit/freezed/drift) is intentionally **deferred** so the scaffold runs with
just `flutter pub get`. Add `build_runner` when models/endpoints stabilise.

### Run it

```bash
cd mobile
flutter pub get
# iOS simulator against local Next.js dev server:
flutter run --dart-define=API_BASE_URL=http://localhost:3000
# Physical device: use your machine's LAN IP, not localhost.
```

> Login won't succeed until Phase 0 ships `/api/mobile/auth/login`. The auth → API → UI
> loop (secure storage, Bearer interceptor, role redirect, dashboard fetch) is fully wired.

---

## 8. CI/CD & release

- **Codemagic** (or Fastlane) for build + signing + store delivery.
- Flavors: dev / staging / prod via `--dart-define` (API_BASE_URL, Pusher key, Firebase config).
- iOS: Apple Developer account, APNs key, App Store Connect, privacy manifest (`PrivacyInfo.xcprivacy`).
- Android: Play Console, signing key, `ANDROID_HOME` set up (currently unset on this machine).
- Distribute via TestFlight (iOS) + Play Internal Testing before public release.

---

## 9. Phases & effort (1–2 Flutter devs)

| Phase | Work                                                                                                      | Est.            |
| ----- | --------------------------------------------------------------------------------------------------------- | --------------- |
| 0     | Backend mobile auth + Bearer shim **(✅ done)** + signed upload **(✅ done)**; Pusher/FCM auth (deferred) | 2–3 wks         |
| 1     | Flutter foundation (**scaffolded**) — finish design system, dio refresh, CI, flavors                      | 2–3 wks         |
| 2     | Client role MVP → TestFlight/Internal **(in progress: shell+dashboard+sessions+profile done)**            | 3–4 wks         |
| 3     | Trainer role + **offline workout logger**                                                                 | 4–6 wks         |
| 4     | Real-time + native push hardening                                                                         | 1–2 wks         |
| 5     | Store launch (App Store + Play)                                                                           | 1–2 wks         |
| —     | **Trainer + Client mobile, end-to-end**                                                                   | **~4–5 months** |

---

## 10. Open risks / decisions

- ~~**Refresh-token strategy**~~ — **RESOLVED (2026-06-13):** dedicated `MobileRefreshToken`
  table with rotation chains (`familyId`) + reuse detection (presenting a revoked token
  revokes the whole family). Per-device revoke + `?all=true` logout-everywhere. Raw tokens
  are never stored (only sha256 hash).
- **Offline write idempotency** — server upsert keyed on `localId` is required for safe
  retries; confirm `POST /api/sessions/[id]/workouts` supports it.
- **Community module** — in scope for mobile or web-only? (not yet decided)
- **Kickboxing/Crossfit trainer roles** — share the Trainer shell or defer? They route to
  `/trainer` today; the app treats them as trainers for now.
- **Design system** — match the web Tailwind theme exactly, or a mobile-native restyle?
- **Android toolchain** — `ANDROID_HOME` is unset; set up the Android SDK before Phase 5.

```

```
