-- ─── Phase 1: Add TrainerShift model ─────────────────────────────────────────
-- Replaces the single workingHoursStart/workingHoursEnd window on TrainerProfile
-- with a multi-shift model. Each trainer can have multiple named shifts, each
-- covering specific days of the week.
--
-- Fallback rule: if a trainer has NO shifts rows, they are treated as all-day
-- available (backward compatibility with trainers who had no hours configured).

-- CreateTable
CREATE TABLE "trainer_shifts" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "trainerProfileId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "days" "DayOfWeek"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trainer_shifts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trainer_shifts_branchId_trainerProfileId_idx" ON "trainer_shifts"("branchId", "trainerProfileId");

-- AddForeignKey
ALTER TABLE "trainer_shifts" ADD CONSTRAINT "trainer_shifts_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainer_shifts" ADD CONSTRAINT "trainer_shifts_trainerProfileId_fkey" FOREIGN KEY ("trainerProfileId") REFERENCES "trainer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Backfill ─────────────────────────────────────────────────────────────────
-- For every trainer that has at least one of: workingHoursStart, workingHoursEnd,
-- or workingDays configured, create one "Default Shift" row that preserves the
-- existing time window and day coverage. Trainers with none set are left with
-- zero shifts (= all-day available, same as before).

INSERT INTO "trainer_shifts" (
    "id",
    "branchId",
    "trainerProfileId",
    "label",
    "startTime",
    "endTime",
    "days",
    "createdAt",
    "updatedAt"
)
SELECT
    'migshift_' || "id",
    "branchId",
    "id",
    'Default Shift',
    COALESCE("workingHoursStart", '06:00'),
    COALESCE("workingHoursEnd",   '22:00'),
    CASE
        WHEN array_length("workingDays", 1) > 0 THEN "workingDays"
        ELSE ARRAY['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY']::"DayOfWeek"[]
    END,
    NOW(),
    NOW()
FROM "trainer_profiles"
WHERE "workingHoursStart" IS NOT NULL
   OR "workingHoursEnd"   IS NOT NULL
   OR array_length("workingDays", 1) > 0;

-- Null out the deprecated columns. They remain in the schema as nullable for
-- one release cycle; a follow-up migration will drop them entirely.
UPDATE "trainer_profiles"
SET "workingHoursStart" = NULL,
    "workingHoursEnd"   = NULL;
