# Task Backlog — Sector 7

> Status: `[ ]` = backlog, `[~]` = in progress, `[x]` = complete, `[!]` = blocked
> Dependencies listed as prerequisite task IDs
> Estimated complexity: S (1-2 hrs), M (2-4 hrs), L (4-8 hrs), XL (8+ hrs)

---

## Phase 0 — Foundation (Week 1)

### Infra & Scaffold

- [x] **S7-F0-01** | @devops | S | Initialize Next.js 14 project with TypeScript strict mode, Tailwind CSS 4, ESLint, Prettier
- [x] **S7-F0-02** | @devops | S | Create docker-compose.yml (PostgreSQL 16 + Redis 7), .env.example, npm scripts
- [x] **S7-F0-03** | @devops | S | Configure Vitest + Testing Library + Supertest, create test helpers directory
- [x] **S7-F0-04** | @devops | S | Configure path aliases (@/), tsconfig strict options, lint-staged + husky pre-commit hooks
- [x] **S7-F0-05** | @architect | M | Create complete Prisma schema (all models from memory/schema.md), run initial migration
- [x] **S7-F0-06** | @architect | S | Generate Prisma client, create prisma.ts singleton in src/lib/
- [x] **S7-F0-07** | @architect | M | Create all Zod validation schemas in src/lib/validators.ts (matching every API input contract)
- [x] **S7-F0-08** | @architect | S | Create TypeScript types in src/types/ (domain.ts, api.ts, enums.ts)
- [x] **S7-F0-09** | @backend | S | Create AppError class in src/lib/errors.ts, error handling utilities
- [x] **S7-F0-10** | @backend | M | Create auditLog() utility in src/lib/audit.ts with full AuditLog write logic
- [x] **S7-F0-11** | @ui | M | Install and configure shadcn/ui, set up component primitives (Button, Input, Card, Badge, Dialog, Table, Select, Tabs, Tooltip, Sheet, DropdownMenu)
- [x] **S7-F0-12** | @ui | M | Create dashboard layout shell: Sidebar (role-based nav), TopNav (user menu, branch selector, notifications bell), responsive mobile drawer
- [x] **S7-F0-13** | @qa | M | Create test fixtures factory (createTestBranch, createTestUser, createTestTrainer, createTestClient, etc.) and test DB setup helper

---

## Phase 1 — Auth & User Management (Week 2)

### Authentication

- [x] **S7-F1-01** | @backend | L | Implement NextAuth.js with credentials provider, session strategy, RBAC middleware
  - Depends on: S7-F0-06, S7-F0-09
- [x] **S7-F1-02** | @architect | M | Create Next.js middleware for auth enforcement + branchId injection into request context
  - Depends on: S7-F1-01
- [x] **S7-F1-03** | @ui | M | Build login page (email + password), redirect logic based on role
  - Depends on: S7-F1-01, S7-F0-12
- [x] **S7-F1-04** | @qa | M | Auth integration tests: login success, invalid credentials, role-based redirect, session persistence
  - Depends on: S7-F1-01, S7-F1-02, S7-F0-13

### User CRUD (Admin)

- [x] **S7-F1-05** | @backend | L | Implement user CRUD service (create, list, get, update, soft-delete) with branch scoping + audit logging
  - Depends on: S7-F0-06, S7-F0-07, S7-F0-10
- [x] **S7-F1-06** | @backend | M | Implement user CRUD API routes (POST, GET, PUT, DELETE /api/admin/users) with auth + role checks
  - Depends on: S7-F1-05, S7-F1-02
- [x] **S7-F1-07** | @ui | L | Build admin client list page: searchable table, filters (status, trainer), payment status badges
  - Depends on: S7-F1-06, S7-F0-12
- [x] **S7-F1-08** | @ui | L | Build admin client profile page: personal info form, health metrics, PT config (session duration override), payment status
  - Depends on: S7-F1-06, S7-F0-11
- [x] **S7-F1-09** | @ui | M | Build admin trainer list page: table with specialties, client count, availability summary
  - Depends on: S7-F1-06, S7-F0-12
- [x] **S7-F1-10** | @ui | M | Build admin trainer profile page: personal info, specialties, working hours config, bio
  - Depends on: S7-F1-06, S7-F0-11
