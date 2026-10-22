# Phase 28 — Training Routines & Programs (Hevy-style)

> Implemented route names are in `memory/api-contracts.md` (the table below is the original proposal; paths now live under `/api/routine-programs`).
>
> **Status:** Phases A + B BUILT (2026-10-18) on `feat/S7-RT-training-routines`: uncommitted, migration local-only. Phase C not started.
>
> **Operator decisions (2026-10-18):**
>
> - Library authoring: **trainers and admins**.
> - Assign / edit a client's program: **admins for any client in the branch; trainers only for clients they hold an active `PtPackage` with**.
> - **Clients cannot start a routine.** Applying a routine to a session is trainer-only. Clients still _see_ the targets on their shared session page.
> - Exercises added from a routine are **fully editable once the session has started** (add / remove / reorder / extra sets). The routine is guidance, not a lock.
> - Rotation vs fixed weekdays: **rotation** ("Next up"). Backed by prod data: 74% of consecutive sessions follow Push → Pull → Legs → Push (766 of 1,042 transitions), and reschedules / leaves / carry-forwards make weekday pinning drift.
> - Seed content: derived from live workout logs (1,930 sessions, 2026-03-01 → 2026-10-10). The gym runs Push / Pull / Legs at a house standard of **3 × 15** (3 × 12 on the heavy presses). The seed carries no target weights, because they are per client and the logger already shows "previous".
> - Offline apply (Q4): unanswered → online-only in v1, as proposed.
>   **Requested by:** gym admin (2026-10-18). "A training routine like Hevy has, that we can assign to a client."
>   **Proposed ADR:** ADR-053. Nothing below changes until it is logged in `memory/decisions.md`.

---

## 1. How Hevy does it (research summary)

| Concept                 | Hevy                                                                                                                                                                                                                                                                                                                                                                                                                               | Source                                                           |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| **Routine**             | A reusable workout template: name, then an ordered list of exercises. Each exercise has sets, a **set type** (Warm-up / Normal / Failure / Drop), a **target weight**, **target reps or a rep range** (e.g. 6–8) or a **target time** for duration movements, a **rest timer per exercise**, and **notes** that reappear every time the routine is used. Supersets are supported. RPE is _not_ a routine target, only logged live. | hevyapp.com/features/gym-routines, /exercise-programming-options |
| **Folder**              | Groups routines (e.g. "PPL", "5x5"). Organisation only, no schedule. Folders can be shared.                                                                                                                                                                                                                                                                                                                                        | /features/share-folders-routines                                 |
| **Start routine**       | "Start Routine" opens a live workout seeded with the routine's exercises and sets. Everything is editable mid-workout: add, remove, swap or reorder exercises, and change sets. A separate **PREVIOUS** column shows last time's numbers ("45kg × 9"); tapping it copies the value in.                                                                                                                                             | /features/gym-routines, /features/track-exercises                |
| **Update routine**      | On finishing, Hevy asks whether to **update the routine with the changes made** or keep the original.                                                                                                                                                                                                                                                                                                                              | /features/gym-routines                                           |
| **Save as routine**     | A finished workout can be saved as a new routine.                                                                                                                                                                                                                                                                                                                                                                                  | /features/gym-routines                                           |
| **Hevy Coach: program** | A coach builds a **program** (a set of routines plus program notes) in a library and **copies it to a client** ("Copy Program to Client"). The client gets a Coach tab with the assigned workouts and taps Start Routine. **One program per client at a time.** A new assignment replaces the old one, and logged history is kept. Coach edits to the _client's copy_ show up immediately.                                         | /features/strength-coach, coachway.io                            |
| **Coach visibility**    | The coach sees each logged workout as soon as it's saved, with per-lift performance, volume and sets-per-muscle. No explicit planned-vs-done adherence metric.                                                                                                                                                                                                                                                                     | /features/strength-coach                                         |
| **Progression**         | No automatic progression. Only the PREVIOUS column, plus prefill from last time.                                                                                                                                                                                                                                                                                                                                                   | /features/exercise-programming-options                           |

**What we take:** library templates → **copy** to client → one active program → start a routine inside a session → targets visible next to "previous" → optional "update routine" at the end.
**What we deliberately don't take (v1):** client-authored routines, sharing routines publicly, supersets, set types written onto logged sets.

