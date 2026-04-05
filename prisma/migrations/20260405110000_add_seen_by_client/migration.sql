-- AlterTable
ALTER TABLE "user_badges" ADD COLUMN "seenByClient" BOOLEAN NOT NULL DEFAULT false;

-- Mark all existing badges as seen (they were earned before this feature)
UPDATE "user_badges" SET "seenByClient" = true;
