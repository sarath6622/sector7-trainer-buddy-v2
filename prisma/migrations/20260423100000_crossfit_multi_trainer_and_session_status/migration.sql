-- Migration: crossfit_multi_trainer_and_session_status
-- Replaces single trainerProfileId on CrossfitClass with a join table,
-- and adds status/startedAt/endedAt to CrossfitSession.

-- Step 1: Create CrossfitClassTrainer join table
CREATE TABLE "crossfit_class_trainers" (
  "id" TEXT NOT NULL,
  "classId" TEXT NOT NULL,
  "trainerProfileId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "crossfit_class_trainers_pkey" PRIMARY KEY ("id")
);

-- Step 2: Migrate existing trainerProfileId data into join table
INSERT INTO "crossfit_class_trainers" ("id", "classId", "trainerProfileId", "branchId")
SELECT gen_random_uuid()::text, "id", "trainerProfileId", "branchId"
FROM "crossfit_classes"
WHERE "trainerProfileId" IS NOT NULL;

-- Step 3: Add FK constraints
ALTER TABLE "crossfit_class_trainers"
  ADD CONSTRAINT "crossfit_class_trainers_classId_fkey"
  FOREIGN KEY ("classId") REFERENCES "crossfit_classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "crossfit_class_trainers"
  ADD CONSTRAINT "crossfit_class_trainers_trainerProfileId_fkey"
  FOREIGN KEY ("trainerProfileId") REFERENCES "trainer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "crossfit_class_trainers"
  ADD CONSTRAINT "crossfit_class_trainers_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Step 4: Add unique constraint and indexes
CREATE UNIQUE INDEX "crossfit_class_trainers_classId_trainerProfileId_key"
  ON "crossfit_class_trainers"("classId", "trainerProfileId");
CREATE INDEX "crossfit_class_trainers_branchId_idx"
  ON "crossfit_class_trainers"("branchId");
CREATE INDEX "crossfit_class_trainers_classId_idx"
  ON "crossfit_class_trainers"("classId");
CREATE INDEX "crossfit_class_trainers_trainerProfileId_idx"
  ON "crossfit_class_trainers"("trainerProfileId");

-- Step 5: Drop old trainerProfileId column from crossfit_classes
ALTER TABLE "crossfit_classes" DROP COLUMN "trainerProfileId";

-- Step 6: Add CrossfitSessionStatus enum
CREATE TYPE "CrossfitSessionStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED');

-- Step 7: Add status/startedAt/endedAt/startedByUserId to crossfit_sessions
ALTER TABLE "crossfit_sessions"
  ADD COLUMN "status" "CrossfitSessionStatus" NOT NULL DEFAULT 'SCHEDULED',
  ADD COLUMN "startedAt" TIMESTAMP(3),
  ADD COLUMN "endedAt" TIMESTAMP(3),
  ADD COLUMN "startedByUserId" TEXT;

-- Step 8: Add index on crossfit_sessions status
CREATE INDEX "crossfit_sessions_branchId_status_idx" ON "crossfit_sessions"("branchId", "status");
