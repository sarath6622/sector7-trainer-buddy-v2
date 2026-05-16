-- CreateEnum
CREATE TYPE "SecondaryMetric" AS ENUM ('KM', 'STEPS', 'METERS', 'NONE');

-- AlterTable
ALTER TABLE "exercises" ADD COLUMN "secondaryMetric" "SecondaryMetric" NOT NULL DEFAULT 'KM';

-- AlterTable
ALTER TABLE "workout_sets" ADD COLUMN "stepsCount" INTEGER;
