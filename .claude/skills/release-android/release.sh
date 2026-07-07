#!/usr/bin/env bash
#
# Build a signed release APK (QA backend baked in) and upload it to Firebase
# App Distribution for the internal Android beta. See memory/decisions.md ADR-047.
# iOS beta is gated on a paid Apple Developer account and is intentionally NOT
# handled here.
#
#   release-android/release.sh [tester-group]      (default group: beta)
#
# Env overrides:
#   API_BASE_URL  backend baked into the build (default: the qa deploy from
#                 .claude/skills/run-mobile/qa-url.local)
#   FAD_GROUPS    comma-separated App Distribution tester group alias(es)
#   FAD_TESTERS   comma-separated tester emails (used instead of groups)
#   FAD_NOTES     release notes (default: branch @ sha (date) → backend)

set -uo pipefail

# Firebase Android app id (from flutterfire configure / google-services.json).
ANDROID_APP_ID="1:184622370860:android:640dd9a87cb8872bb90189"
PUSHER_KEY="ece8742c042e0a7fcebf"
PUSHER_CLUSTER="ap1"

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SKILL_DIR/../../.." && pwd)"
MOBILE_DIR="$REPO_ROOT/mobile"
APK="$MOBILE_DIR/build/app/outputs/flutter-apk/app-release.apk"

# NB: do NOT name this `GROUPS` — that's a reserved bash special array holding
# the current user's group IDs (assignments to it are silently ignored), so the
# value would always read back as the primary GID (20 = staff on macOS) and
# distribute would 404 on a non-existent group "20".
FAD_GROUP="${FAD_GROUPS:-${1:-beta}}"

# Backend baked into the build (default: the qa Vercel deploy the beta points at).
API="${API_BASE_URL:-$(tr -d ' \t\r\n' < "$REPO_ROOT/.claude/skills/run-mobile/qa-url.local" 2>/dev/null)}"
[ -n "$API" ] || { echo "❌ No backend URL. Set API_BASE_URL or run-mobile/qa-url.local"; exit 2; }

command -v firebase >/dev/null 2>&1 || { echo "❌ firebase CLI not found — npm i -g firebase-tools"; exit 1; }
firebase projects:list >/dev/null 2>&1 || { echo "❌ Not logged in — run: firebase login"; exit 1; }

# Warn if the build number isn't bumped — the force-update gate keys on it, and
# distinct App Distribution builds want distinct versionCodes.
VER="$(grep -E '^version:' "$MOBILE_DIR/pubspec.yaml" | awk '{print $2}')"
case "$VER" in
  *+*) ;;  # has a +buildNumber
  *) echo "⚠️  pubspec version '$VER' has no +buildNumber → versionCode defaults to 1."
     echo "    Bump it (e.g. version: $VER+2) before each release so the force-update"
     echo "    gate and App Distribution see distinct builds." ;;
esac

SHA="$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null)"
BRANCH="$(git -C "$REPO_ROOT" branch --show-current 2>/dev/null)"
NOTES="${FAD_NOTES:-$BRANCH @ $SHA ($(date +%Y-%m-%d)) → $API}"

echo "▶️  Building signed release APK"
echo "    backend: $API"
( cd "$MOBILE_DIR" && flutter build apk --release \
    --dart-define=API_BASE_URL="$API" \
    --dart-define=PUSHER_KEY="$PUSHER_KEY" \
    --dart-define=PUSHER_CLUSTER="$PUSHER_CLUSTER" ) || { echo "❌ build failed"; exit 1; }
[ -f "$APK" ] || { echo "❌ APK not found at $APK"; exit 1; }
echo "✅ Built $(du -h "$APK" | cut -f1) → $APK"

echo "▶️  Uploading to Firebase App Distribution"
DIST_ARGS=(--app "$ANDROID_APP_ID" --release-notes "$NOTES")
if [ -n "${FAD_TESTERS:-}" ]; then
  TARGET_DESC="testers $FAD_TESTERS"
  DIST_ARGS+=(--testers "$FAD_TESTERS")
else
  TARGET_DESC="group '$FAD_GROUP'"
  DIST_ARGS+=(--groups "$FAD_GROUP")
fi
echo "    → $TARGET_DESC"
firebase appdistribution:distribute "$APK" "${DIST_ARGS[@]}" || {
  echo "❌ Distribute failed. First time? Enable App Distribution in the Firebase"
  echo "   console, then add testers to $TARGET_DESC (or pass FAD_TESTERS=email)."
  exit 1
}

cat <<EOF

✅ Distributed to $TARGET_DESC. They get an email + a notification in the
   Firebase App Tester app, and install/update from there.
   Backend for this build: $API  (deploy backend changes with deploy-qa).
EOF