---

## 2. How this maps onto Sector 7 (constraints that shape the design)

1. **Workouts only exist inside a `SessionInstance`** (`WorkoutLog.sessionInstanceId` is required). So "Start routine" is **an action inside the session logger**, not a free-standing workout. Solo workouts stay out of scope (ADR-036 deferral).
2. **Logging is shared between trainer and client** (ADR-036), and writes are diff-scoped per exercise and per set (ADR-041). Whatever a routine does to a session has to reach **both devices** through the existing `WORKOUT_UPDATED` Pusher and poll path, never through local-only state.
3. **`hasDraftRows()` treats more than one unsaved row per exercise as a draft**, which pauses the 10s poll and Pusher rehydration (`WorkoutLogger.tsx:400`). So a routine **must not** pre-create its 3–4 set rows in logger state, or the session freezes in "unsaved". Targets are rendered as **display-only ghost rows** (see §5.3). Only complete sets are ever saved; that invariant doesn't change.
4. **The logger dedupes by `exerciseId`** (one card per exercise per session). Routines inherit the same rule: an exercise appears at most once per routine.
5. **The exercise catalogue is global** (`Exercise` has no `branchId`). Routines and programs are **branch-scoped** (rule 2).
6. **Trainers have library parity with admins** (ADR-039). The same parity applies to the routine library.
7. **Additive only.** The build has no `migrate deploy`. New tables plus one nullable column means the migration can go to prod first, then the code, with no rename or deploy-order trap (see the intake-rename lesson).

---

## 3. Data model (ADR-053)

Four new tables, one new enum, one nullable FK on `SessionInstance`. **No change to `WorkoutLog` or `WorkoutSet`.**

```prisma
enum RoutineSetType {
  WARMUP
  NORMAL
  FAILURE
  DROP
}

/// A program is Hevy's "folder" / Hevy Coach's "program": an ordered rotation
/// of routines (Day A / Day B / Day C).
/// clientProfileId NULL  → branch library template (editable by trainers/admins).
/// clientProfileId SET   → a client's own COPY, made on assign. Library edits
///                         never propagate into it (Hevy Coach "Copy Program").
model RoutineProgram {
  id              String   @id @default(cuid())
  branchId        String
  clientProfileId String?
  sourceProgramId String?            // library program this was copied from
  name            String
  notes           String?            // "Program Notes" shown to the client
  isActive        Boolean  @default(true) // client copies: exactly one active per client (service-enforced)
  isArchived      Boolean  @default(false)
  createdByUserId String
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  branch   Branch         @relation(fields: [branchId], references: [id])
  client   ClientProfile? @relation(fields: [clientProfileId], references: [id])
  routines Routine[]

  @@index([branchId, clientProfileId])
  @@map("routine_programs")
}

model Routine {
  id         String   @id @default(cuid())
  programId  String
  name       String                  // "Day A — Push"
  notes      String?
  orderIndex Int
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  program   RoutineProgram    @relation(fields: [programId], references: [id], onDelete: Cascade)
  exercises RoutineExercise[]
  sessions  SessionInstance[]

  @@index([programId])
  @@map("routines")
}

model RoutineExercise {
  id         String  @id @default(cuid())
  routineId  String
  exerciseId String
  orderIndex Int
  restSec    Int?                   // per-exercise rest timer default
  notes      String?                // coaching cue, shown every time
  createdAt  DateTime @default(now())

  routine  Routine      @relation(fields: [routineId], references: [id], onDelete: Cascade)
  exercise Exercise     @relation(fields: [exerciseId], references: [id])
  sets     RoutineSet[]

  @@unique([routineId, exerciseId])  // mirrors the logger's one-card-per-exercise rule
  @@index([routineId])
  @@map("routine_exercises")
}

model RoutineSet {
  id                String         @id @default(cuid())
  routineExerciseId String
  setNumber         Int
  setType           RoutineSetType @default(NORMAL)
  targetRepsMin     Int?            // min == max → fixed reps; both set → range
  targetRepsMax     Int?
  targetWeightKg    Float?
  targetDurationSec Int?            // TIMED / CARDIO
  targetStepsCount  Int?            // CARDIO + secondaryMetric=STEPS
  targetDistance    Float?          // CARDIO KM/METERS, in the exercise's unit

  routineExercise RoutineExercise @relation(fields: [routineExerciseId], references: [id], onDelete: Cascade)

  @@index([routineExerciseId])
  @@map("routine_sets")
}

// SessionInstance gains:
//   routineId String?   — the routine this session was started from (null = free log)
//   routine   Routine?  @relation(fields: [routineId], references: [id], onDelete: SetNull)
```

