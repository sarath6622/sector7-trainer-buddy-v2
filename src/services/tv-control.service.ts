import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';

const DEFAULT_SHOUTOUT_TTL_SEC = 60;

export interface TvControlSnapshot {
  /** Panels the TV rotates through. Empty = auto-rotate everything. */
  pinnedPanels: string[];
  shoutout: { message: string; expiresAt: string } | null;
}

/**
 * Read the current TV control state for a branch. Returns a normalized view —
 * an expired shoutout is reported as `null` so the TV never displays a stale
 * banner even if the cleanup row hasn't been overwritten yet.
 */
export async function getTvControlState(branchId: string): Promise<TvControlSnapshot> {
  const row = await prisma.tvControlState.findUnique({ where: { branchId } });
  if (!row) return { pinnedPanels: [], shoutout: null };

  const shoutoutLive =
    row.shoutout && row.shoutoutExpiresAt && row.shoutoutExpiresAt.getTime() > Date.now();

  return {
    pinnedPanels: row.pinnedPanels,
    shoutout: shoutoutLive
      ? { message: row.shoutout!, expiresAt: row.shoutoutExpiresAt!.toISOString() }
      : null,
  };
}

export interface UpdateTvControlInput {
  branchId: string;
  actorId: string;
  pinnedPanels?: string[];
  shoutout?: string | null;
  shoutoutTtlSec?: number;
}

function samePanels(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((v, i) => v === sortedB[i]);
}

/**
 * Upsert pin / shoutout. Either field can be omitted (keeps existing value)
 * or explicitly set to null (clears it). The TV picks up the change on its
 * next `/api/admin/tv/live` poll (≤10s) — no Pusher fanout, just polling.
 *
 * Audit: emits `TV_PIN_SET` and/or `TV_SHOUTOUT_BROADCAST` — one per field
 * mutated, so a single call that changes both yields two audit rows.
 */
export async function updateTvControlState(input: UpdateTvControlInput) {
  const { branchId, actorId, pinnedPanels, shoutout, shoutoutTtlSec } = input;

  const existing = await prisma.tvControlState.findUnique({ where: { branchId } });

  const pinChanged =
    pinnedPanels !== undefined && !samePanels(pinnedPanels, existing?.pinnedPanels ?? []);
  const shoutoutChanged = shoutout !== undefined;

  const expiresAt =
    shoutout != null
      ? new Date(Date.now() + (shoutoutTtlSec ?? DEFAULT_SHOUTOUT_TTL_SEC) * 1000)
      : null;

  const data = {
    ...(pinnedPanels !== undefined && { pinnedPanels }),
    ...(shoutout !== undefined && {
      shoutout: shoutout,
      shoutoutExpiresAt: expiresAt,
    }),
    updatedByUserId: actorId,
  };

  const row = await prisma.tvControlState.upsert({
    where: { branchId },
    update: data,
    create: { branchId, ...data },
  });

  if (pinChanged) {
    await auditLog({
      action: 'TV_PIN_SET',
      actorId,
      subjectType: 'TvControlState',
      subjectId: row.id,
      branchId,
      oldValue: { pinnedPanels: existing?.pinnedPanels ?? [] },
      newValue: { pinnedPanels },
    });
  }

  if (shoutoutChanged && shoutout) {
    await auditLog({
      action: 'TV_SHOUTOUT_BROADCAST',
      actorId,
      subjectType: 'TvControlState',
      subjectId: row.id,
      branchId,
      newValue: { message: shoutout, expiresAt: expiresAt!.toISOString() },
    });
  }

  return {
    id: row.id,
    branchId: row.branchId,
    pinnedPanels: row.pinnedPanels,
    shoutout: row.shoutout,
    shoutoutExpiresAt: row.shoutoutExpiresAt,
    updatedByUserId: row.updatedByUserId,
    updatedAt: row.updatedAt,
  };
}
