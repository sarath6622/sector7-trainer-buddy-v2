-- Phase 25 — PT Package Plans (Catalog)
-- Adds:
--   1. pt_package_plans table — per-branch catalog of named plans
--   2. pt_packages.planId column — FK to pt_package_plans (nullable; legacy assignments stay null)

-- ─── 1. pt_package_plans ─────────────────────────────────────

CREATE TABLE "pt_package_plans" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sessionsPerMonth" INTEGER NOT NULL,
    "pricePerCycle" DOUBLE PRECISION NOT NULL,
    "sessionChargeAmount" DOUBLE PRECISION,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pt_package_plans_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pt_package_plans_branchId_name_key" ON "pt_package_plans"("branchId", "name");
CREATE INDEX "pt_package_plans_branchId_isActive_idx" ON "pt_package_plans"("branchId", "isActive");

ALTER TABLE "pt_package_plans"
    ADD CONSTRAINT "pt_package_plans_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── 2. pt_packages.planId ────────────────────────────────────

ALTER TABLE "pt_packages" ADD COLUMN "planId" TEXT;

CREATE INDEX "pt_packages_branchId_planId_idx" ON "pt_packages"("branchId", "planId");

ALTER TABLE "pt_packages"
    ADD CONSTRAINT "pt_packages_planId_fkey"
    FOREIGN KEY ("planId") REFERENCES "pt_package_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