**Why these choices**

- **Templates and client copies share the same tables** (distinguished by `clientProfileId`). One editor, one validator and one service for both. Assigning is a deep copy in one transaction.
- **Copy, not live link.** A trainer tweaking Ravi's Day B shouldn't change Priya's. A library edit shouldn't silently rewrite what eight clients are mid-way through. This matches Hevy Coach.
- **Relational sets, not a JSON column.** Same shape as `WorkoutLog`/`WorkoutSet`. Planned-vs-done reporting later is a join.
- **Nested editor writes use delete-then-recreate in a transaction** (ADR-015 pattern). A routine has a single author at a time, so the ADR-041 concurrency problem doesn't apply.
- **`SessionInstance.routineId`** is the only link from history to plans. It drives (a) the "Next up" rotation, (b) re-showing targets after reload or on the peer device, and (c) later adherence reports. `onDelete: SetNull` means deleting a routine never touches workout history.
- **"One active program per client"** is enforced in the service inside the assign transaction: deactivate the old one, then create the new one. It is not a partial unique index, because Prisma can't express one and `migrate diff` would keep flagging it as drift.
- **Set type is template-only in v1.** Putting `setType` on `WorkoutSet` would change PR, badge and volume semantics (should warm-ups count?). That's a separate decision.

---

## 4. API (contract goes into `memory/api-contracts.md` FIRST)

All routes are branch-scoped, Zod-validated, and `auditLog()` on every mutation (rule 6).

| Method & path                                                  | Who                                                | Purpose                                                   |
| -------------------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------- |
| `GET /api/routine-programs?scope=library`                      | TRAINER, admins                                    | List library programs (with routine counts)               |
| `POST /api/routine-programs`                                   | TRAINER, admins                                    | Create a library program (full nested document)           |
| `GET /api/routine-programs/[id]`                               | TRAINER, admins; CLIENT if it's their own copy     | Full nested program: routines → exercises → sets          |
| `PUT /api/routine-programs/[id]`                               | TRAINER, admins                                    | Replace the full nested document (library or client copy) |
| `DELETE /api/routine-programs/[id]`                            | TRAINER, admins                                    | Soft-archive (`isArchived`). Sessions keep `routineId`    |
| `POST /api/routine-programs/[id]/assign` `{ clientProfileId }` | TRAINER (see Q2), admins                           | Deep-copy to client and deactivate their previous program |
| `DELETE /api/routine-programs/clients/[id]`                    | TRAINER, admins                                    | Unassign (deactivate)                                     |
| `GET /api/routine-programs/clients/[id]`                       | `canReadClientTrainingData` (trainer, admin, self) | Client's active program, plus `nextRoutineId`             |
| `POST /api/sessions/[id]/routine` `{ routineId }`              | Trainer of the session only (operator decision)    | **Apply routine to session** (see §5.2)                   |
| `DELETE /api/sessions/[id]/routine`                            | same                                               | Detach routine (keeps logged exercises)                   |
| `POST /api/sessions/[id]/routine/sync-back` `{ mode }`         | TRAINER, admins                                    | "Update routine with today's changes" (phase C)           |

`GET /api/sessions/...` (trainer + client session reads) gains a `routine` block: `{ id, name, targetsByExerciseId: { [exerciseId]: { restSec, notes, sets: RoutineSet[] } } }`. That's all the logger needs to render targets on either device after any reload.

**`nextRoutineId`:** the routine after the one used in the client's most recent session with a non-null `routineId` from this program, by `orderIndex` and wrapping around. Falls back to the first routine. No schedule-per-weekday in v1 (Hevy doesn't have one either).

---

## 5. Behaviour

### 5.1 Building and assigning (trainer/admin)

