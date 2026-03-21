import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';
import type { Prisma } from '@prisma/client';

interface UpdateSettingsInput {
  defaultSessionDurationMin?: number;
  carryForwardLimit?: number;
  cancellationPolicyEnabled?: boolean;
  cancellationWindowMin?: number;
  reminderTimingMin?: number;
  noShowThresholdMin?: number;
  kickboxingClassSizeLimit?: number;
}

/**
 * Get branch settings, creating defaults if none exist.
 */
export async function getSettings(branchId: string) {
  let settings = await prisma.branchSettings.findUnique({
    where: { branchId },
  });

  if (!settings) {
    settings = await prisma.branchSettings.create({
      data: { branchId },
    });
  }

  return settings;
}

/**
 * Update branch settings with audit logging of old → new values.
 */
export async function updateSettings(
  branchId: string,
  input: UpdateSettingsInput,
  actorId: string,
) {
  const existing = await getSettings(branchId);

  const updateData: Prisma.BranchSettingsUpdateInput = {};
  if (input.defaultSessionDurationMin !== undefined)
    updateData.defaultSessionDurationMin = input.defaultSessionDurationMin;
  if (input.carryForwardLimit !== undefined) updateData.carryForwardLimit = input.carryForwardLimit;
  if (input.cancellationPolicyEnabled !== undefined)
    updateData.cancellationPolicyEnabled = input.cancellationPolicyEnabled;
  if (input.cancellationWindowMin !== undefined)
    updateData.cancellationWindowMin = input.cancellationWindowMin;
  if (input.reminderTimingMin !== undefined) updateData.reminderTimingMin = input.reminderTimingMin;
  if (input.noShowThresholdMin !== undefined)
    updateData.noShowThresholdMin = input.noShowThresholdMin;
  if (input.kickboxingClassSizeLimit !== undefined)
    updateData.kickboxingClassSizeLimit = input.kickboxingClassSizeLimit;

  if (Object.keys(updateData).length === 0) {
    return existing;
  }

  const updated = await prisma.branchSettings.update({
    where: { branchId },
    data: updateData,
  });

  await auditLog({
    action: 'SETTINGS_UPDATED',
    actorId,
    subjectType: 'BranchSettings',
    subjectId: existing.id,
    branchId,
    oldValue: {
      defaultSessionDurationMin: existing.defaultSessionDurationMin,
      carryForwardLimit: existing.carryForwardLimit,
      cancellationPolicyEnabled: existing.cancellationPolicyEnabled,
      cancellationWindowMin: existing.cancellationWindowMin,
      reminderTimingMin: existing.reminderTimingMin,
      noShowThresholdMin: existing.noShowThresholdMin,
      kickboxingClassSizeLimit: existing.kickboxingClassSizeLimit,
    },
    newValue: { ...input },
  });

  return updated;
}
