-- Phase 25 follow-up — Package-window session accounting + onboarding backfill
--   1. totalSessions: authoritative count for the full package window
--   2. onboardingUsedSessions: sessions consumed before the app onboarding
--   3. onboardingNotes: optional context for the backfill

ALTER TABLE "pt_packages" ADD COLUMN "totalSessions" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "pt_packages" ADD COLUMN "onboardingUsedSessions" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "pt_packages" ADD COLUMN "onboardingNotes" TEXT;

-- Backfill totalSessions:
--   For mappings with a plan: sessionsPerMonth × round(durationDays / 30)
--   For mappings without a plan: sessionsPerMonth (assume single-month cycle)

UPDATE "pt_packages" p
SET "totalSessions" = ROUND(p."sessionsPerMonth"::numeric * pp."durationDays"::numeric / 30)::int
FROM "pt_package_plans" pp
WHERE p."planId" = pp.id;

UPDATE "pt_packages"
SET "totalSessions" = "sessionsPerMonth"
WHERE "totalSessions" = 0;
