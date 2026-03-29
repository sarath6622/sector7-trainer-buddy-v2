-- CreateEnum
CREATE TYPE "ExerciseType" AS ENUM ('WEIGHTED', 'BODYWEIGHT', 'DURATION', 'CARDIO');

-- AlterTable
ALTER TABLE "exercises" ADD COLUMN     "exerciseType" "ExerciseType" NOT NULL DEFAULT 'WEIGHTED';
