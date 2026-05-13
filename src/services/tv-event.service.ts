import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';

export interface TvEventRow {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  icon: string | null;
  eventAt: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

function rowFromDb(r: {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  icon: string | null;
  eventAt: Date;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): TvEventRow {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    location: r.location,
    icon: r.icon,
    eventAt: r.eventAt.toISOString(),
    sortOrder: r.sortOrder,
    isActive: r.isActive,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

/** Full list (including inactive/past) — for admin management UI. */
export async function listAllEvents(branchId: string): Promise<TvEventRow[]> {
  const rows = await prisma.tvEvent.findMany({
    where: { branchId },
    orderBy: [{ eventAt: 'asc' }, { sortOrder: 'asc' }],
  });
  return rows.map(rowFromDb);
}

/**
 * Active, future-dated events — what the TV "Coming Up" board renders. Past
 * events fall off automatically as `eventAt` slips below `now`.
 */
export async function listUpcomingEvents(branchId: string, limit = 5): Promise<TvEventRow[]> {
  const now = new Date();
  const rows = await prisma.tvEvent.findMany({
    where: { branchId, isActive: true, eventAt: { gte: now } },
    orderBy: [{ eventAt: 'asc' }, { sortOrder: 'asc' }],
    take: limit,
  });
  return rows.map(rowFromDb);
}

export interface CreateEventInput {
  branchId: string;
  actorId: string;
  title: string;
  description?: string | null;
  location?: string | null;
  icon?: string | null;
  eventAt: Date;
  sortOrder?: number;
  isActive?: boolean;
}

export async function createEvent(input: CreateEventInput): Promise<TvEventRow> {
  const row = await prisma.tvEvent.create({
    data: {
      branchId: input.branchId,
      title: input.title,
      description: input.description ?? null,
      location: input.location ?? null,
      icon: input.icon ?? null,
      eventAt: input.eventAt,
      sortOrder: input.sortOrder ?? 0,
      isActive: input.isActive ?? true,
      createdByUserId: input.actorId,
    },
  });

  await auditLog({
    action: 'TV_EVENT_CREATED',
    actorId: input.actorId,
    subjectType: 'TvEvent',
    subjectId: row.id,
    branchId: input.branchId,
    newValue: {
      title: row.title,
      description: row.description,
      location: row.location,
      icon: row.icon,
      eventAt: row.eventAt.toISOString(),
      isActive: row.isActive,
    },
  });

  return rowFromDb(row);
}

export interface UpdateEventInput {
  id: string;
  branchId: string;
  actorId: string;
  title?: string;
  description?: string | null;
  location?: string | null;
  icon?: string | null;
  eventAt?: Date;
  sortOrder?: number;
  isActive?: boolean;
}

export async function updateEvent(input: UpdateEventInput): Promise<TvEventRow> {
  const existing = await prisma.tvEvent.findFirst({
    where: { id: input.id, branchId: input.branchId },
  });
  if (!existing) {
    throw new Error('Event not found');
  }

  const row = await prisma.tvEvent.update({
    where: { id: input.id },
    data: {
      ...(input.title !== undefined && { title: input.title }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.location !== undefined && { location: input.location }),
      ...(input.icon !== undefined && { icon: input.icon }),
      ...(input.eventAt !== undefined && { eventAt: input.eventAt }),
      ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    },
  });

  await auditLog({
    action: 'TV_EVENT_UPDATED',
    actorId: input.actorId,
    subjectType: 'TvEvent',
    subjectId: row.id,
    branchId: input.branchId,
    oldValue: {
      title: existing.title,
      description: existing.description,
      location: existing.location,
      icon: existing.icon,
      eventAt: existing.eventAt.toISOString(),
      isActive: existing.isActive,
    },
    newValue: {
      title: row.title,
      description: row.description,
      location: row.location,
      icon: row.icon,
      eventAt: row.eventAt.toISOString(),
      isActive: row.isActive,
    },
  });

  return rowFromDb(row);
}

export async function deleteEvent(input: {
  id: string;
  branchId: string;
  actorId: string;
}): Promise<void> {
  const existing = await prisma.tvEvent.findFirst({
    where: { id: input.id, branchId: input.branchId },
  });
  if (!existing) {
    throw new Error('Event not found');
  }

  await prisma.tvEvent.delete({ where: { id: input.id } });

  await auditLog({
    action: 'TV_EVENT_DELETED',
    actorId: input.actorId,
    subjectType: 'TvEvent',
    subjectId: input.id,
    branchId: input.branchId,
    oldValue: {
      title: existing.title,
      description: existing.description,
      location: existing.location,
      icon: existing.icon,
      eventAt: existing.eventAt.toISOString(),
      isActive: existing.isActive,
    },
  });
}
