-- CreateEnum
CREATE TYPE "ThresholdUnit" AS ENUM ('KG', 'REPS', 'SECONDS');

-- CreateEnum
CREATE TYPE "DurationCondition" AS ENUM ('LONGER_IS_BETTER', 'SHORTER_IS_BETTER');

-- AlterEnum
ALTER TYPE "BadgeType" ADD VALUE 'EXERCISE_MILESTONE';

-- AlterTable
ALTER TABLE "badge_definitions" ADD COLUMN     "durationCondition" "DurationCondition",
ADD COLUMN     "thresholdUnit" "ThresholdUnit";

-- Backfill existing WEIGHT_LIFTED badges to have thresholdUnit = KG
UPDATE "badge_definitions" SET "thresholdUnit" = 'KG' WHERE "type" = 'WEIGHT_LIFTED';