- [x] **S7-F1-11** | @qa | M | User CRUD tests: service unit tests (branch scoping, validation), API integration tests (role checks, 403 on cross-branch)
  - Depends on: S7-F1-05, S7-F1-06

---

## Phase 2 — Trainer-Client Mapping & PT Packages (Week 2-3)

- [x] **S7-F2-01** | @backend | M | Implement PT package service (create mapping, list, update, deactivate) with branch scoping + audit
  - Depends on: S7-F1-05
- [x] **S7-F2-02** | @backend | M | Implement PT package API routes (POST, GET, PUT, DELETE /api/admin/mappings)
  - Depends on: S7-F2-01, S7-F1-02
- [x] **S7-F2-03** | @ui | M | Build trainer-client mapping UI on client profile page: assign trainer, set sessions/month, session charge, start date
  - Depends on: S7-F2-02, S7-F1-08
- [x] **S7-F2-04** | @qa | S | PT package tests: create mapping, duplicate detection, branch isolation
  - Depends on: S7-F2-01

---

## Phase 3 — Session Scheduling (Week 3)

- [x] **S7-F3-01** | @backend | L | Implement schedule service: create recurring schedule, list by trainer/client, update, deactivate
  - Depends on: S7-F2-01
- [x] **S7-F3-02** | @backend | XL | Implement session generation service: generate monthly instances from schedules, detect conflicts, return warnings
  - Depends on: S7-F3-01
- [x] **S7-F3-03** | @backend | M | Implement scheduling API routes (POST, GET, PUT, DELETE /api/admin/schedules + POST /api/admin/schedules/generate)
  - Depends on: S7-F3-01, S7-F3-02
- [x] **S7-F3-04** | @backend | M | Implement conflict detection API (GET /api/admin/conflicts) — find overlapping sessions per trainer per date
  - Depends on: S7-F3-02
- [x] **S7-F3-05** | @ui | L | Install and configure @fullcalendar/react, create TrainerCalendar wrapper component
  - Depends on: S7-F0-11
- [x] **S7-F3-06** | @ui | XL | Build admin scheduling page: trainer calendar view, create schedule modal, month generation button, conflict warning display
  - Depends on: S7-F3-03, S7-F3-04, S7-F3-05
- [x] **S7-F3-07** | @ui | M | Build trainer schedule page (read-only): daily/weekly/monthly calendar views with session cards showing client name, time, status
  - Depends on: S7-F3-03, S7-F3-05
- [x] **S7-F3-08** | @qa | L | Scheduling tests: generation logic (correct dates, skip weekends if needed), conflict detection accuracy, branch isolation
  - Depends on: S7-F3-02, S7-F3-04

---

## Phase 4 — Attendance & Session Management (Week 4 — MVP milestone)

- [ ] **S7-F4-01** | @backend | L | Implement session management service: startSession (mark attendance + set timer), endSession (stop timer + record duration), markNoShow
  - Depends on: S7-F3-02
- [ ] **S7-F4-02** | @backend | M | Implement session API routes for trainer (POST /api/trainer/sessions/[id]/start, /end, /no-show)
  - Depends on: S7-F4-01
- [ ] **S7-F4-03** | @backend | M | Implement admin session view API (GET /api/admin/sessions with filters for date, trainer, client, status)
  - Depends on: S7-F4-01
- [ ] **S7-F4-04** | @ui | L | Build SessionTimer component: live countdown/up timer, "PT time completed" milestone message, works in background tab (Web Worker)
  - Depends on: S7-F0-11
- [ ] **S7-F4-05** | @ui | XL | Build trainer active session page: Start Workout button, live timer, exercise logging area, End Session button
  - Depends on: S7-F4-02, S7-F4-04
- [ ] **S7-F4-06** | @ui | M | Build trainer client list page: assigned clients, next session, session count (used/remaining), payment status badge
  - Depends on: S7-F4-02, S7-F2-02
- [ ] **S7-F4-07** | @ui | M | Build client dashboard: session count card (used/remaining/carry-forward), next session, live timer (when session active)
  - Depends on: S7-F4-02, S7-F4-04
- [ ] **S7-F4-08** | @qa | L | Session management tests: start → timer → end flow, no-show marking, audit trail verification, concurrent session prevention
  - Depends on: S7-F4-01

---

