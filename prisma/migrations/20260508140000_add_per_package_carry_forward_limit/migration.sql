-- Phase 24 — Per-Package Carry-Forward Limit Override (ADR-026)
-- Adds pt_packages.carryForwardLimit (nullable). When null, the cycle-end
-- carry-forward processor falls back to BranchSettings.carryForwardLimit.

ALTER TABLE "pt_packages" ADD COLUMN "carryForwardLimit" INTEGER;
