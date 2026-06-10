-- Reconcile schema drift: the original 20260514100000_tv_control_multi_pin
-- migration created tv_control_state.pinnedPanels with a DB-level
-- DEFAULT ARRAY[]::TEXT[], but the Prisma model never declared @default([]).
-- This re-asserts the default so schema, local Docker, and Neon all agree.
-- Idempotent: a no-op where the default is already present.

-- AlterTable
ALTER TABLE "tv_control_state" ALTER COLUMN "pinnedPanels" SET DEFAULT ARRAY[]::TEXT[];