## Phase 5 — Workout Logging & Exercise Library (Week 5)

- [ ] **S7-F5-01** | @backend | M | Implement exercise library service: CRUD, search/filter by muscle group + category + equipment, bulk import
  - Depends on: S7-F0-06
- [ ] **S7-F5-02** | @backend | M | Implement exercise API routes (CRUD + bulk import under /api/admin/exercises)
  - Depends on: S7-F5-01
- [ ] **S7-F5-03** | @backend | L | Implement workout logging service: create workout log + sets, update, delete, get by session
  - Depends on: S7-F4-01
- [ ] **S7-F5-04** | @backend | M | Implement workout API routes for trainer (POST, PUT /api/trainer/workouts)
  - Depends on: S7-F5-03
- [ ] **S7-F5-05** | @ui | L | Build admin exercise library page: table with search/filter, create/edit modal, media upload (video/GIF), bulk import
  - Depends on: S7-F5-02
- [ ] **S7-F5-06** | @ui | XL | Build workout logging UI within active session page: exercise search from library, add sets/reps/weight, reorder exercises, notes
  - Depends on: S7-F5-04, S7-F4-05
- [ ] **S7-F5-07** | @ui | M | Build client workout history page: date-wise list, exercise details, filter by date/exercise/muscle group
  - Depends on: S7-F5-04
- [ ] **S7-F5-08** | @qa | M | Workout logging tests: create log, validate sets, exercise lookup, offline queue (unit test the sync logic)
  - Depends on: S7-F5-03

---

## Phase 6 — Leave Management (Week 6)

- [ ] **S7-F6-01** | @backend | L | Implement leave service: apply leave, approve/reject, identify affected clients + sessions, get leave list
  - Depends on: S7-F4-01
- [ ] **S7-F6-02** | @backend | M | Implement leave API routes: trainer (POST, GET /api/trainer/leaves), admin (GET, PUT approve/reject /api/admin/leaves)
  - Depends on: S7-F6-01
- [ ] **S7-F6-03** | @backend | M | Implement client unavailability service: mark/unmark dates, list by month
  - Depends on: S7-F0-06
- [ ] **S7-F6-04** | @backend | S | Implement client unavailability API routes (POST, GET, DELETE /api/client/unavailability)
  - Depends on: S7-F6-03
- [ ] **S7-F6-05** | @ui | M | Build trainer leave application page: date picker, reason, affected clients preview, submit
  - Depends on: S7-F6-02
- [ ] **S7-F6-06** | @ui | L | Build admin leave management page: leave requests table, approve/reject with notes, affected clients panel
  - Depends on: S7-F6-02
- [ ] **S7-F6-07** | @ui | M | Build client unavailability page: calendar-based date selection, mark/unmark
  - Depends on: S7-F6-04
- [ ] **S7-F6-08** | @qa | M | Leave tests: apply → approve → affected clients identified, rejection flow, audit trail
  - Depends on: S7-F6-01

---

## Phase 7 — Trainer Reassignment (Week 7)

- [ ] **S7-F7-01** | @backend | L | Implement reassignment service: find vacant trainers by slot, create one-time swap, bulk reassign
  - Depends on: S7-F6-01
- [ ] **S7-F7-02** | @backend | M | Implement reassignment API routes (POST /api/admin/reassignments, POST /bulk, GET /api/admin/trainers/vacant)
  - Depends on: S7-F7-01
- [ ] **S7-F7-03** | @ui | L | Build admin reassignment page: vacant trainers per slot lookup, assign replacement, bulk assignment
  - Depends on: S7-F7-02
- [ ] **S7-F7-04** | @qa | M | Reassignment tests: vacant trainer calculation (exclude on-leave + booked), swap creation, audit trail
  - Depends on: S7-F7-01

---

## Phase 8 — Client Progress & Visualization (Week 7-8)

- [ ] **S7-F8-01** | @backend | M | Implement progress service: create entry, update, list by client, chart data aggregation
  - Depends on: S7-F0-06
- [ ] **S7-F8-02** | @backend | M | Implement progress API routes: trainer (POST, PUT, GET /api/trainer/clients/[id]/progress), client (GET /api/client/progress)
  - Depends on: S7-F8-01
