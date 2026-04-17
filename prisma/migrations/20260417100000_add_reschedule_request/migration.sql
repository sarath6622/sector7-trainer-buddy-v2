-- CreateEnum
CREATE TYPE "RescheduleStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable: add createdByUserId to session_schedules (nullable for backward compat)
ALTER TABLE "session_schedules" ADD COLUMN "createdByUserId" TEXT;

-- AlterTable: add rescheduleRequests relation to session_instances (done via FK on new table)

-- CreateTable
CREATE TABLE "reschedule_requests" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "sessionInstanceId" TEXT NOT NULL,
    "clientProfileId" TEXT NOT NULL,
    "requestedDate" TIMESTAMP(3) NOT NULL,
    "requestedTime" TEXT NOT NULL,
    "reason" TEXT,
    "status" "RescheduleStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reschedule_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reschedule_requests_branchId_status_idx" ON "reschedule_requests"("branchId", "status");

-- CreateIndex
CREATE INDEX "reschedule_requests_branchId_clientProfileId_idx" ON "reschedule_requests"("branchId", "clientProfileId");

-- CreateIndex
CREATE INDEX "reschedule_requests_sessionInstanceId_idx" ON "reschedule_requests"("sessionInstanceId");

-- AddForeignKey
ALTER TABLE "reschedule_requests" ADD CONSTRAINT "reschedule_requests_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reschedule_requests" ADD CONSTRAINT "reschedule_requests_sessionInstanceId_fkey" FOREIGN KEY ("sessionInstanceId") REFERENCES "session_instances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reschedule_requests" ADD CONSTRAINT "reschedule_requests_clientProfileId_fkey" FOREIGN KEY ("clientProfileId") REFERENCES "client_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
