# Coding Standards — Sector 7

---

## Naming Conventions

| Thing              | Convention                   | Example                              |
| ------------------ | ---------------------------- | ------------------------------------ |
| Files (components) | PascalCase                   | `SessionTimer.tsx`                   |
| Files (utilities)  | camelCase                    | `auditLog.ts`                        |
| Files (API routes) | kebab-case folders           | `api/admin/trainers/vacant/route.ts` |
| Files (services)   | dot notation                 | `session.service.ts`                 |
| React components   | PascalCase                   | `export function SessionTimer()`     |
| Hooks              | camelCase with `use` prefix  | `useSessionTimer()`                  |
| Variables          | camelCase                    | `sessionDuration`                    |
| Constants          | SCREAMING_SNAKE              | `MAX_CARRY_FORWARD`                  |
| Types/Interfaces   | PascalCase                   | `SessionInstance`                    |
| Enums              | PascalCase                   | `SessionStatus`                      |
| Database tables    | snake_case (Prisma @@map)    | `session_instances`                  |
| API routes         | kebab-case                   | `/api/admin/trainers/vacant`         |
| Zod schemas        | camelCase with Schema suffix | `createUserSchema`                   |

---

## File Structure Rules

### API Routes

```
src/app/api/admin/users/route.ts        → GET (list), POST (create)
src/app/api/admin/users/[id]/route.ts   → GET (detail), PUT (update), DELETE
```

### Services

```
src/services/user.service.ts
  → export async function createUser(input, branchId) { ... }
  → export async function getUsers(filters, branchId) { ... }
  → export async function getUserById(id, branchId) { ... }
  → export async function updateUser(id, input, branchId) { ... }
  → export async function deleteUser(id, branchId) { ... }
```

### Components

```
src/components/ui/Button.tsx             → Atomic primitive
src/components/forms/ClientForm.tsx      → Domain form
src/components/charts/ProgressChart.tsx  → Chart wrapper
src/components/calendar/TrainerCalendar.tsx → Calendar wrapper
```

---

## TypeScript Rules

- Strict mode enabled (`"strict": true` in tsconfig)
- No `any` — use `unknown` if type is truly unknown, then narrow
- No non-null assertions (`!`) — handle the null case
- Prefer `interface` for object shapes, `type` for unions/intersections
- Always type function parameters and return values
- Use Prisma generated types for database entities
- Use Zod `z.infer<typeof schema>` for validated input types

---

## React Rules

- Functional components only (no class components)
- Use named exports: `export function ClientList() { ... }`
- Server Components by default; add `"use client"` only when needed (state, effects, browser APIs)
- Custom hooks for reusable logic: `useSessionTimer()`, `useOfflineSync()`
- Error boundaries around every page-level component
- Suspense boundaries with loading skeletons for async data
- No prop drilling beyond 2 levels — use context or composition

---

## API Route Rules

```typescript
// Standard structure for every API route
import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { someSchema } from '@/lib/validators';
import * as someService from '@/services/some.service';

export async function POST(req: Request) {
  try {
    // 1. Auth check
    const session = await getServerSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // 2. Role check
    if (!['SUPER_ADMIN', 'BRANCH_ADMIN'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 3. Input validation
    const body = await req.json();
    const parsed = someSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    // 4. Call service (with branchId)
    const result = await someService.doSomething({
      ...parsed.data,
      branchId: session.user.branchId,
    });

    // 5. Return response
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/...] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

---

## Import Order

```typescript
// 1. Node built-ins
import { readFile } from 'fs/promises';

// 2. External packages
import { NextResponse } from 'next/server';
import { z } from 'zod';

// 3. Internal aliases (@/)
import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';
import * as sessionService from '@/services/session.service';

// 4. Relative imports
import { SessionCard } from './SessionCard';

// 5. Types (type-only imports)
import type { SessionInstance } from '@prisma/client';
```

---

## Error Handling

- Services throw typed errors: `throw new AppError('NOT_FOUND', 'Session not found')`
- API routes catch and map to HTTP status codes
- Never expose stack traces or internal details in API responses
- Log full error details server-side with context

```typescript
// src/lib/errors.ts
export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400,
  ) {
    super(message);
  }
}
```

---

## Git Conventions

- Branch names: `feat/S7-{ticket-id}-short-description` (e.g., `feat/S7-F1-03-session-scheduling`)
- Commit messages: `feat(scope): description` following Conventional Commits
  - `feat(api): implement session start endpoint`
  - `fix(ui): fix timer not updating on background tab`
  - `chore(devops): add Redis to docker-compose`
  - `test(service): add session service unit tests`
- One logical change per commit
- Squash-merge to main
