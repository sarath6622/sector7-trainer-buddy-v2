---
name: context-load
description: Load the mandatory Sector 7 project context — reads the 9 memory/rules/task files in the order required by CLAUDE.md before any code work begins. Use at the start of a session, after a branch switch, or whenever you are about to write/modify code and have not yet read the project memory.
---

# Load Sector 7 project context (mandatory pre-read)

`CLAUDE.md` requires reading the project memory **before writing any code, creating
any file, or modifying any file**. This skill performs STEP 1 of the per-task
workflow in one shot so context is never skipped.

## What to read (in this exact order)

Read every file below, in order. Do not skim — these encode domain rules,
schema, contracts, and decisions you must not violate.

1. `memory/project-context.md` → what this project is, domain model, business rules
2. `memory/architecture.md` → system architecture, folder structure, data flow
3. `memory/schema.md` → complete Prisma schema and entity relationships
4. `memory/api-contracts.md` → API routes, request/response shapes, WebSocket events
5. `memory/decisions.md` → architectural decision records (DO NOT reverse these)
6. `rules/engineering-principles.md` → non-negotiable engineering rules
7. `rules/coding-standards.md` → code style, naming conventions, patterns
8. `rules/change-management.md` → how changes flow, what to update after each task
9. `tasks/current-task.md` → what you are currently building

## After reading

- If `tasks/current-task.md` is empty or says "No active task", **STOP and ask the
  operator for a task assignment** — do not start work.
- Keep the 8 Non-Negotiable Rules from `CLAUDE.md` in mind, especially:
  branch-scoping (Rule 2), tests required (Rule 5), audit everything (Rule 6),
  and migrations on local DB first (Rule 0 — see the `new-migration` skill).

## Quick read (optional shortcut)

To pull the headings of every pre-read file at once for a fast orientation:

```bash
for f in memory/project-context.md memory/architecture.md memory/schema.md \
         memory/api-contracts.md memory/decisions.md \
         rules/engineering-principles.md rules/coding-standards.md \
         rules/change-management.md tasks/current-task.md; do
  echo "===== $f ====="; grep -nE '^#{1,3} ' "$f" 2>/dev/null || echo "(missing)"
done
```

Use the headings to orient, then read the full files relevant to the task.
