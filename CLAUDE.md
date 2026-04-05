# CLAUDE.md — Sector 7 AI Agent Constitution

> **This file is the single source of truth for all AI agent sessions working on the Sector 7 project.**
> Read this file completely before performing any work. No exceptions.

---

## Project Identity

- **Product:** Sector 7 — Gym Member Management & PT Session Platform
- **PRD Version:** v2.0 (March 2026)
- **Platform:** Progressive Web Application (PWA)
- **Repository:** Single Next.js repo (full-stack)
- **Operator:** Sarath Kumar (human orchestrator — all decisions route through Sarath)

---

## Mandatory Pre-Read Protocol

Before writing **any** code, creating **any** file, or modifying **any** existing file, you MUST read the following files in this exact order:

```
1. memory/project-context.md      → What this project is, domain model, business rules
2. memory/architecture.md         → System architecture, folder structure, data flow
3. memory/schema.md               → Complete Prisma schema and entity relationships
4. memory/api-contracts.md        → API routes, request/response shapes, WebSocket events
5. memory/decisions.md            → Architectural Decision Records (DO NOT reverse these)
6. rules/engineering-principles.md → Non-negotiable engineering rules
7. rules/coding-standards.md      → Code style, naming conventions, patterns
8. rules/change-management.md     → How changes flow, what gets updated after each task
9. tasks/current-task.md          → What you are currently building
```

**If `tasks/current-task.md` is empty or says "No active task", STOP and ask the operator for a task assignment.**

---

## Agent Roles

Each Claude Code session operates as ONE agent. The operator assigns the role at session start, or you infer it from the task.

| Agent          | Owns                                                                        | Never Touches                              |
| -------------- | --------------------------------------------------------------------------- | ------------------------------------------ |
| **@architect** | Schema, migrations, shared types, API contracts, architecture decisions     | UI components, page layouts                |
| **@backend**   | API routes (`app/api/`), server actions, services, middleware, integrations | UI components, client hooks                |
| **@ui**        | React components, pages, client hooks, Tailwind styles, charts              | API route handlers, Prisma queries, schema |
| **@devops**    | Docker, CI/CD, env config, deployment, monitoring                           | Application code                           |
| **@qa**        | Tests (unit, integration, e2e), test utilities, fixtures                    | Production application code                |

**Read the full agent definition** in `agents/<role>-agent.md` before starting work.

---

## 8 Non-Negotiable Rules

### 0. Migrations Run on Local DB First

**Never run `prisma migrate dev` or `prisma db push` against any remote/production database.**
All schema changes must be applied to the local PostgreSQL instance first (defined in `.env.local`).
Only after the migration succeeds locally and the code is verified working should the migration be committed and deployed.

- Local DB: `postgresql://sector7:sector7pass@localhost:5432/sector7` (docker-compose)
- Migration command: `npx prisma migrate dev --name <descriptive-name>`
- After migration: run `npx prisma generate` to update the Prisma client
- Commit both the migration folder and the updated `schema.prisma` in the same PR

### 1. Read Before You Write

Never start coding without reading all memory files. Session 50 must be as context-aware as session 1.

### 2. Branch-Scoped Everything

Every database query, every API route, every UI data fetch MUST be scoped to `branchId`. No exceptions. If you see unscoped data access, it is a bug.

### 3. Offline-First for Gym Floor

Workout logging and session management must work without connectivity. Use IndexedDB + Workbox background sync. Test with network disabled.

### 4. Never Break the Contract

API contracts in `memory/api-contracts.md` are agreements between backend and UI agents. Changing a contract requires updating the file FIRST, then updating both sides.

### 5. Tests Are Not Optional

Every ticket must include tests. API routes: Vitest + Supertest. Components: Vitest + Testing Library. No task is complete without tests.

### 6. Audit Everything

Any action that creates, updates, or deletes operational data (sessions, attendance, leaves, payments, assignments, progress, settings) MUST write to the audit log. Use the `auditLog()` utility — never skip it.

### 7. Ask, Don't Assume

If a requirement is ambiguous, if a dependency is unclear, if a decision has trade-offs — STOP and ask the operator. Do not guess.

---

## Workflow Per Task

```
STEP 1: Read all memory files (every session, no shortcuts)
STEP 2: Read your agent definition (agents/<role>-agent.md)
STEP 3: Read tasks/current-task.md
STEP 4: Implement the task
STEP 5: Write/update tests
STEP 6: Run linting + type-check (npm run lint && npm run type-check)
STEP 7: Update memory files if you changed schema, API contracts, or made decisions
STEP 8: Move task to tasks/completed-tasks.md with completion notes
STEP 9: Report completion summary to operator
```