- [ ] **S7-F8-03** | @ui | M | Install Recharts, create chart wrapper components: ProgressLineChart, WeightProgressionChart, AttendanceChart
  - Depends on: S7-F0-11
- [ ] **S7-F8-04** | @ui | L | Build client progress page: weight trend chart, body fat chart, workout weight progression per exercise, attendance rate
  - Depends on: S7-F8-02, S7-F8-03
- [ ] **S7-F8-05** | @ui | M | Build trainer client progress view: same charts + edit progress entries form
  - Depends on: S7-F8-02, S7-F8-03
- [ ] **S7-F8-06** | @qa | S | Progress tests: entry creation, chart data aggregation accuracy
  - Depends on: S7-F8-01

---

## Phase 9 — Notifications (Week 8-9)

- [ ] **S7-F9-01** | @backend | L | Implement notification service: create notification, send via WhatsApp API, send via FCM, log delivery status, fallback logic
  - Depends on: S7-F0-06
- [ ] **S7-F9-02** | @backend | M | Integrate WhatsApp Business API: template messages for session reminders, leave updates, reassignment notices
  - Depends on: S7-F9-01
- [ ] **S7-F9-03** | @backend | M | Integrate Firebase Cloud Messaging: push notification delivery for in-app events
  - Depends on: S7-F9-01
- [ ] **S7-F9-04** | @backend | M | Wire notification triggers into existing services: session start, leave approved/rejected, reassignment, no-show, carry-forward
  - Depends on: S7-F9-01, S7-F4-01, S7-F6-01, S7-F7-01
- [ ] **S7-F9-05** | @backend | S | Implement notification API routes (GET /api/notifications, PUT mark-read)
  - Depends on: S7-F9-01
- [ ] **S7-F9-06** | @ui | M | Build notification bell component in TopNav: unread count badge, dropdown with notification list, mark as read
  - Depends on: S7-F9-05
- [ ] **S7-F9-07** | @ui | S | Add real-time notification listener (WebSocket/Pusher) to dashboard layout
  - Depends on: S7-F9-06
- [ ] **S7-F9-08** | @qa | M | Notification tests: delivery logging, fallback from WhatsApp to in-app, trigger verification for each event type
  - Depends on: S7-F9-04

---

## Phase 10 — Payments & Cancellation (Week 9-10)

- [ ] **S7-F10-01** | @backend | M | Implement payment service: create record, update status, list by client/status, revenue aggregation
  - Depends on: S7-F0-06
- [ ] **S7-F10-02** | @backend | M | Implement payment API routes (POST, GET, PUT /api/admin/payments)
  - Depends on: S7-F10-01
- [ ] **S7-F10-03** | @backend | M | Implement cancellation service: cancel session with policy enforcement (within/outside window), update session status
  - Depends on: S7-F4-01
- [ ] **S7-F10-04** | @backend | S | Implement cancellation policy check in session service (read branch settings, compare timestamps)
  - Depends on: S7-F10-03
- [ ] **S7-F10-05** | @ui | M | Build admin payment management page: log payment form, payment history table, status filters
  - Depends on: S7-F10-02
- [ ] **S7-F10-06** | @ui | S | Add payment status badges to client list and client profile pages
  - Depends on: S7-F10-02, S7-F1-07
- [ ] **S7-F10-07** | @qa | M | Payment tests: create, status transitions, revenue aggregation. Cancellation tests: within window, outside window, policy toggle OFF
  - Depends on: S7-F10-01, S7-F10-03

---

## Phase 11 — Kickboxing Module (Week 10-11)

- [ ] **S7-F11-01** | @backend | M | Implement kickboxing service: class CRUD, enrollment CRUD, client type filtering (gym member vs external)
  - Depends on: S7-F0-06
- [ ] **S7-F11-02** | @backend | M | Implement kickboxing API routes (classes + enrollments under /api/admin/kickboxing)
  - Depends on: S7-F11-01
- [ ] **S7-F11-03** | @ui | L | Build admin kickboxing page: class schedule management, enrollment table with gym-member vs external filter, enrollment counts
  - Depends on: S7-F11-02
- [ ] **S7-F11-04** | @qa | S | Kickboxing tests: enrollment with/without clientProfileId, client type filtering, class capacity
  - Depends on: S7-F11-01

---

## Phase 12 — Carry-Forward & Month-End Processing (Week 11)

