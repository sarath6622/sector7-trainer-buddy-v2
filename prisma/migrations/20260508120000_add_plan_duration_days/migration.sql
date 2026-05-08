-- Phase 25 follow-up — Plan duration in days
-- Adds pt_package_plans.durationDays so the mapping form can auto-derive endDate
-- from startDate + durationDays when a plan is selected.

ALTER TABLE "pt_package_plans" ADD COLUMN "durationDays" INTEGER NOT NULL DEFAULT 30;