---

## Operator Commands

| Command                | Meaning                                            |
| ---------------------- | -------------------------------------------------- |
| `@architect [task-id]` | Switch to architect agent, assign task             |
| `@backend [task-id]`   | Switch to backend agent, assign task               |
| `@ui [task-id]`        | Switch to UI agent, assign task                    |
| `@devops [task-id]`    | Switch to DevOps agent, assign task                |
| `@qa [task-id]`        | Switch to QA agent, assign task                    |
| `@status`              | Report: active task, blockers, last completed      |
| `@next`                | Pick next unblocked ticket from `tasks/backlog.md` |
| `@memory`              | Dump summary of all memory files                   |
| `@decide [question]`   | Log an architectural decision after discussion     |
| `@audit [task-id]`     | Review what was built for a completed task         |

---

## Repository Structure

```
sector7/
├── CLAUDE.md                        ← You are here
├── agents/                          ← Agent role definitions
│   ├── architect-agent.md
│   ├── backend-agent.md
│   ├── ui-agent.md
│   ├── devops-agent.md
│   └── qa-agent.md
├── memory/                          ← Persistent project memory
│   ├── project-context.md
│   ├── architecture.md
│   ├── schema.md
│   ├── api-contracts.md
│   └── decisions.md
├── rules/                           ← Engineering governance
│   ├── engineering-principles.md
│   ├── coding-standards.md
│   └── change-management.md
├── tasks/                           ← Task management
│   ├── backlog.md
│   ├── current-task.md
│   └── completed-tasks.md
├── docs/                            ← PRD and reference documents
│   └── Sector7_PRD_v2.0.docx
├── prisma/
│   └── schema.prisma
├── src/
│   ├── app/                         ← Next.js App Router
│   │   ├── (auth)/                  ← Auth pages (login, signup)
│   │   ├── (dashboard)/             ← Authenticated layout shell
│   │   │   ├── admin/               ← Admin pages
│   │   │   ├── trainer/             ← Trainer pages
│   │   │   ├── client/              ← Client pages
│   │   │   └── layout.tsx
│   │   ├── api/                     ← API routes
│   │   │   ├── auth/
│   │   │   ├── admin/
│   │   │   ├── trainer/
│   │   │   ├── client/
│   │   │   ├── exercises/
│   │   │   ├── kickboxing/
│   │   │   └── notifications/
│   │   ├── layout.tsx               ← Root layout
│   │   └── page.tsx                 ← Landing / redirect
│   ├── components/                  ← Shared React components
│   │   ├── ui/                      ← Primitives (Button, Input, Card, etc.)
│   │   ├── forms/                   ← Form components
│   │   ├── charts/                  ← Recharts wrappers
│   │   ├── calendar/                ← Calendar / scheduler components
│   │   ├── timer/                   ← Session timer component
│   │   └── layout/                  ← Shell, sidebar, nav
│   ├── hooks/                       ← Custom React hooks
│   ├── lib/                         ← Core utilities
│   │   ├── prisma.ts                ← Prisma client singleton
│   │   ├── auth.ts                  ← Auth helpers (NextAuth config)
│   │   ├── audit.ts                 ← Audit log utility
│   │   ├── notifications.ts         ← WhatsApp + FCM helpers
│   │   ├── offline.ts               ← IndexedDB + sync utilities
│   │   ├── validators.ts            ← Zod schemas (shared validation)
│   │   └── constants.ts             ← App-wide constants
│   ├── services/                    ← Business logic layer
│   │   ├── session.service.ts
│   │   ├── schedule.service.ts
│   │   ├── leave.service.ts
│   │   ├── attendance.service.ts
│   │   ├── workout.service.ts
│   │   ├── progress.service.ts
│   │   ├── payment.service.ts
│   │   ├── kickboxing.service.ts
│   │   ├── reassignment.service.ts
│   │   ├── exercise.service.ts
│   │   ├── analytics.service.ts
│   │   └── user.service.ts
│   ├── types/                       ← TypeScript type definitions
│   │   ├── api.ts                   ← API request/response types
│   │   ├── domain.ts                ← Domain entity types
│   │   └── enums.ts                 ← Shared enums
│   └── middleware.ts                ← Next.js middleware (auth, branch scoping)
├── public/
│   ├── manifest.json                ← PWA manifest
│   ├── sw.js                        ← Service worker (Workbox generated)
│   └── icons/
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── .env.example
├── .eslintrc.json
├── tailwind.config.ts
├── tsconfig.json
├── next.config.ts
├── package.json
├── docker-compose.yml               ← PostgreSQL + Redis (dev)
└── vitest.config.ts
```
