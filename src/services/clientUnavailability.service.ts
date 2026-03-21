import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';
import { AppError } from '@/lib/errors';

interface MarkUnavailableInput {
  clientProfileId: string;
  dates: string[];
  actorId: string;
  branchId: string;
}

interface ListUnavailabilityInput {
  clientProfileId: string;
  branchId: string;
  month?: string; // YYYY-MM
}

interface RemoveUnavailabilityInput {
  unavailabilityId: string;
  clientProfileId: string;
  actorId: string;
  branchId: string;
}

/**
 * Mark dates as unavailable for a client.
 * Skips duplicates (upsert-like via skipDuplicates).
 */
export async function markUnavailable({
  clientProfileId,
  dates,
  actorId,
  branchId,
}: MarkUnavailableInput) {
  const records = dates.map((d) => ({
    branchId,
    clientProfileId,
    date: new Date(d),
  }));

  await prisma.clientUnavailability.createMany({
    data: records,
    skipDuplicates: true,
  });

  // Fetch back the created records
  const parsedDates = dates.map((d) => new Date(d));
  const created = await prisma.clientUnavailability.findMany({
    where: {
      branchId,
      clientProfileId,
      date: { in: parsedDates },
    },
    orderBy: { date: 'asc' },
  });

  await auditLog({
    action: 'CLIENT_UNAVAILABILITY_MARKED',
    actorId,
    subjectType: 'ClientUnavailability',
    subjectId: clientProfileId,
    branchId,
    newValue: { dates },
  });

  return created;
}

/**
 * List unavailability dates for a client, optionally filtered by month.
 */
export async function listUnavailability({
  clientProfileId,
  branchId,
  month,
}: ListUnavailabilityInput) {
  const where: Record<string, unknown> = { branchId, clientProfileId };

  if (month) {
    const [yearStr, monthStr] = month.split('-');
    const year = parseInt(yearStr!, 10);
    const m = parseInt(monthStr!, 10);
    where.date = {
      gte: new Date(year, m - 1, 1),
      lte: new Date(year, m, 0, 23, 59, 59),
    };
  }

  return prisma.clientUnavailability.findMany({
    where,
    orderBy: { date: 'asc' },
  });
}

/**
 * Remove an unavailability date.
 */
export async function removeUnavailability({
  unavailabilityId,
  clientProfileId,
  actorId,
  branchId,
}: RemoveUnavailabilityInput) {
  const record = await prisma.clientUnavailability.findFirst({
    where: { id: unavailabilityId, branchId, clientProfileId },
  });

  if (!record) {
    throw new AppError('NOT_FOUND', 'Unavailability record not found', 404);
  }

  await prisma.clientUnavailability.delete({
    where: { id: unavailabilityId },
  });

  await auditLog({
    action: 'CLIENT_UNAVAILABILITY_REMOVED',
    actorId,
    subjectType: 'ClientUnavailability',
    subjectId: unavailabilityId,
    branchId,
    oldValue: { date: record.date.toISOString(), clientProfileId },
  });

  return { success: true };
}
