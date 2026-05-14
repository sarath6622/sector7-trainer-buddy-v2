-- TvControlState: replace single `pinnedPanel` with `pinnedPanels` array so the
-- admin can pin a subset of panels for the TV to rotate through.
ALTER TABLE "tv_control_state" ADD COLUMN "pinnedPanels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Preserve any existing single pin as a one-element array.
UPDATE "tv_control_state" SET "pinnedPanels" = ARRAY["pinnedPanel"] WHERE "pinnedPanel" IS NOT NULL;

ALTER TABLE "tv_control_state" DROP COLUMN "pinnedPanel";