- [ ] **S7-F12-01** | @backend | L | Implement month-end processing service: calculate unused sessions, apply carry-forward limit, create next month's carry-forward records, expire remainder
  - Depends on: S7-F4-01
- [ ] **S7-F12-02** | @backend | M | Implement carry-forward API: GET session consumption summary per client per month, admin trigger for manual month-end processing
  - Depends on: S7-F12-01
- [ ] **S7-F12-03** | @devops | M | Configure Vercel Cron Job for automated month-end processing (runs last day of each month)
  - Depends on: S7-F12-01
- [ ] **S7-F12-04** | @qa | L | Carry-forward tests: exact boundary cases (0 unused, max carry-forward, mixed planned/no-show), cross-month continuity
  - Depends on: S7-F12-01

---

## Phase 13 — Settings & Configuration (Week 11-12)

- [ ] **S7-F13-01** | @backend | M | Implement branch settings service: get settings, update settings (with audit logging of old → new values)
  - Depends on: S7-F0-06
- [ ] **S7-F13-02** | @backend | S | Implement settings API routes (GET, PUT /api/admin/settings)
  - Depends on: S7-F13-01
- [ ] **S7-F13-03** | @ui | M | Build admin settings page: all configurable fields (session duration, carry-forward limit, cancellation toggle + window, reminder timing, no-show threshold, kickboxing class size)
  - Depends on: S7-F13-02
- [ ] **S7-F13-04** | @qa | S | Settings tests: update triggers audit log, values propagate to dependent services
  - Depends on: S7-F13-01

---

## Phase 14 — Reporting & Analytics (Week 12-13)

- [ ] **S7-F14-01** | @backend | L | Implement analytics service: trainer utilization %, client attendance rate, session consumption, no-show rate, revenue overview
  - Depends on: S7-F4-01, S7-F10-01
- [ ] **S7-F14-02** | @backend | M | Implement analytics API routes (GET /api/admin/analytics/\* for each report type)
  - Depends on: S7-F14-01
- [ ] **S7-F14-03** | @backend | M | Implement Excel export service: generate .xlsx files from analytics data using SheetJS
  - Depends on: S7-F14-01
- [ ] **S7-F14-04** | @ui | XL | Build admin reporting dashboard: trainer utilization bar chart, attendance rate trends, session consumption stacked chart, no-show heatmap, revenue pie chart, filter controls
  - Depends on: S7-F14-02, S7-F8-03
- [ ] **S7-F14-05** | @ui | M | Build trainer analytics page: own client attendance, session completion rate, personal utilization
  - Depends on: S7-F14-02
- [ ] **S7-F14-06** | @ui | M | Add Excel export button to all report views
  - Depends on: S7-F14-03
- [ ] **S7-F14-07** | @qa | M | Analytics tests: utilization calculation accuracy, attendance rate math, revenue aggregation, export file structure
  - Depends on: S7-F14-01

---

## Phase 15 — Audit Log (Week 13)

- [ ] **S7-F15-01** | @backend | M | Implement audit log query service: search/filter by action type, actor, subject, date range, with pagination
  - Depends on: S7-F0-10
- [ ] **S7-F15-02** | @backend | S | Implement audit log API route (GET /api/admin/audit-logs with query params)
  - Depends on: S7-F15-01
- [ ] **S7-F15-03** | @ui | L | Build admin audit log page: searchable table with filters (action type, user, date range, subject), detail view for each entry
  - Depends on: S7-F15-02
- [ ] **S7-F15-04** | @qa | M | Audit log tests: verify every audited action from all previous phases is actually logged, filter accuracy
  - Depends on: S7-F15-01

---

## Phase 16 — Offline & PWA (Week 14-15)

- [ ] **S7-F16-01** | @ui | L | Implement Dexie.js database schema for offline storage: workouts, session state, exercise library cache
  - Depends on: S7-F5-06
- [ ] **S7-F16-02** | @ui | L | Implement offline workout logging: write to IndexedDB first, queue sync, show sync status badge
  - Depends on: S7-F16-01
- [ ] **S7-F16-03** | @backend | M | Implement offline sync endpoint (POST /api/trainer/workouts/sync) with conflict resolution (last-write-wins)
  - Depends on: S7-F5-03
