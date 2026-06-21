---
name: run-mobile
description: Launch and drive the Sector 7 Flutter app (mobile/) on the iOS simulator, the Android emulator, or both, wired to the local Next.js backend. Use when asked to run, start, screenshot, or drive the mobile / Flutter app on a simulator/emulator.
---

# Run the Sector 7 mobile app (Flutter) on simulators

The Flutter app lives in `mobile/`. It talks to the local Next.js dev server
(`localhost:3000`), which itself needs the local Docker Postgres + Redis.

## Quick start

```bash
.claude/skills/run-mobile/run.sh both       # iOS + Android (sequential build)
.claude/skills/run-mobile/run.sh ios         # iOS only
.claude/skills/run-mobile/run.sh android     # Android only
```

The script checks the backend is up, boots a sim/emulator if none is running,
then `flutter run`s in the background with the correct `--dart-define`s. Logs go
to `/tmp/flutter_ios.log` / `/tmp/flutter_android.log`; the PID to
`/tmp/flutter_{ios,android}.pid`. First build takes a few minutes; the script
waits and prints the Dart VM Service URL when each is up.

## Prerequisites

- **Backend on :3000** — `(cd <repo-root> && npm run dev)`. Needs Docker:
  `docker compose up -d postgres redis`. Verify with `lsof -iTCP:3000 -sTCP:LISTEN`.
- **A booted device** — `flutter devices` lists them. The script boots one if
  needed (Simulator.app for iOS, the first AVD for Android).

## The one thing that bites: the backend host differs per platform

- **iOS sim** shares the host network → `API_BASE_URL=http://localhost:3000`.
- **Android emulator** can't reach `localhost` (that resolves to the emulator
  itself) → `API_BASE_URL=http://10.0.2.2:3000` (the alias to the host loopback).

## Manual launch (what the script runs)

```bash
# iOS — booted UDID from: xcrun simctl list devices booted
cd mobile && flutter run -d <iOS-UDID> \
  --dart-define=API_BASE_URL=http://localhost:3000 \
  --dart-define=PUSHER_KEY=ece8742c042e0a7fcebf \
  --dart-define=PUSHER_CLUSTER=ap1

# Android — device id from: adb devices  (e.g. emulator-5554)
cd mobile && flutter run -d emulator-5554 \
  --dart-define=API_BASE_URL=http://10.0.2.2:3000 \
  --dart-define=PUSHER_KEY=ece8742c042e0a7fcebf \
  --dart-define=PUSHER_CLUSTER=ap1
```

`PUSHER_KEY` / `PUSHER_CLUSTER` are the _public_ web values
(`NEXT_PUBLIC_PUSHER_KEY` / `_CLUSTER`, safe to commit). Omit them and realtime
disables gracefully — screens fall back to pull-to-refresh.

## Test login (seeded; persists via secure storage)

- Trainer: `dev@gmail.com` / `password123` (Test Devanand — has parallel active sessions, good for the session switcher)
- Client: `ammu@gmail.com` / `password123`

API smoke test (mint a token, hit a route):

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/mobile/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"dev@gmail.com","password":"password123"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['accessToken'])")
curl -s "http://localhost:3000/api/trainer/schedule?status=IN_PROGRESS" -H "Authorization: Bearer $TOKEN"
```

## Screenshots

```bash
# iOS
xcrun simctl io <iOS-UDID> screenshot /tmp/ios.png

# Android — `exec-out screencap` sometimes returns 0 bytes; shell+pull is reliable
ADB="$HOME/Library/Android/sdk/platform-tools/adb"
"$ADB" -s emulator-5554 shell screencap -p /sdcard/s.png && "$ADB" -s emulator-5554 pull /sdcard/s.png /tmp/android.png
```

## Driving (taps)

- **Android:** `adb -s emulator-5554 shell input tap X Y` — coords are device
  pixels (e.g. 1080×2400). Read them off a screenshot.
- **iOS sim:** no built-in tap (`simctl` has none; `idb` is broken here on
  python3.14). Drive iOS by hand, or just screenshot to verify rendering.

## Gotchas

- `adb` is often not on PATH — full path: `$HOME/Library/Android/sdk/platform-tools/adb`.
- The background `flutter run` is detached (`nohup`), so you can't send `r`/`R`
  for hot reload. To apply code changes, **re-run the script** (it kills the prior
  run for that device first) — a relaunch is effectively a hot restart.
- Launching **both** builds them sequentially (iOS then Android) to avoid a
  shared `.dart_tool` build race.
- `--dart-define`s are baked at build time — changing them requires a relaunch,
  not a hot reload.
- After a `git checkout` / branch switch, regenerate the Prisma client and restart
  the backend (`cd <repo> && npx prisma generate`) before trusting the app's data.
