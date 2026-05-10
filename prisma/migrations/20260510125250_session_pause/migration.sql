-- AlterTable
ALTER TABLE "session_instances" ADD COLUMN     "accumulatedPausedSec" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pauseUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "pausedAt" TIMESTAMP(3),
ADD COLUMN     "pausedByUserId" TEXT;
