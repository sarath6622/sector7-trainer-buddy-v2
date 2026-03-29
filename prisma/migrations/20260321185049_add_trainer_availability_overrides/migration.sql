-- CreateTable
CREATE TABLE "trainer_availability_overrides" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "trainerProfileId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "isAvailable" BOOLEAN NOT NULL,
    "startTime" TEXT,
    "endTime" TEXT,
    "reason" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trainer_availability_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trainer_availability_overrides_branchId_date_idx" ON "trainer_availability_overrides"("branchId", "date");

-- CreateIndex
CREATE INDEX "trainer_availability_overrides_trainerProfileId_date_idx" ON "trainer_availability_overrides"("trainerProfileId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "trainer_availability_overrides_trainerProfileId_date_key" ON "trainer_availability_overrides"("trainerProfileId", "date");

-- AddForeignKey
ALTER TABLE "trainer_availability_overrides" ADD CONSTRAINT "trainer_availability_overrides_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainer_availability_overrides" ADD CONSTRAINT "trainer_availability_overrides_trainerProfileId_fkey" FOREIGN KEY ("trainerProfileId") REFERENCES "trainer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
