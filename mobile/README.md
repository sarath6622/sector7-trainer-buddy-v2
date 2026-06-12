# Sector 7 — Mobile (Flutter)

Native iOS + Android client for the **Trainer** and **Client** roles. Talks to the
existing Next.js backend over REST (Bearer JWT). Admin and the gym TV display stay on
the web app.

Full plan: [`../docs/flutter-migration-plan.md`](../docs/flutter-migration-plan.md).

## Stack

Riverpod · go_router · dio · flutter_secure_storage · fl_chart. Offline (Drift),
push (firebase_messaging) and real-time (pusher_channels_flutter) are added in later
phases — see the plan.

## Run

```bash
flutter pub get
flutter run --dart-define=API_BASE_URL=http://localhost:3000   # simulator + local Next.js
# Physical device: replace localhost with your machine's LAN IP.
```

Login requires the Phase 0 backend endpoint `POST /api/mobile/auth/login`. Until that
ships, the app builds and runs but cannot authenticate. Everything else — secure token
storage, the Bearer interceptor, the `{ data }`/`{ error,code }` envelope handling, the
role-based router, and the dashboard fetch — is wired and ready.

## Layout

```
lib/src/
  core/      config · network (dio + envelope) · storage (secure tokens) · theme
  routing/   go_router with role redirect (mirrors src/middleware.ts)
  features/  auth · client · trainer · shared   (domain/data/application/presentation)
```