- [ ] **S7-F16-04** | @devops | L | Configure Workbox: app shell caching, background sync for workout queue, exercise library image caching
  - Depends on: S7-F16-01
- [ ] **S7-F16-05** | @devops | M | Create PWA manifest, icons, install prompt, service worker registration in Next.js
  - Depends on: S7-F16-04
- [ ] **S7-F16-06** | @qa | L | Offline tests: log workout with network disabled → enable network → verify sync. Timer continuity offline. Data integrity after sync.
  - Depends on: S7-F16-02, S7-F16-03

---

## Phase 17 — Real-Time & WebSocket (Week 15)

- [ ] **S7-F17-01** | @backend | M | Set up Pusher (or Socket.io) server-side: configure channels, authentication
  - Depends on: S7-F0-01
- [ ] **S7-F17-02** | @backend | M | Emit real-time events from session service: SESSION_STARTED, SESSION_TIMER_TICK, SESSION_TIME_COMPLETE, SESSION_ENDED
  - Depends on: S7-F17-01, S7-F4-01
- [ ] **S7-F17-03** | @ui | M | Create useRealtimeSession() hook: subscribe to session channel, update timer state, handle reconnection
  - Depends on: S7-F17-01
- [ ] **S7-F17-04** | @ui | S | Wire real-time events into client dashboard (live timer) and notification bell (live notification count)
  - Depends on: S7-F17-03, S7-F9-06
- [ ] **S7-F17-05** | @qa | M | Real-time tests: event delivery verification, reconnection handling, multiple concurrent sessions
  - Depends on: S7-F17-02

---

## Phase 18 — Testing, Polish & Launch (Week 16)

- [ ] **S7-F18-01** | @qa | XL | Write Playwright e2e tests for critical paths: login → schedule → start session → log workout → end session; leave → approve → reassign
  - Depends on: All previous phases
- [ ] **S7-F18-02** | @qa | L | Run full test suite, fix failures, ensure 80%+ code coverage on services layer
  - Depends on: S7-F18-01
- [ ] **S7-F18-03** | @devops | M | Run Lighthouse audit, optimize: bundle size, image optimization, font loading, caching headers
  - Depends on: All previous phases
- [ ] **S7-F18-04** | @devops | M | Security review: OWASP top 10 checklist, rate limiting on auth endpoints, CSP headers, SQL injection audit
  - Depends on: All previous phases
- [ ] **S7-F18-05** | @devops | M | Configure Vercel production deployment: environment variables, custom domain, monitoring
  - Depends on: S7-F18-03, S7-F18-04
- [ ] **S7-F18-06** | @backend | M | Create database seed script with realistic demo data (branch, admin, trainers, clients, sessions, exercises)
  - Depends on: S7-F0-06
- [ ] **S7-F18-07** | @ui | M | Final UI polish: empty states, loading skeletons, error messages, mobile responsive audit
  - Depends on: All UI tasks

---

## Summary

| Phase     | Tasks   | Focus                                       |
| --------- | ------- | ------------------------------------------- |
| Phase 0   | 13      | Foundation, scaffold, schema, UI primitives |
| Phase 1   | 11      | Auth, user CRUD, admin pages                |
| Phase 2   | 4       | Trainer-client mapping                      |
| Phase 3   | 8       | Session scheduling + conflict detection     |
| Phase 4   | 8       | Attendance, session timer (MVP)             |
| Phase 5   | 8       | Workout logging, exercise library           |
| Phase 6   | 8       | Leave management                            |
| Phase 7   | 4       | Trainer reassignment                        |
| Phase 8   | 6       | Client progress + charts                    |
| Phase 9   | 8       | Notifications (WhatsApp + FCM)              |
| Phase 10  | 7       | Payments + cancellation policy              |
| Phase 11  | 4       | Kickboxing module                           |
| Phase 12  | 4       | Carry-forward + month-end                   |
| Phase 13  | 4       | Settings + configuration                    |
| Phase 14  | 7       | Reporting + analytics + export              |
| Phase 15  | 4       | Audit log UI                                |
| Phase 16  | 6       | Offline + PWA                               |
| Phase 17  | 5       | Real-time WebSocket                         |
| Phase 18  | 7       | Testing, polish, launch                     |
| **Total** | **126** |                                             |
