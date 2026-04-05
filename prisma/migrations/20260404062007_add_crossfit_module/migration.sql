-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'CROSSFIT_TRAINER';

-- CreateTable
CREATE TABLE "crossfit_classes" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "trainerProfileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dayOfWeek" "DayOfWeek" NOT NULL,
    "startTime" TEXT NOT NULL,
    "durationMin" INTEGER NOT NULL DEFAULT 60,
    "maxCapacity" INTEGER NOT NULL DEFAULT 20,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crossfit_classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crossfit_enrollments" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "clientProfileId" TEXT,
    "clientType" "KickboxingClientType" NOT NULL,
    "externalName" TEXT,
    "externalPhone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crossfit_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crossfit_sessions" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crossfit_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crossfit_attendances" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "clientProfileId" TEXT,
    "externalName" TEXT,
    "markedByUserId" TEXT NOT NULL,
    "markedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crossfit_attendances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "crossfit_classes_branchId_idx" ON "crossfit_classes"("branchId");

-- CreateIndex
CREATE INDEX "crossfit_enrollments_branchId_classId_idx" ON "crossfit_enrollments"("branchId", "classId");

-- CreateIndex
CREATE INDEX "crossfit_enrollments_branchId_clientType_idx" ON "crossfit_enrollments"("branchId", "clientType");

-- CreateIndex
CREATE INDEX "crossfit_sessions_branchId_date_idx" ON "crossfit_sessions"("branchId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "crossfit_sessions_classId_date_key" ON "crossfit_sessions"("classId", "date");

-- CreateIndex
CREATE INDEX "crossfit_attendances_branchId_sessionId_idx" ON "crossfit_attendances"("branchId", "sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "crossfit_attendances_sessionId_clientProfileId_key" ON "crossfit_attendances"("sessionId", "clientProfileId");

-- AddForeignKey
ALTER TABLE "crossfit_classes" ADD CONSTRAINT "crossfit_classes_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crossfit_classes" ADD CONSTRAINT "crossfit_classes_trainerProfileId_fkey" FOREIGN KEY ("trainerProfileId") REFERENCES "trainer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crossfit_enrollments" ADD CONSTRAINT "crossfit_enrollments_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crossfit_enrollments" ADD CONSTRAINT "crossfit_enrollments_classId_fkey" FOREIGN KEY ("classId") REFERENCES "crossfit_classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crossfit_enrollments" ADD CONSTRAINT "crossfit_enrollments_clientProfileId_fkey" FOREIGN KEY ("clientProfileId") REFERENCES "client_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crossfit_sessions" ADD CONSTRAINT "crossfit_sessions_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crossfit_sessions" ADD CONSTRAINT "crossfit_sessions_classId_fkey" FOREIGN KEY ("classId") REFERENCES "crossfit_classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crossfit_attendances" ADD CONSTRAINT "crossfit_attendances_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crossfit_attendances" ADD CONSTRAINT "crossfit_attendances_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "crossfit_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crossfit_attendances" ADD CONSTRAINT "crossfit_attendances_clientProfileId_fkey" FOREIGN KEY ("clientProfileId") REFERENCES "client_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
