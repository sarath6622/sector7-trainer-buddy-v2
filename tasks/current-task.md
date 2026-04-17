# Current Task

## Phase 22 — Trainer Self-Scheduling & Client Reschedule Requests

**Active as of:** 2026-04-17
**Operator instruction:** Extend scheduling so trainers can manage their own schedules, and clients can request session rescheduling (routed to admin + trainer for review).

---

### Completed

- [x] **S7-RS-01** | @architect | M | Added `RescheduleStatus` enum + `RescheduleRequest` model to `schema.prisma`. Added `createdByUserId` to `SessionSchedule`. Migration `20260417100000_add_reschedule_request` applied to Neon DB. Prisma client regenerated.
- [x] **S7-RS-02** | @architect | S | Added Zod validators (`createTrainerScheduleSchema`, `updateTrainerScheduleSchema`, `generateTrainerSessionsSchema`, `submitRescheduleRequestSchema`, `reviewRescheduleRequestSchema`, `listRescheduleRequestsSchema`) and TypeScript types (`RescheduleRequestWithRelations`) to `validators.ts` and `domain.ts`.

### Remaining

- [ ] **S7-RS-03** | @backend | L | `schedule.service.ts` — extend with `createScheduleByTrainer()`, assignment check + conflict detection
- [ ] **S7-RS-04** | @backend | M | Trainer scheduling API routes (`/api/trainer/schedules` CRUD + generate)
- [ ] **S7-RS-05** | @backend | L | `reschedule.service.ts` — `submitRescheduleRequest()`, `approveReschedule()`, `rejectReschedule()` with auditLog()
- [ ] **S7-RS-06** | @backend | M | Client reschedule API routes (`/api/client/reschedule-requests`)
- [ ] **S7-RS-07** | @backend | M | Admin + Trainer reschedule review API routes (approve/reject endpoints)
- [ ] **S7-RS-08** | @backend | S | Wire notifications: new request → notify admin + trainer; approval/rejection → notify client
- [ ] **S7-RS-09** | @ui | L | Extend trainer schedule page: editable own-created schedules, "Create Schedule" button + modal
- [ ] **S7-RS-10** | @ui | M | Trainer schedule creation modal: assigned-client picker, day/time/duration, conflict warning
- [ ] **S7-RS-11** | @ui | M | Client reschedule request page: upcoming sessions list, "Request Reschedule" per session
- [ ] **S7-RS-12** | @ui | L | Admin reschedule requests page: full table with approve/reject + notes
- [ ] **S7-RS-13** | @ui | M | Trainer reschedule requests panel: scoped to their clients only
- [ ] **S7-RS-14** | @qa | L | Tests: assignment guard (403 on unassigned client), reschedule lifecycle, audit trail, duplicate PENDING guard
