# Architecture — Sector 7

> Last updated: Pre-development (March 2026)

---

## Tech Stack

| Layer             | Technology                           | Version | Notes                                           |
| ----------------- | ------------------------------------ | ------- | ----------------------------------------------- |
| **Framework**     | Next.js (App Router)                 | 16.2    | Full-stack: pages + API routes + server actions |
| **Language**      | TypeScript                           | 5.x     | Strict mode enabled                             |
| **Database**      | PostgreSQL                           | 16      | Primary data store                              |
| **ORM**           | Prisma                               | 5.x     | Schema-first, migrations, type-safe queries     |
| **Cache**         | Redis                                | 7.x     | Session store, rate limiting, real-time pub/sub |
| **Auth**          | NextAuth.js (Auth.js)                | 4.24    | RBAC with JWT session strategy                  |
| **Styling**       | Tailwind CSS                         | 4.x     | Utility-first, mobile-first, dark theme         |
| **Font (Sans)**   | Inter                                | latest  | Primary UI font via next/font/google            |
| **Font (Mono)**   | JetBrains Mono                       | latest  | Code/mono font via next/font/google             |
| **UI Primitives** | shadcn/ui                            | latest  | Copy-paste components, fully customizable       |
| **Charts**        | Recharts                             | 2.x     | Client progress, admin dashboards               |
| **Calendar**      | @fullcalendar/react                  | 6.x     | Trainer schedule, admin scheduling view         |
| **Forms**         | React Hook Form + Zod                | latest  | Validated forms with shared schemas             |
| **Tables**        | TanStack Table                       | 8.x     | Client lists, audit logs, reports               |
| **Excel Export**  | SheetJS (xlsx)                       | latest  | Dashboard data export                           |
| **Notifications** | WhatsApp Business API + FCM          | —       | Dual channel with fallback                      |
| **Real-Time**     | Socket.io or Pusher                  | —       | Session timer sync, live updates                |
| **Offline**       | IndexedDB (Dexie.js) + Workbox       | —       | Workout logging, background sync                |
| **Testing**       | Vitest + Testing Library + Supertest | —       | Unit + integration + API                        |
| **E2E Testing**   | Playwright                           | latest  | Critical path testing                           |
| **Linting**       | ESLint + Prettier                    | —       | Enforced via pre-commit hooks                   |
| **Deployment**    | Vercel                               | —       | Edge-optimized, auto-scaling                    |
| **Dev Infra**     | Docker Compose                       | —       | PostgreSQL + Redis for local dev                |

---

## Architecture Principles

### 1. Service Layer Pattern

API routes are thin — they validate input, call a service function, and return the response. All business logic lives in `src/services/`. This keeps API routes testable and prevents logic duplication.

```
Request → API Route (validate + auth) → Service (business logic) → Prisma (data) → Response
```

### 2. Branch Scoping

Every service function receives `branchId` as a mandatory parameter. The Next.js middleware extracts `branchId` from the authenticated user's session and injects it into the request context. No service function ever runs without branch scoping.

```typescript
// CORRECT — always scoped
const clients = await getClients({ branchId, trainerId });

// WRONG — never do this
const clients = await getClients({ trainerId });
```

### 3. Audit Logging

A centralized `auditLog()` utility wraps every mutating operation. It records: action, actor, subject, old value, new value, timestamp, branchId. The audit table is append-only.

```typescript
await auditLog({
  action: 'SESSION_STARTED',
  actorId: trainer.id,
  subjectType: 'SessionInstance',
  subjectId: session.id,
  metadata: { clientId, startTime },
  branchId,
});
```

### 4. Validation at the Edge

Zod schemas are defined once in `src/lib/validators.ts` and shared between API routes (server-side validation) and forms (client-side validation). Never define validation in two places.

### 5. Offline-First for Workout Logging

The workout logging flow uses Dexie.js (IndexedDB wrapper) to store data locally first, then syncs to the server via Workbox background sync when connectivity is available. The UI always reads from local storage during an active session.

```
Trainer logs exercise → Dexie (local) → Workbox queue → API route (when online) → PostgreSQL
```

### 6. Component Hierarchy

```
src/components/ui/          → Atomic primitives (Button, Input, Card, Badge, Dialog)
src/components/forms/       → Domain form components (ClientForm, SessionForm, LeaveForm)
src/components/charts/      → Recharts wrappers (ProgressChart, AttendanceChart, UtilizationChart)
src/components/calendar/    → FullCalendar wrappers (TrainerCalendar, ScheduleCalendar)
src/components/timer/       → Session timer (SessionTimer, TimerDisplay)
src/components/layout/      → Shell (Sidebar, TopNav, RoleSwitcher, BranchSelector)
src/app/(dashboard)/admin/  → Admin-specific page compositions
src/app/(dashboard)/trainer/ → Trainer-specific page compositions
src/app/(dashboard)/client/ → Client-specific page compositions
```

---

## Data Flow Diagrams

### Session Start Flow

```
Trainer taps "Start Workout" for Client X
  → POST /api/trainer/sessions/[id]/start
  → session.service.startSession(sessionId, trainerId, branchId)
    → Update SessionInstance: status = IN_PROGRESS, startedAt = now()
    → Create AttendanceRecord: clientId, status = PRESENT, markedBy = trainerId
    → auditLog({ action: 'SESSION_STARTED', ... })
    → Emit WebSocket event: SESSION_STARTED → Client X receives timer start
  → Return: { session, timer: { startedAt, expectedDuration } }
```

### Leave Application Flow

```
Trainer submits leave request
  → POST /api/trainer/leaves
  → leave.service.applyLeave(trainerId, dateRange, reason, branchId)
    → Create LeaveRequest: status = PENDING
    → Identify affected sessions (query SessionInstance by trainerId + dateRange)
    → Identify affected clients from those sessions
    → auditLog({ action: 'LEAVE_SUBMITTED', ... })
    → Notify admin (in-app): "Trainer X requested leave, N clients affected"
  → Return: { leave, affectedClients: [...] }
```

### Month-End Carry-Forward Flow

```
Scheduled job runs at month-end (cron or Vercel Cron)
  → schedule.service.processMonthEnd(branchId)
    → For each client in branch:
      → Count unused sessions this month
      → Apply carry-forward limit (from branch settings)
      → Create carry-forward records for next month
      → Expire remaining unused sessions
      → auditLog({ action: 'MONTH_END_PROCESSED', ... })
    → Notify clients of carry-forward summary (WhatsApp + in-app)
```

---

## Environment Variables

```env
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/sector7

# Redis
REDIS_URL=redis://localhost:6379

# Auth
NEXTAUTH_SECRET=<random-secret>
NEXTAUTH_URL=http://localhost:3000

# WhatsApp Business API
WHATSAPP_API_URL=https://graph.facebook.com/v18.0/<phone-number-id>
WHATSAPP_API_TOKEN=<token>
WHATSAPP_VERIFY_TOKEN=<webhook-verify-token>

# Firebase Cloud Messaging
FIREBASE_PROJECT_ID=<project-id>
FIREBASE_PRIVATE_KEY=<key>
FIREBASE_CLIENT_EMAIL=<email>

# Pusher (or Socket.io config)
PUSHER_APP_ID=<id>
PUSHER_KEY=<key>
PUSHER_SECRET=<secret>
PUSHER_CLUSTER=<cluster>

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development
```
