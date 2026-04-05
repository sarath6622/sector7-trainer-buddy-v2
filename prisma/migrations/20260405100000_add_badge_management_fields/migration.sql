-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "GenderFilter" AS ENUM ('MALE', 'FEMALE', 'ALL');

-- AlterEnum
ALTER TYPE "BadgeType" ADD VALUE 'WEIGHT_LIFTED';

-- AlterTable
ALTER TABLE "badge_definitions" ADD COLUMN     "exerciseId" TEXT,
ADD COLUMN     "genderFilter" "GenderFilter" NOT NULL DEFAULT 'ALL',
ADD COLUMN     "howToEarn" TEXT,
ADD COLUMN     "imageUrl" TEXT;

-- AlterTable
ALTER TABLE "client_profiles" ADD COLUMN     "gender" "Gender";

-- CreateIndex
CREATE INDEX "badge_definitions_type_isActive_idx" ON "badge_definitions"("type", "isActive");

-- AddForeignKey
ALTER TABLE "badge_definitions" ADD CONSTRAINT "badge_definitions_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "exercises"("id") ON DELETE SET NULL ON UPDATE CASCADE;
