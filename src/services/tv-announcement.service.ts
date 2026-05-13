import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';

export interface TvAnnouncementRow {
  id: string;
  title: string;
  body: string;
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function rowFromDb(r: {
  id: string;
  title: string;
  body: string;
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): TvAnnouncementRow {
  return {
    id: r.id,
    title: r.title,
    body: r.body,
    icon: r.icon,
    sortOrder: r.sortOrder,
    isActive: r.isActive,
    expiresAt: r.expiresAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

/** Full list (including inactive/expired) — for admin management UI. */
export async function listAllAnnouncements(branchId: string): Promise<TvAnnouncementRow[]> {
  const rows = await prisma.tvAnnouncement.findMany({
    where: { branchId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  return rows.map(rowFromDb);
}

/** Active, non-expired slides — what the TV actually plays. */
export async function listLiveAnnouncements(branchId: string): Promise<TvAnnouncementRow[]> {
  const now = new Date();
  const rows = await prisma.tvAnnouncement.findMany({
    where: {
      branchId,
      isActive: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  return rows.map(rowFromDb);
}

export interface CreateAnnouncementInput {
  branchId: string;
  actorId: string;
  title: string;
  body: string;
  icon?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  expiresAt?: Date | null;
}

export async function createAnnouncement(
  input: CreateAnnouncementInput,
): Promise<TvAnnouncementRow> {
  const row = await prisma.tvAnnouncement.create({
    data: {
      branchId: input.branchId,
      title: input.title,
      body: input.body,
      icon: input.icon ?? null,
      sortOrder: input.sortOrder ?? 0,
      isActive: input.isActive ?? true,
      expiresAt: input.expiresAt ?? null,
      createdByUserId: input.actorId,
    },
  });

  await auditLog({
    action: 'TV_ANNOUNCEMENT_CREATED',
    actorId: input.actorId,
    subjectType: 'TvAnnouncement',
    subjectId: row.id,
    branchId: input.branchId,
    newValue: {
      title: row.title,
      body: row.body,
      icon: row.icon,
      isActive: row.isActive,
      expiresAt: row.expiresAt?.toISOString() ?? null,
    },
  });

  return rowFromDb(row);
}

export interface UpdateAnnouncementInput {
  id: string;
  branchId: string;
  actorId: string;
  title?: string;
  body?: string;
  icon?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  expiresAt?: Date | null;
}

export async function updateAnnouncement(
  input: UpdateAnnouncementInput,
): Promise<TvAnnouncementRow> {
  const existing = await prisma.tvAnnouncement.findFirst({
    where: { id: input.id, branchId: input.branchId },
  });
  if (!existing) {
    throw new Error('Announcement not found');
  }

  const row = await prisma.tvAnnouncement.update({
    where: { id: input.id },
    data: {
      ...(input.title !== undefined && { title: input.title }),
      ...(input.body !== undefined && { body: input.body }),
      ...(input.icon !== undefined && { icon: input.icon }),
      ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
      ...(input.expiresAt !== undefined && { expiresAt: input.expiresAt }),
    },
  });

  await auditLog({
    action: 'TV_ANNOUNCEMENT_UPDATED',
    actorId: input.actorId,
    subjectType: 'TvAnnouncement',
    subjectId: row.id,
    branchId: input.branchId,
    oldValue: {
      title: existing.title,
      body: existing.body,
      icon: existing.icon,
      isActive: existing.isActive,
      expiresAt: existing.expiresAt?.toISOString() ?? null,
    },
    newValue: {
      title: row.title,
      body: row.body,
      icon: row.icon,
      isActive: row.isActive,
      expiresAt: row.expiresAt?.toISOString() ?? null,
    },
  });

  return rowFromDb(row);
}

export async function deleteAnnouncement(input: {
  id: string;
  branchId: string;
  actorId: string;
}): Promise<void> {
  const existing = await prisma.tvAnnouncement.findFirst({
    where: { id: input.id, branchId: input.branchId },
  });
  if (!existing) {
    throw new Error('Announcement not found');
  }

  await prisma.tvAnnouncement.delete({ where: { id: input.id } });

  await auditLog({
    action: 'TV_ANNOUNCEMENT_DELETED',
    actorId: input.actorId,
    subjectType: 'TvAnnouncement',
    subjectId: input.id,
    branchId: input.branchId,
    oldValue: {
      title: existing.title,
      body: existing.body,
      icon: existing.icon,
      isActive: existing.isActive,
      expiresAt: existing.expiresAt?.toISOString() ?? null,
    },
  });
}
