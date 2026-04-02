-- CreateEnum
CREATE TYPE "LeaveCategory" AS ENUM ('REGULAR', 'EMERGENCY');

-- AlterTable
ALTER TABLE "branch_settings" ADD COLUMN     "monthlyEmergencyLeaveQuota" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "monthlyRegularLeaveQuota" INTEGER NOT NULL DEFAULT 5;

-- AlterTable
ALTER TABLE "leave_requests" ADD COLUMN     "leaveCategory" "LeaveCategory" NOT NULL DEFAULT 'REGULAR';
