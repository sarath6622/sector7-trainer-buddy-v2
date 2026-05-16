-- Mark-complete flag on workout logs (ADR-037).
-- Trainer / client tap "Mark complete" in the WorkoutLogger; the row sorts
-- to the bottom of the list, header gets a strikethrough + "Completed"
-- label, the card collapses by default but stays openable so more sets can
-- be added. `completedAt` reflects the most recent transition into the
-- completed state.

ALTER TABLE "workout_logs"
  ADD COLUMN "isCompleted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "completedAt" TIMESTAMP(3);
