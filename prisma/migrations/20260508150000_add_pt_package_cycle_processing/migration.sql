-- Phase 24 — PT Package cycle-end processing bookkeeping
--   carryForwardOutSessions: unused sessions rolled into the next package
--   lastProcessedAt: idempotency guard for the cycle-end cron

ALTER TABLE "pt_packages" ADD COLUMN "carryForwardOutSessions" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "pt_packages" ADD COLUMN "lastProcessedAt" TIMESTAMP(3);
