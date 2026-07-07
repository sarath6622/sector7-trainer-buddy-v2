#!/usr/bin/env bash
# SessionStart hook: inject the Sector 7 mandatory pre-read protocol so context
# loading is never skipped, regardless of whether anyone remembers the skill.
cat <<'JSON'
{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"Sector 7 PRE-READ PROTOCOL (CLAUDE.md Rule 1): before writing or modifying ANY code/file this session, load project context — invoke the context-load skill, or read these in order: memory/project-context.md, memory/architecture.md, memory/schema.md, memory/api-contracts.md, memory/decisions.md, rules/engineering-principles.md, rules/coding-standards.md, rules/change-management.md, tasks/current-task.md. If tasks/current-task.md is empty or says 'No active task', STOP and ask the operator before starting work. For ANY Prisma schema change, use the new-migration skill — migrations run on LOCAL Docker first (Rule 0), never Neon."}}
JSON
