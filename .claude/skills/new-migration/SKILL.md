---
name: new-migration
description: Create and apply a Prisma migration safely under Sector 7 Rule 0 — always against the LOCAL Docker Postgres first, never Neon. Use whenever changing prisma/schema.prisma, adding a model/field/index, or running prisma migrate / db push.
---

# Create a Prisma migration (Rule 0 — local DB first)

> **Rule 0:** Never run `prisma migrate dev` or `prisma db push` against any
> remote/production database. All schema changes hit the **local Docker Postgres
> first**, are verified working, and only then get committed and deployed.

## The footgun this prevents

- `.env` → **Neon (remote)** — Prisma's CLI reads this file **by default**.
- `.env.local` → **local Docker** (`postgresql://sector7:sector7pass@localhost:5432/sector7`)
- The Next.js dev server uses `.env.local`, but `prisma migrate dev` uses `.env`.
  So a naive `npx prisma migrate dev` silently runs against **Neon**. Always force
  the local URL.

## Steps

1. **Make sure local Postgres is up:**

   ```bash
   docker compose up -d        # starts Postgres + Redis (docker-compose.yml)
   docker ps                   # confirm the postgres container is running
   ```

2. **Edit `prisma/schema.prisma`** — add/modify the model, field, relation, or index.

3. **Create + apply the migration against LOCAL Docker** (force the local URL so it
   cannot touch Neon):

   ```bash
   DATABASE_URL='postgresql://sector7:sector7pass@localhost:5432/sector7' \
     npx prisma migrate dev --name <descriptive-name>
   ```

4. **Regenerate the Prisma client:**

   ```bash
   npx prisma generate
   ```

   Then **restart the dev server** — a regenerated client is not picked up by a
   running `next dev` (stale-client gotcha, especially after a branch checkout).

5. **Verify** the code works against the new schema locally (run the app / tests).

6. **Commit together** in the same PR: the new folder under `prisma/migrations/`
   **and** the updated `prisma/schema.prisma`.

## Deploying later (separate, deliberate step)

Applying to Neon is a conscious deploy action, done with `prisma migrate deploy`
(not `migrate dev`) once the migration is proven locally — never as part of dev work.

## Guardrail

A PreToolUse hook (`.claude/hooks/prisma-migration-guard.sh`) intercepts any
`prisma migrate` / `db push` command that would target a **remote** host and forces
a confirmation prompt. If you see that prompt, you almost certainly meant to add the
local `DATABASE_URL=...localhost:5432...` prefix above.
