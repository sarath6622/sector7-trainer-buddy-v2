# Change Management — Sector 7

> How changes flow through the system. Every agent follows this protocol.

---

## Memory Files Are Living Documents

After every task completion, the agent MUST update relevant memory files:

| What Changed                    | Update This File                            |
| ------------------------------- | ------------------------------------------- |
| Database schema modified        | `memory/schema.md` + run `prisma generate`  |
| New API route added/changed     | `memory/api-contracts.md`                   |
| New architectural decision made | `memory/decisions.md` (append new ADR)      |
| System architecture changed     | `memory/architecture.md`                    |
| New dependency added            | `memory/architecture.md` (tech stack table) |

**If you don't update memory files, the next agent session will have stale context.**

---

## Task Lifecycle

```
BACKLOG → ASSIGNED → IN PROGRESS → TESTING → COMPLETE
```

1. **BACKLOG:** Task sits in `tasks/backlog.md` with status `[ ]`
2. **ASSIGNED:** Operator assigns task → agent writes it to `tasks/current-task.md`
3. **IN PROGRESS:** Agent implements the task
4. **TESTING:** Agent writes tests, runs them, verifies
5. **COMPLETE:** Agent moves task to `tasks/completed-tasks.md` with completion notes

---

## Current Task File Format

```markdown
# Current Task

## Task ID: S7-F1-03

## Title: Implement PT Session Scheduling

## Agent: @backend

## Dependencies: S7-F1-01 (schema), S7-F1-02 (user CRUD)

## Status: IN PROGRESS

### Acceptance Criteria

1. Admin can create a recurring weekly schedule for a client-trainer pair
2. System generates session instances for the specified month
3. Conflict detection returns warnings for overlapping sessions
4. All operations are branch-scoped and audit-logged

### Notes

- API contracts defined in memory/api-contracts.md under "Admin Routes > Scheduling"
- Schema ready: SessionSchedule + SessionInstance models
```

---

## Completed Task Entry Format

```markdown
### S7-F1-03: Implement PT Session Scheduling

- **Agent:** @backend
- **Completed:** 2026-04-05
- **Files Changed:**
  - `src/app/api/admin/schedules/route.ts` (created)
  - `src/app/api/admin/schedules/[id]/route.ts` (created)
  - `src/app/api/admin/schedules/generate/route.ts` (created)
  - `src/services/schedule.service.ts` (created)
  - `tests/unit/services/schedule.service.test.ts` (created)
  - `tests/integration/api/admin-schedules.test.ts` (created)
- **Memory Updated:** api-contracts.md (no changes, implemented as defined)
- **Notes:** Conflict detection returns overlap details. Month generation creates instances for all active schedules.
```

---

## Contract Change Protocol

If a backend agent discovers that an API contract needs to change:

1. **STOP** implementation
2. **Document** the proposed change and reason
3. **Ask** the operator for approval
4. If approved: **update** `memory/api-contracts.md` FIRST
5. Then implement the change
6. Update any UI code that depends on the changed contract

**Never silently change a contract.** The UI agent depends on it.

---

## Schema Change Protocol

Only the architect agent modifies `prisma/schema.prisma`. If any other agent needs a schema change:

1. **Document** the need in `tasks/current-task.md`
2. **Ask** the operator to assign a schema task to @architect
3. Wait for schema change to be complete before continuing

---

## Dependency Addition Protocol

Before adding a new npm package:

1. Check if the functionality already exists in the current stack
2. Evaluate: size, maintenance status, TypeScript support, license
3. Add to `memory/architecture.md` tech stack table
4. Log reasoning in `memory/decisions.md` if it's a significant choice

---

## Rollback Protocol

If an implementation breaks something:

1. Identify the breaking change
2. Revert the specific files (not the whole task)
3. Document what broke and why in the task completion notes
4. Re-implement with the fix
5. Add a regression test