- New **Routines** page: `/trainer/routines` and `/admin/routines`, sharing one `<ProgramLibrary>` and one `<ProgramEditor>` component. Mobile-first editor: program name and notes → routines (reorderable) → exercises (add via the existing exercise search used by the logger) → per-exercise sets table: `type | reps (or min–max) | kg` (or `time`, `steps`/`km` for cardio based on `exerciseType`/`secondaryMetric`) plus rest and a note.
- **Client profile → "Program" card** on `/trainer/clients/[id]` and `/admin/clients/[id]`: shows the active program and its routines. Buttons: **Assign from library**, **Edit this client's copy** (same editor), **Unassign**.

### 5.2 Applying a routine in a session

- Logger empty state: when the client has an active program, a **"Start routine"** card appears _above_ the muscle-group picker: "Next up: **Day B — Pull** · 6 exercises" with **Start** and a _Choose another_ sheet. The existing picker and "Add First Exercise" path stay exactly as they are. Routines are optional.
- **Start = one server call**, `POST /api/sessions/[id]/routine`. In one transaction it sets `SessionInstance.routineId` and creates **zero-set `WorkoutLog` rows** for the routine's exercises (skipping any already in the session, appended after existing ones), then fires `WORKOUT_UPDATED`. Both devices pick it up through the existing refetch. No new client-side merge logic, and it reuses the zero-set log shape from ADR-041. Idempotent: applying twice adds nothing new.
- Also available from the logger's overflow menu when exercises already exist ("Add routine exercises").
- Session must be `IN_PROGRESS` (same gate as workout writes).

### 5.3 Targets in the logger (the key UI piece)

- Per exercise card, a **TARGET** strip under the header: `3 × 8–10 @ 40 kg · rest 90s` plus the routine note (styled differently from ADR-052's trainer-private amber note).
- **Ghost rows:** if the routine plans 4 sets and only 1 row exists, rows 2–4 render as **dimmed, non-state placeholders** showing their targets. Tapping one (or "Add Set") materialises it as a real row. Ghost rows never enter `exercises` state, so `hasDraftRows`, the save payload and the poll guard are untouched.
- Within a real row, the input **placeholder stays "previous"** (existing `last-sets` hint, like Hevy's PREVIOUS). The target sits in a small column or label. Tapping it fills the inputs (Hevy's tap-to-copy). **Nothing is auto-filled**: only what the user enters or taps gets saved, so no fake data lands in history.
- Rest: when the routine exercise has `restSec`, the Rest button defaults to it.
- Set-type badges (W / F / D) are shown on ghost and real rows as labels only.
- Users can still add, remove and reorder anything. The routine is guidance, not a lock (Hevy behaviour).

### 5.4 Client view

- `/client/workouts` gets a read-only **"My Program"** section: program notes and each routine's exercises with sets × reps (like Hevy's folder share image). Clients can't edit in v1 (trainer-led gym).
- In the shared session page the client sees the same targets and ghost rows, since it's the same `WorkoutLogger`.

### 5.5 "Update routine?" (Hevy's end-of-workout prompt), trainer only

- On **End session**, if `routineId` is set and the logged structure differs from the routine (exercises added or removed, set count changed, or the top set beat the target), show a sheet: **Keep routine** / **Update this client's routine**. Updating writes to the **client's copy only**, never the library.
- "Save session as routine" from workout history: create a library routine from a finished session.

### 5.6 Offline (rule 3)

- Once applied, logging works offline exactly as today. Targets come down with the session payload and are cached with it.
- **Applying a routine needs connectivity** in v1 (one POST). If offline: show a toast and keep the manual path. See Q4.

---

## 6. Tickets

**Phase A — Foundation (no UI change for users)**

