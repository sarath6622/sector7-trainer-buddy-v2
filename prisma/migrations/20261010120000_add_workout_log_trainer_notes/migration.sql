-- ADR-052: per-exercise trainer note on the workout log.
--
-- Trainers asked for somewhere to jot a free-text note about one exercise
-- within a session ("went light, shoulder niggle", "form broke down on set 3").
-- Neither existing notes column could carry it:
--   • SessionInstance.notes — scheduling/reschedule note, whole-session scope
--   • WorkoutSet.notes      — occupied by CARDIO distance (km / m)
--
-- Nullable with no default, so every existing log row reads back as "no note"
-- and no backfill is needed.

ALTER TABLE "workout_logs" ADD COLUMN "notes" TEXT;
