import { randomBytes } from 'crypto';
import { hash } from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';
import { AppError } from '@/lib/errors';

const BCRYPT_COST = 10;
const SECRET_BYTES = 32; // 256-bit random secret per device

export interface RegisterTvDeviceInput {
  name: string;
  branchId: string;
  actorId: string;
}

export interface RegisterTvDeviceResult {
  device: {
    id: string;
    branchId: string;
    name: string;
    lastSeenAt: Date | null;
    revokedAt: Date | null;
    createdAt: Date;
  };
  /** Plaintext bearer token — returned exactly once, on creation. */
  token: string;
}

/**
 * Register a new TV display device for a branch. Generates a 256-bit secret
 * and stores its bcrypt hash. Returns the plaintext `${deviceId}.${secret}`
 * token exactly once — the caller must surface this to the operator and it
 * cannot be retrieved later.
 */
export async function registerTvDevice(
  input: RegisterTvDeviceInput,
): Promise<RegisterTvDeviceResult> {
  const secret = randomBytes(SECRET_BYTES).toString('base64url');
  const tokenHash = await hash(secret, BCRYPT_COST);

  const device = await prisma.tvDevice.create({
    data: {
      branchId: input.branchId,
      name: input.name,
      tokenHash,
      createdByUserId: input.actorId,
    },
    select: {
      id: true,
      branchId: true,
      name: true,
      lastSeenAt: true,
      revokedAt: true,
      createdAt: true,
    },
  });

  await auditLog({
    action: 'TV_DEVICE_REGISTERED',
    actorId: input.actorId,
    subjectType: 'TvDevice',
    subjectId: device.id,
    branchId: input.branchId,
    newValue: { name: device.name },
  });

  return {
    device,
    token: `${device.id}.${secret}`,
  };
}

/**
 * List all TV devices registered to a branch (including revoked). Never
 * returns `tokenHash` — only metadata for the admin device-management screen.
 */
export async function listTvDevices(branchId: string) {
  return prisma.tvDevice.findMany({
    where: { branchId },
    select: {
      id: true,
      branchId: true,
      name: true,
      lastSeenAt: true,
      revokedAt: true,
      createdByUserId: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Soft-revoke a TV device by stamping `revokedAt`. The token immediately stops
 * authenticating (see `verifyDeviceToken`). Idempotent — revoking an
 * already-revoked device is a no-op.
 */
export async function revokeTvDevice({
  id,
  branchId,
  actorId,
}: {
  id: string;
  branchId: string;
  actorId: string;
}) {
  const device = await prisma.tvDevice.findFirst({ where: { id, branchId } });
  if (!device) {
    throw new AppError('NOT_FOUND', 'TV device not found', 404);
  }
  if (device.revokedAt) {
    return { success: true };
  }

  await prisma.tvDevice.update({
    where: { id },
    data: { revokedAt: new Date() },
  });

  await auditLog({
    action: 'TV_DEVICE_REVOKED',
    actorId,
    subjectType: 'TvDevice',
    subjectId: id,
    branchId,
    oldValue: { revokedAt: null },
    newValue: { revokedAt: new Date().toISOString() },
  });

  return { success: true };
}
