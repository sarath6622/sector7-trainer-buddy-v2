# Engineering Principles — Sector 7

> These are non-negotiable. Every agent must follow them. No exceptions.

---

## 1. Branch Scoping Is Not Optional

Every database query, every service call, every API response MUST be scoped to `branchId`. The middleware extracts it from the session; services receive it as a parameter. If you write a query without `where: { branchId }`, it is a security bug.

**The only exceptions:** Exercise library (global), and super admin cross-branch queries (explicitly documented).

---

## 2. Service Layer Is the Single Source of Business Logic

```
API Route → validates input + checks auth → calls service → returns response
Server Action → checks auth → calls service → revalidates
Component → calls API or server action → renders
```

Business logic NEVER lives in:

- API route handlers (they are thin wrappers)
- React components (they render and dispatch)
- Prisma queries (they are called from services)

---

## 3. Audit Everything That Mutates

If a function creates, updates, or deletes operational data, it MUST call `auditLog()`. This includes:

- Session status changes (start, end, no-show, cancel)
- Workout logging (create, edit, delete)
- Leave requests (submit, approve, reject)
- Trainer reassignments
- Payment records
- Profile changes
- Settings changes
- Conflict overrides

The audit log is immutable. Never update or delete audit records.

---

## 4. Validate Twice, Trust Nothing

- **Server-side:** Zod validation in every API route before calling the service
- **Client-side:** Same Zod schema in React Hook Form for instant feedback
- **Database:** Prisma schema constraints as the last line of defense

Schemas are defined ONCE in `src/lib/validators.ts` and imported everywhere.

---

## 5. Offline-First for Gym Floor Features

Workout logging and session management must function without network connectivity:

- Write to IndexedDB (Dexie.js) first
- Queue server sync via Workbox background sync
- Show local data immediately, sync status as a badge
- Handle sync conflicts with last-write-wins (timestamp-based)

Test every offline flow by disabling the network.

---

## 6. Mobile-First, Touch-Friendly

70-85% of usage will be on mobile phones on the gym floor. Every trainer-facing screen must have:

- Minimum 44px touch targets
- Minimal taps to complete a workout log entry
- No hover-dependent interactions
- Fast load on 3G (< 2s)
- Readable in bright gym lighting (high contrast)

---

## 7. Fail Gracefully, Log Completely

- Every API route has try/catch with structured error responses
- Every async operation has loading, success, and error states in the UI
- WhatsApp notification failures fall back to in-app (never silent failure)
- Offline sync failures are queued and retried (never lost)
- All errors are logged with context (userId, branchId, action, input)

---

## 8. Types Are Documentation

TypeScript strict mode is enabled. If the type system allows it but the business rule doesn't, the type is wrong. Types in `src/types/` must match:

- Prisma schema (generated types)
- Zod validation schemas
- API request/response contracts

If these three disagree, something is broken. Fix the source of truth (Prisma schema) and cascade.

---

## 9. Tests Prove the Contract

Tests are not afterthoughts. Every task includes tests:

- Services: Vitest unit tests (mocked Prisma)
- API routes: Supertest integration tests (real DB)
- Components: Testing Library tests (render + interaction)
- Critical paths: Playwright e2e

A task without tests is incomplete.

---

## 10. No Magic, No Cleverness

Write boring, readable code. Prefer:

- Explicit over implicit
- Verbose over clever
- Flat over nested
- Functions over classes (unless the pattern demands it)
- Named exports over default exports
- Early returns over deep nesting

The next agent reading your code should understand it in 30 seconds.
