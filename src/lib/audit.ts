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
 * Errors are logged to console but never propagated — audit failures must
 * not crash the parent operation.
 */
export async function auditLog(input: AuditLogInput): Promise<void> {
  try {
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
  } catch (err) {
    // Never crash the calling operation due to an audit write failure
    console.error('[auditLog] Failed to write audit entry:', input.action, err);
  }
}
