#!/usr/bin/env bash
#
# Launch the Sector 7 Flutter app (mobile/) on the iOS simulator, the Android
# emulator, or both — wired to a local OR remote (QA/Vercel) backend.
#
#   run.sh [ios|android|both] [local|qa|<api-base-url>]   (defaults: both local)
#
# Backend mode (2nd arg):
#   local (default)  Local Next.js dev server on :BACKEND_PORT. iOS uses
#                    http://localhost:PORT, Android http://10.0.2.2:PORT.
#   qa               Vercel `qa` preview deployment. URL is read from
#                    $QA_API_BASE_URL, else from this skill's qa-url.local file.
#                    Both platforms use that one https URL (no localhost split).
#   <api-base-url>   Any explicit base URL (e.g. http://192.168.1.2:3000 for a
#                    physical device on the LAN, or a staging URL). Used as-is
#                    for both platforms.
#
# Backgrounds each `flutter run`; logs -> /tmp/flutter_{ios,android}.log,
# PID -> /tmp/flutter_{ios,android}.pid. See SKILL.md for the why behind the
# localhost vs 10.0.2.2 split and the other gotchas.

set -uo pipefail

TARGET="${1:-both}"
case "$TARGET" in ios|android|both) ;; *) echo "usage: run.sh [ios|android|both] [local|qa|<url>]"; exit 2 ;; esac

MODE="${2:-local}"

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SKILL_DIR/../../.." && pwd)"
MOBILE_DIR="$REPO_ROOT/mobile"
ADB="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}/platform-tools/adb"

# Public web Pusher values (NEXT_PUBLIC_PUSHER_KEY / _CLUSTER) — safe to commit.
PUSHER_KEY="ece8742c042e0a7fcebf"
PUSHER_CLUSTER="ap1"
BACKEND_PORT="${BACKEND_PORT:-3000}"

UDID_RE='[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}'

# --- resolve backend mode -> API_OVERRIDE (empty = local per-platform split) ---
API_OVERRIDE=""
case "$MODE" in
  local) ;;
  http://*|https://*) API_OVERRIDE="$MODE" ;;
  qa)
    API_OVERRIDE="${QA_API_BASE_URL:-}"
    if [ -z "$API_OVERRIDE" ] && [ -f "$SKILL_DIR/qa-url.local" ]; then
      API_OVERRIDE="$(tr -d ' \t\r\n' < "$SKILL_DIR/qa-url.local")"
    fi
    if [ -z "$API_OVERRIDE" ]; then
      echo "❌ qa mode needs the Vercel preview URL. Set it once, then re-run:"
      echo "     echo 'https://sector7-trainer-buddy-v2-git-qa-<scope>.vercel.app' > \"$SKILL_DIR/qa-url.local\""
      echo "   (or export QA_API_BASE_URL=…). Find it in the Vercel dashboard:"
      echo "   Project → Deployments → the qa branch deploy → Domains (prefer the"
      echo "   stable …-git-qa-<scope>.vercel.app alias over a per-deploy hash URL)."
      exit 2
    fi ;;
  *) echo "usage: run.sh [ios|android|both] [local|qa|<url>]"; exit 2 ;;
esac

# --- backend reachability (warn, don't block) ---
if [ -z "$API_OVERRIDE" ]; then
  if ! lsof -iTCP:"$BACKEND_PORT" -sTCP:LISTEN -n -P >/dev/null 2>&1; then
    echo "⚠️  Nothing is listening on :$BACKEND_PORT — the app will show network errors."
    echo "    Start the backend:  (cd \"$REPO_ROOT\" && npm run dev)"
    echo "    It needs Docker:    docker compose up -d postgres redis"
    echo
  fi
else
  echo "🌐 Remote backend: $API_OVERRIDE"
  body="$(curl -s --max-time 15 "$API_OVERRIDE/api/auth/me" 2>/dev/null)"; rc=$?
  if [ $rc -ne 0 ]; then
    echo "⚠️  Could not reach it (timeout/DNS) — check the URL / that the deploy is live."
  elif printf '%s' "$body" | grep -qiE 'vercel.*authentication|_vercel_sso_nonce|Authentication Required|Vercel Security Checkpoint'; then
    echo "⚠️  It is behind Vercel Deployment Protection — the app's API calls will be blocked."
    echo "    Disable for Preview: Vercel → Project → Settings → Deployment Protection."
  else
    echo "   reachable ✓ (note: this hits the deployment's DB — use TEST users only)"
  fi
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
  launch "iOS" "$udid" "${API_OVERRIDE:-http://localhost:$BACKEND_PORT}" /tmp/flutter_ios.log /tmp/flutter_ios.pid
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
  launch "Android" "$dev" "${API_OVERRIDE:-http://10.0.2.2:$BACKEND_PORT}" /tmp/flutter_android.log /tmp/flutter_android.pid
}

# `both` builds sequentially (iOS then Android) to avoid a shared .dart_tool race.
case "$TARGET" in
  ios)     run_ios ;;
  android) run_android ;;
  both)    run_ios; echo; run_android ;;
esac
