-- CreateEnum
CREATE TYPE "RoutineSetType" AS ENUM ('WARMUP', 'NORMAL', 'FAILURE', 'DROP');

-- AlterTable
ALTER TABLE "session_instances" ADD COLUMN     "routineId" TEXT;

-- CreateTable
CREATE TABLE "routine_programs" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "clientProfileId" TEXT,
    "sourceProgramId" TEXT,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "routine_programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routines" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "orderIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "routines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routine_exercises" (
    "id" TEXT NOT NULL,
    "routineId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "restSec" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "routine_exercises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routine_sets" (
    "id" TEXT NOT NULL,
    "routineExerciseId" TEXT NOT NULL,
    "setNumber" INTEGER NOT NULL,
    "setType" "RoutineSetType" NOT NULL DEFAULT 'NORMAL',
    "targetRepsMin" INTEGER,
    "targetRepsMax" INTEGER,
    "targetWeightKg" DOUBLE PRECISION,
    "targetDurationSec" INTEGER,
    "targetStepsCount" INTEGER,
    "targetDistance" DOUBLE PRECISION,

    CONSTRAINT "routine_sets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "routine_programs_branchId_clientProfileId_idx" ON "routine_programs"("branchId", "clientProfileId");

-- CreateIndex
CREATE INDEX "routines_programId_idx" ON "routines"("programId");

-- CreateIndex
CREATE INDEX "routine_exercises_routineId_idx" ON "routine_exercises"("routineId");

-- CreateIndex
CREATE UNIQUE INDEX "routine_exercises_routineId_exerciseId_key" ON "routine_exercises"("routineId", "exerciseId");

-- CreateIndex
CREATE INDEX "routine_sets_routineExerciseId_idx" ON "routine_sets"("routineExerciseId");

-- AddForeignKey
ALTER TABLE "session_instances" ADD CONSTRAINT "session_instances_routineId_fkey" FOREIGN KEY ("routineId") REFERENCES "routines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routine_programs" ADD CONSTRAINT "routine_programs_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routine_programs" ADD CONSTRAINT "routine_programs_clientProfileId_fkey" FOREIGN KEY ("clientProfileId") REFERENCES "client_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routines" ADD CONSTRAINT "routines_programId_fkey" FOREIGN KEY ("programId") REFERENCES "routine_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routine_exercises" ADD CONSTRAINT "routine_exercises_routineId_fkey" FOREIGN KEY ("routineId") REFERENCES "routines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routine_exercises" ADD CONSTRAINT "routine_exercises_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "exercises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routine_sets" ADD CONSTRAINT "routine_sets_routineExerciseId_fkey" FOREIGN KEY ("routineExerciseId") REFERENCES "routine_exercises"("id") ON DELETE CASCADE ON UPDATE CASCADE;

