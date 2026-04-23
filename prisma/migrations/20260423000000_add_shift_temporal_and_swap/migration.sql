-- CreateEnum
CREATE TYPE "SwapStatus" AS ENUM ('PENDING', 'APPROVED', 'CANCELLED');

-- AlterTable
ALTER TABLE "trainer_shifts" ADD COLUMN     "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "effectiveUntil" TIMESTAMP(3),
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "shift_swaps" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "trainerAProfileId" TEXT NOT NULL,
    "trainerBProfileId" TEXT NOT NULL,
    "swapFrom" TIMESTAMP(3) NOT NULL,
    "swapUntil" TIMESTAMP(3) NOT NULL,
    "status" "SwapStatus" NOT NULL DEFAULT 'PENDING',
    "requestedByUserId" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shift_swaps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shift_swaps_branchId_swapFrom_idx" ON "shift_swaps"("branchId", "swapFrom");

-- CreateIndex
CREATE INDEX "shift_swaps_trainerAProfileId_status_idx" ON "shift_swaps"("trainerAProfileId", "status");

-- CreateIndex
CREATE INDEX "shift_swaps_trainerBProfileId_status_idx" ON "shift_swaps"("trainerBProfileId", "status");

-- CreateIndex
CREATE INDEX "trainer_shifts_trainerProfileId_effectiveFrom_idx" ON "trainer_shifts"("trainerProfileId", "effectiveFrom");

-- AddForeignKey
ALTER TABLE "shift_swaps" ADD CONSTRAINT "shift_swaps_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_swaps" ADD CONSTRAINT "shift_swaps_trainerAProfileId_fkey" FOREIGN KEY ("trainerAProfileId") REFERENCES "trainer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_swaps" ADD CONSTRAINT "shift_swaps_trainerBProfileId_fkey" FOREIGN KEY ("trainerBProfileId") REFERENCES "trainer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_swaps" ADD CONSTRAINT "shift_swaps_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
