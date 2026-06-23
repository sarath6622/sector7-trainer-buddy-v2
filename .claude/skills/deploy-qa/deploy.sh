#!/usr/bin/env bash
#
# Deploy the current branch to the remote `qa` branch so Vercel rebuilds the qa
# Preview for on-device Flutter testing. `qa` is a pure DEPLOYMENT POINTER — it is
# only ever fast-forwarded from a feature/dev branch, never committed on directly.
# Production (`main` = the PWA) is never touched.
#
#   deploy-qa/deploy.sh            # push current branch tip -> origin/qa (FF only)
#
# Env: QA_REMOTE (default: origin)

set -uo pipefail

REMOTE="${QA_REMOTE:-origin}"
QA_BRANCH="qa"

git rev-parse --git-dir >/dev/null 2>&1 || { echo "❌ not a git repo"; exit 1; }

BRANCH="$(git branch --show-current)"
HEAD_SHA="$(git rev-parse --short HEAD)"

case "$BRANCH" in
  "$QA_BRANCH") echo "❌ You're on '$QA_BRANCH' itself. Deploy FROM your feature/dev branch."; exit 2 ;;
  main)         echo "❌ Refusing to push 'main' to qa. Deploy from a feature/dev branch."; exit 2 ;;
esac

# Uncommitted work won't be deployed — warn (don't block).
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "⚠️  Working tree has uncommitted changes — they will NOT be deployed."
  echo "    Commit them first if you want them on qa. (Ctrl-C to abort.)"
fi

git fetch -q "$REMOTE" "$QA_BRANCH" 2>/dev/null || true
REMOTE_QA="$(git rev-parse -q --verify "refs/remotes/$REMOTE/$QA_BRANCH" 2>/dev/null || true)"

if [ -n "$REMOTE_QA" ]; then
  if [ "$REMOTE_QA" = "$(git rev-parse HEAD)" ]; then
    echo "✓ $REMOTE/$QA_BRANCH already at $HEAD_SHA — nothing to deploy."
    exit 0
  fi
  # Fast-forward guarantee: remote qa MUST be an ancestor of HEAD.
  if ! git merge-base --is-ancestor "$REMOTE_QA" HEAD; then
    echo "❌ $REMOTE/$QA_BRANCH ($(git rev-parse --short "$REMOTE_QA")) is NOT an ancestor of HEAD ($HEAD_SHA)."
    echo "   qa has DIVERGED from this branch — a push would need --force (not done here)."
    echo "   Someone likely committed directly on qa (against protocol). Inspect:"
    echo "     git log --oneline HEAD..$REMOTE/$QA_BRANCH    # commits only on qa"
    exit 3
  fi
fi

echo "▶️  Pushing $BRANCH ($HEAD_SHA) → $REMOTE/$QA_BRANCH (fast-forward)…"
git push "$REMOTE" "HEAD:$QA_BRANCH"

cat <<'EOF'

✅ Pushed. Vercel will rebuild the qa Preview; the stable branch alias
   (…-git-qa-<scope>.vercel.app) auto-follows — no URL change needed.
   Relaunch devices against the new build:
     .claude/skills/run-mobile/run.sh both qa
   Production (main / the PWA) is untouched.
EOF
