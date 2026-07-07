---
name: deploy-qa
description: Deploy the current feature/dev branch to the remote `qa` branch (fast-forward push) so Vercel rebuilds the qa Preview for on-device Flutter testing, leaving Production (main / the PWA) untouched. Use when asked to deploy to qa, push a qa build, redeploy the qa preview, ship the latest to devices, or get changes onto the Vercel test backend.
---

# Deploy to the `qa` Preview (Flutter device testing)

`qa` is a **deployment pointer**, not a working branch. Development happens on
`feat/flutter-mobile-client-mvp` (or whatever feature/dev branch is active); when
you want a build on real devices, you **fast-forward `qa` to the branch tip** and
Vercel rebuilds the `qa` **Preview** deployment. Production (`main` = the PWA) is
never touched. See `memory/decisions.md` → **ADR-046** for the why.

## Deploy

```bash
.claude/skills/deploy-qa/deploy.sh
```

It refuses to run from `qa`/`main`, warns on uncommitted changes, **requires a
fast-forward** (errors if `qa` has diverged — i.e. someone committed on it
directly), then `git push origin HEAD:qa`.

## The full loop

```bash
# 1. work + commit on the feature/dev branch (NOT on qa)
git commit -m "feat(mobile): …"
# 2. deploy to qa  (fast-forward push → Vercel rebuilds the qa Preview)
.claude/skills/deploy-qa/deploy.sh
# 3. relaunch devices against the new build (see run-mobile skill)
.claude/skills/run-mobile/run.sh both qa
```

Equivalent one-liner for step 2 if you prefer raw git: `git push origin HEAD:qa`.

## Rules of the road

- **Never commit directly on `qa`.** It only ever fast-forwards from the dev
  branch, so it never diverges and there are no merge conflicts. (The script
  hard-fails the push if it would not be a fast-forward.)
- **The stable alias auto-follows.** `run-mobile`'s `qa-url.local` holds
  `…-git-qa-<scope>.vercel.app`, which always points at the latest `qa` deploy —
  so a redeploy needs no URL change, just a device relaunch.
- **Test users only.** The qa deploy shares the **same Neon DB as Production**, so
  any write touches real data. Log in with the seeded test users
  (`dev@gmail.com` / `ammu@gmail.com`, `password123`). The PWA front-end is
  untouched; only the data store is shared.
- **Deployment Protection must be OFF for Preview**, or the app's `/api/*` calls
  get a Vercel SSO page instead of JSON. `run-mobile` probes this on launch.
  Toggle at Vercel → Project → Settings → Deployment Protection.
- **Production is `main`.** Promoting qa-tested work to prod = a normal PR into
  `main` (the PWA's production branch). Pushing `qa` never affects it.