- **S7-RT-01** | @architect | M | ADR-053 in `decisions.md`; schema + migration `add_training_routines` (local Docker first, rule 0); `schema.md`; API contracts for §4.
- **S7-RT-02** | @backend | L | `routine.service.ts`: program CRUD (nested delete-then-recreate), archive, deep-copy assign with one-active rule, `getActiveProgram` + `nextRoutineId`; Zod schemas in `validators.ts`; audit on every write; routes from §4 (except sync-back).
- **S7-RT-03** | @qa | M | Service tests: branch scoping, copy isolation (library edit doesn't touch the client copy), one-active-program, next-routine wrap-around, archived routine with linked sessions, role matrix (trainer / admin / client-self / other client).

**Phase B — Build, assign, run (the feature the admin asked for)**

- **S7-RT-04** | @ui | L | `<ProgramLibrary>` + `<ProgramEditor>`; `/trainer/routines` + `/admin/routines`; nav entries.
- **S7-RT-05** | @ui | M | Client "Program" card on trainer and admin client pages: assign, edit copy, unassign.
- **S7-RT-06** | @backend | M | `POST/DELETE /api/sessions/[id]/routine` (apply = `routineId` + zero-set logs + Pusher); `routine` block on the trainer and client session GETs.
- **S7-RT-07** | @ui | L | Logger: "Start routine" card, target strip, ghost rows, tap-to-fill, rest default. Pure helpers (`ghostRowsFor`, `formatTarget`) unit-tested; `hasDraftRows` regression test proving ghost rows don't mark drafts.
- **S7-RT-08** | @ui | S | Client "My Program" read-only view.
- **S7-RT-09** | @qa | M | Apply-routine tests: idempotency, append-after-existing, peer device sees it, SCHEDULED session rejected, client-as-actor allowed. Browser-verify trainer and client sessions in local Chrome (see the local-verification recipe).

**Phase C — Hevy polish (ship after B has been used on the floor)**

- **S7-RT-10** | @backend+@ui | M | End-session "Update routine?" diff + sync-back to the client copy.
- **S7-RT-11** | @backend+@ui | S | "Save session as routine" from history.
- **S7-RT-12** | @backend+@ui | M | Adherence on the client page: sessions on program, planned vs logged sets per routine.

**Deferred (needs its own ADR):** supersets, `setType` on `WorkoutSet`, auto-progression (+2.5 kg when the top of the rep range is hit), weekday scheduling of routines, Flutter app support (the mobile branch is frozen behind main).

---

## 7. Rollout

1. Merge Phase A. Apply the **additive** migration to prod Neon first (backup first; watch the `migrate diff` → `mobile_refresh_tokens` drop trap and the commented `DIRECT_URL`), then deploy code. Nothing user-visible yet.
2. Phase B behind nothing: the "Start routine" card only appears for clients with an assigned program, so it's invisible until an admin or trainer assigns one. That's the clean-adoption lever. The gym can pilot with 2–3 clients and one trainer.
3. Seed the library with the gym's actual splits (ask the admin for 2–3 they use) so trainers don't start from a blank page.
4. Phase C after a couple of weeks of floor feedback.

**Zero-impact guarantees for existing users:** no change to `WorkoutLog`/`WorkoutSet`, no change to the save payload or ADR-041 diffing, logger behaviour identical when the client has no program, all history untouched.

---

## 8. Risks

| Risk                                                   | Mitigation                                                                                                           |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Ghost rows interfere with draft and rehydration guards | Ghost rows are derived at render time from `routine` + current rows, never stored in state; explicit regression test |
| Trainer and client both tap "Start" at once            | Apply is idempotent and server-side (skip exercises already present)                                                 |
| `WorkoutLogger.tsx` is already 3,000+ lines            | Targets/ghost-row UI in a new `RoutineTargets.tsx`; logger only passes `routine` down                                |
| Program editor on a phone is fiddly                    | Editor is a vertical card list (same pattern as the logger), with no table layouts                                   |
| Prod Neon migration drift                              | Additive tables only; same procedure as ADR-052                                                                      |

---

## 9. Open questions for the operator

1. **Who can author the library?** Proposed: trainers _and_ admins (ADR-039 parity). Alternative: admins only, trainers just assign.
2. **Who can assign or edit a client's program?** Proposed: admins for any client in the branch; trainers only for clients they currently have an active package with.
3. **Can clients start a routine themselves** inside their shared session page? Proposed yes (logging is already shared, ADR-036).
4. **Offline apply:** is online-only "Start routine" acceptable for v1? (Logging itself stays offline-capable.)
5. **Weekday mapping:** is "Next up" rotation enough, or does the admin want "Monday = Day A" pinned to the schedule?
6. **Seed content:** which 2–3 routines/splits does the gym already use?
