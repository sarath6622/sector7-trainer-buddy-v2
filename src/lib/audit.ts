import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';

interface AuditLogInput {
  action: string;
  actorId: string;
  subjectType: string;
  subjectId: string;
  branchId: string;
  oldValue?: Prisma.InputJsonValue | null;
  newValue?: Prisma.InputJsonValue | null;
  metadata?: Prisma.InputJsonValue | null;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Writes an immutable audit log entry.
 * Must be called for every create, update, or delete of operational data.
 */
export async function auditLog(input: AuditLogInput): Promise<void> {
  await prisma.auditLog.create({
    data: {
      branchId: input.branchId,
      actorId: input.actorId,
      action: input.action,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      oldValue: input.oldValue ?? undefined,
      newValue: input.newValue ?? undefined,
      metadata: input.metadata ?? undefined,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    },
  });
}
