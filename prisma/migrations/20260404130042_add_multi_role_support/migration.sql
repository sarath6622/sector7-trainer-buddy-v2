-- Add roles column as array, copy existing role values
ALTER TABLE "users" ADD COLUMN "roles" "UserRole"[] NOT NULL DEFAULT ARRAY[]::"UserRole"[];

-- Migrate existing role values to roles array
UPDATE "users" SET "roles" = ARRAY["role"] WHERE "role" IS NOT NULL;

-- Drop the old role column
ALTER TABLE "users" DROP COLUMN "role";

-- Update index: remove old [branchId, role] index
DROP INDEX IF EXISTS "users_branchId_role_idx";

-- Re-create index on branchId only
CREATE INDEX "users_branchId_idx" ON "users"("branchId");
