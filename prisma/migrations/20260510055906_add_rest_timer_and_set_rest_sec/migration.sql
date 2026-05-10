-- DropForeignKey
ALTER TABLE "crossfit_enrollments" DROP CONSTRAINT "crossfit_enrollments_classId_fkey";

-- DropIndex
DROP INDEX "crossfit_enrollments_branchId_classId_idx";

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "roles" DROP DEFAULT;

-- AlterTable
ALTER TABLE "workout_sets" ADD COLUMN     "restSec" INTEGER;

-- CreateTable
CREATE TABLE "rest_timers" (
    "sessionInstanceId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "endTime" TIMESTAMP(3),
    "pausedRemainingSec" INTEGER,
    "totalSec" INTEGER NOT NULL,
    "startedByUserId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rest_timers_pkey" PRIMARY KEY ("sessionInstanceId")
);

-- CreateIndex
CREATE INDEX "rest_timers_branchId_updatedAt_idx" ON "rest_timers"("branchId", "updatedAt");

-- CreateIndex
CREATE INDEX "crossfit_enrollments_branchId_idx" ON "crossfit_enrollments"("branchId");

-- AddForeignKey
ALTER TABLE "rest_timers" ADD CONSTRAINT "rest_timers_sessionInstanceId_fkey" FOREIGN KEY ("sessionInstanceId") REFERENCES "session_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rest_timers" ADD CONSTRAINT "rest_timers_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crossfit_enrollments" ADD CONSTRAINT "crossfit_enrollments_classId_fkey" FOREIGN KEY ("classId") REFERENCES "crossfit_classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
