-- Phase 1: Add KickboxingSession + KickboxingAttendance models, add name to KickboxingClass

-- CreateEnum
CREATE TYPE "KickboxingSessionStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED');

-- AlterTable: add name column to kickboxing_classes (default '' for existing rows, then drop default)
ALTER TABLE "kickboxing_classes" ADD COLUMN "name" TEXT NOT NULL DEFAULT '';
ALTER TABLE "kickboxing_classes" ALTER COLUMN "name" DROP DEFAULT;

-- CreateTable: kickboxing_sessions
CREATE TABLE "kickboxing_sessions" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" "KickboxingSessionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "startedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kickboxing_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable: kickboxing_attendances
CREATE TABLE "kickboxing_attendances" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "clientProfileId" TEXT,
    "externalName" TEXT,
    "markedByUserId" TEXT NOT NULL,
    "markedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kickboxing_attendances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "kickboxing_sessions_branchId_date_idx" ON "kickboxing_sessions"("branchId", "date");

-- CreateIndex
CREATE INDEX "kickboxing_sessions_branchId_status_idx" ON "kickboxing_sessions"("branchId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "kickboxing_sessions_classId_date_key" ON "kickboxing_sessions"("classId", "date");

-- CreateIndex
CREATE INDEX "kickboxing_attendances_branchId_sessionId_idx" ON "kickboxing_attendances"("branchId", "sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "kickboxing_attendances_sessionId_clientProfileId_key" ON "kickboxing_attendances"("sessionId", "clientProfileId");

-- AddForeignKey
ALTER TABLE "kickboxing_sessions" ADD CONSTRAINT "kickboxing_sessions_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kickboxing_sessions" ADD CONSTRAINT "kickboxing_sessions_classId_fkey" FOREIGN KEY ("classId") REFERENCES "kickboxing_classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kickboxing_attendances" ADD CONSTRAINT "kickboxing_attendances_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kickboxing_attendances" ADD CONSTRAINT "kickboxing_attendances_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "kickboxing_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kickboxing_attendances" ADD CONSTRAINT "kickboxing_attendances_clientProfileId_fkey" FOREIGN KEY ("clientProfileId") REFERENCES "client_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
