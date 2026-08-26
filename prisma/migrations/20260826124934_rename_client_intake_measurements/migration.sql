-- Rename the two admin-entered intake measurements so their names stop claiming
-- to be live values. Neither column was ever synced from `progress_entries` —
-- they are recorded once at signup and never updated. See ADR-050.
--
-- RENAME (not DROP + ADD) so existing intake data is preserved.

ALTER TABLE "client_profiles" RENAME COLUMN "currentWeight" TO "intakeWeight";
ALTER TABLE "client_profiles" RENAME COLUMN "bodyFatPercentage" TO "intakeBodyFat";
