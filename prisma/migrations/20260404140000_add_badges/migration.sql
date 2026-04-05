-- CreateEnum
CREATE TYPE "BadgeType" AS ENUM ('STREAK', 'PERSONAL_RECORD', 'BODY_COMPOSITION', 'SESSION_MILESTONE');

-- CreateTable
CREATE TABLE "badge_definitions" (
    "id" TEXT NOT NULL,
    "type" "BadgeType" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "thresholdValue" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "badge_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_badges" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "clientProfileId" TEXT NOT NULL,
    "badgeDefinitionId" TEXT NOT NULL,
    "context" TEXT NOT NULL DEFAULT '',
    "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "displayOnProfile" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,

    CONSTRAINT "user_badges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_badges_branchId_clientProfileId_idx" ON "user_badges"("branchId", "clientProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "user_badges_clientProfileId_badgeDefinitionId_context_key" ON "user_badges"("clientProfileId", "badgeDefinitionId", "context");

-- AddForeignKey
ALTER TABLE "user_badges" ADD CONSTRAINT "user_badges_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_badges" ADD CONSTRAINT "user_badges_clientProfileId_fkey" FOREIGN KEY ("clientProfileId") REFERENCES "client_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_badges" ADD CONSTRAINT "user_badges_badgeDefinitionId_fkey" FOREIGN KEY ("badgeDefinitionId") REFERENCES "badge_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
