#!/usr/bin/env bash
#
# Launch the Sector 7 Flutter app (mobile/) on the iOS simulator, the Android
# emulator, or both — wired to the local Next.js backend on :3000.
#
#   run.sh [ios|android|both]      (default: both)
#
# Backgrounds each `flutter run`; logs -> /tmp/flutter_{ios,android}.log,
# PID -> /tmp/flutter_{ios,android}.pid. See SKILL.md for the why behind the
# localhost vs 10.0.2.2 split and the other gotchas.

set -uo pipefail

TARGET="${1:-both}"
case "$TARGET" in ios|android|both) ;; *) echo "usage: run.sh [ios|android|both]"; exit 2 ;; esac

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SKILL_DIR/../../.." && pwd)"
MOBILE_DIR="$REPO_ROOT/mobile"
ADB="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}/platform-tools/adb"

# Public web Pusher values (NEXT_PUBLIC_PUSHER_KEY / _CLUSTER) — safe to commit.
PUSHER_KEY="ece8742c042e0a7fcebf"
PUSHER_CLUSTER="ap1"
BACKEND_PORT="${BACKEND_PORT:-3000}"

UDID_RE='[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}'

# --- backend reachability (warn, don't block) ---
if ! lsof -iTCP:"$BACKEND_PORT" -sTCP:LISTEN -n -P >/dev/null 2>&1; then
  echo "⚠️  Nothing is listening on :$BACKEND_PORT — the app will show network errors."
  echo "    Start the backend:  (cd \"$REPO_ROOT\" && npm run dev)"
  echo "    It needs Docker:    docker compose up -d postgres redis"
  echo
fi

wait_for() { # <logfile> <label>
  local log="$1" label="$2" i
  echo "   waiting for $label to come up (first build can take a few minutes)…"
  for i in $(seq 1 40); do
    grep -qE "Flutter run key commands|^Error|FAILURE|Could not|Unable to" "$log" 2>/dev/null && break
    sleep 15
  done
  if grep -q "Flutter run key commands" "$log" 2>/dev/null; then
    echo "✅ $label is up — VM service: $(grep -oE 'http://127.0.0.1:[0-9]+/[^ ]+' "$log" | tail -1)"
  else
    echo "⚠️  $label not confirmed; tail of $log:"; tail -n 6 "$log"
  fi
}

launch() { # <label> <device-id> <api-base-url> <logfile> <pidfile>
  local label="$1" dev="$2" api="$3" log="$4" pid="$5"
  if [ -f "$pid" ]; then kill "$(cat "$pid")" 2>/dev/null && echo "   (killed prior $label run)"; fi
  echo "▶️  $label on $dev  → $api"
  ( cd "$MOBILE_DIR" && nohup flutter run -d "$dev" \
      --dart-define=API_BASE_URL="$api" \
      --dart-define=PUSHER_KEY="$PUSHER_KEY" \
      --dart-define=PUSHER_CLUSTER="$PUSHER_CLUSTER" \
      > "$log" 2>&1 & echo $! > "$pid" )
  echo "   log: $log   pid: $(cat "$pid")"
  wait_for "$log" "$label"
}

run_ios() {
  local udid
  udid="$(xcrun simctl list devices booted 2>/dev/null | grep -oE "$UDID_RE" | head -1)"
  if [ -z "$udid" ]; then
    echo "No booted iOS simulator — opening Simulator.app…"
    open -a Simulator
    for _ in $(seq 1 20); do
      udid="$(xcrun simctl list devices booted 2>/dev/null | grep -oE "$UDID_RE" | head -1)"
      [ -n "$udid" ] && break; sleep 2
    done
  fi
  [ -z "$udid" ] && { echo "❌ Could not boot an iOS simulator — open Simulator.app manually."; return 1; }
  launch "iOS" "$udid" "http://localhost:$BACKEND_PORT" /tmp/flutter_ios.log /tmp/flutter_ios.pid
}

run_android() {
  local dev avd
  dev="$("$ADB" devices 2>/dev/null | awk '/emulator-/{print $1; exit}')"
  if [ -z "$dev" ]; then
    avd="$(flutter emulators 2>/dev/null | awk -F'•' 'tolower($0) ~ /android/ {gsub(/^[ \t]+|[ \t]+$/,"",$1); print $1; exit}')"
    if [ -n "$avd" ]; then
      echo "No running Android emulator — launching AVD '$avd'…"
      flutter emulators --launch "$avd" >/dev/null 2>&1
      for _ in $(seq 1 30); do
        dev="$("$ADB" devices 2>/dev/null | awk '/emulator-/{print $1; exit}')"
        [ -n "$dev" ] && break; sleep 2
      done
    fi
  fi
  [ -z "$dev" ] && { echo "❌ No Android emulator running. Start one: flutter emulators --launch <avd>"; return 1; }
  launch "Android" "$dev" "http://10.0.2.2:$BACKEND_PORT" /tmp/flutter_android.log /tmp/flutter_android.pid
}

# `both` builds sequentially (iOS then Android) to avoid a shared .dart_tool race.
case "$TARGET" in
  ios)     run_ios ;;
  android) run_android ;;
  both)    run_ios; echo; run_android ;;
esac
