import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';
import { AppError } from '@/lib/errors';
import { uploadProfileImage as cloudinaryUpload } from '@/lib/cloudinary';

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

export interface SetProfileImageInput {
  userId: string;
  branchId: string;
  actorId: string;
  buffer: Buffer;
  mimeType: string;
}

export async function setProfileImage({
  userId,
  branchId,
  actorId,
  buffer,
  mimeType,
}: SetProfileImageInput): Promise<{ profileImageUrl: string }> {
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new AppError('INVALID_FILE_TYPE', 'Only JPEG, PNG, or WebP images are allowed.', 400);
  }
  if (buffer.byteLength > MAX_FILE_BYTES) {
    throw new AppError('FILE_TOO_LARGE', 'Image must be 5 MB or smaller.', 400);
  }

  const user = await prisma.user.findFirst({
    where: { id: userId, branchId, deletedAt: null },
    select: { id: true, profileImageUrl: true },
  });
  if (!user) {
    throw new AppError('NOT_FOUND', 'User not found in this branch.', 404);
  }

  const { url } = await cloudinaryUpload({ buffer, branchId, userId });

  await prisma.user.update({
    where: { id: userId },
    data: { profileImageUrl: url },
  });

  await auditLog({
    action: 'USER_PROFILE_IMAGE_UPDATED',
    actorId,
    subjectType: 'User',
    subjectId: userId,
    branchId,
    oldValue: { profileImageUrl: user.profileImageUrl },
    newValue: { profileImageUrl: url },
  });

  return { profileImageUrl: url };
}

export interface RemoveProfileImageInput {
  userId: string;
  branchId: string;
  actorId: string;
}

export async function removeProfileImage({
  userId,
  branchId,
  actorId,
}: RemoveProfileImageInput): Promise<{ profileImageUrl: null }> {
  const user = await prisma.user.findFirst({
    where: { id: userId, branchId, deletedAt: null },
    select: { id: true, profileImageUrl: true },
  });
  if (!user) {
    throw new AppError('NOT_FOUND', 'User not found in this branch.', 404);
  }

  if (user.profileImageUrl === null) {
    return { profileImageUrl: null };
  }

  await prisma.user.update({
    where: { id: userId },
    data: { profileImageUrl: null },
  });

  await auditLog({
    action: 'USER_PROFILE_IMAGE_REMOVED',
    actorId,
    subjectType: 'User',
    subjectId: userId,
    branchId,
    oldValue: { profileImageUrl: user.profileImageUrl },
    newValue: { profileImageUrl: null },
  });

  return { profileImageUrl: null };
}

export async function getProfileImageUrl(
  userId: string,
  branchId: string,
): Promise<{ profileImageUrl: string | null }> {
  const user = await prisma.user.findFirst({
    where: { id: userId, branchId, deletedAt: null },
    select: { profileImageUrl: true },
  });
  if (!user) {
    throw new AppError('NOT_FOUND', 'User not found in this branch.', 404);
  }
  return { profileImageUrl: user.profileImageUrl };
}
