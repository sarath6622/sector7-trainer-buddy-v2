-- CreateEnum
CREATE TYPE "LeaveType" AS ENUM ('FULL_DAY', 'HALF_DAY_AM', 'HALF_DAY_PM', 'CUSTOM');

-- AlterTable
ALTER TABLE "leave_requests" ADD COLUMN     "endTime" TEXT,
ADD COLUMN     "leaveType" "LeaveType" NOT NULL DEFAULT 'FULL_DAY',
ADD COLUMN     "startTime" TEXT;
