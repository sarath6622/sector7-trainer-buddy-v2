import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('@/lib/audit', () => ({
  auditLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/cloudinary', () => ({
  uploadProfileImage: vi.fn(),
}));

import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';
import { uploadProfileImage as cloudinaryUpload } from '@/lib/cloudinary';
import {
  setProfileImage,
  removeProfileImage,
  getProfileImageUrl,
} from '@/services/profile-image.service';

const mockFindFirst = prisma.user.findFirst as ReturnType<typeof vi.fn>;
const mockUpdate = prisma.user.update as ReturnType<typeof vi.fn>;
const mockAudit = auditLog as ReturnType<typeof vi.fn>;
const mockCloudinary = cloudinaryUpload as ReturnType<typeof vi.fn>;

const BRANCH = 'branch-1';
const USER = 'user-client-1';
const ACTOR = 'user-admin';

describe('profile-image.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('setProfileImage', () => {
    it('uploads to cloudinary, persists the URL on User, and audits with old + new', async () => {
      mockFindFirst.mockResolvedValue({ id: USER, profileImageUrl: 'https://old.example/old.jpg' });
      mockCloudinary.mockResolvedValue({
        url: 'https://res.cloudinary.com/x/upload/c_fill,g_face/abc.jpg',
        publicId: 'sector7/profile-images/branch-1/user-client-1',
      });
      mockUpdate.mockResolvedValue({});

      const result = await setProfileImage({
        userId: USER,
        branchId: BRANCH,
        actorId: ACTOR,
        buffer: Buffer.from('fake-jpeg-bytes'),
        mimeType: 'image/jpeg',
      });

      expect(result.profileImageUrl).toBe(
        'https://res.cloudinary.com/x/upload/c_fill,g_face/abc.jpg',
      );
      expect(mockCloudinary).toHaveBeenCalledWith(
        expect.objectContaining({ branchId: BRANCH, userId: USER }),
      );
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: USER },
        data: { profileImageUrl: 'https://res.cloudinary.com/x/upload/c_fill,g_face/abc.jpg' },
      });
      expect(mockAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'USER_PROFILE_IMAGE_UPDATED',
          subjectType: 'User',
          subjectId: USER,
          branchId: BRANCH,
          actorId: ACTOR,
          oldValue: { profileImageUrl: 'https://old.example/old.jpg' },
          newValue: {
            profileImageUrl: 'https://res.cloudinary.com/x/upload/c_fill,g_face/abc.jpg',
          },
        }),
      );
    });

    it('rejects unsupported mime types before touching cloudinary', async () => {
      await expect(
        setProfileImage({
          userId: USER,
          branchId: BRANCH,
          actorId: ACTOR,
          buffer: Buffer.from('x'),
          mimeType: 'application/pdf',
        }),
      ).rejects.toMatchObject({ code: 'INVALID_FILE_TYPE', statusCode: 400 });
      expect(mockCloudinary).not.toHaveBeenCalled();
      expect(mockFindFirst).not.toHaveBeenCalled();
    });

    it('rejects files larger than 5 MB before touching cloudinary', async () => {
      const tooBig = Buffer.alloc(5 * 1024 * 1024 + 1);
      await expect(
        setProfileImage({
          userId: USER,
          branchId: BRANCH,
          actorId: ACTOR,
          buffer: tooBig,
          mimeType: 'image/jpeg',
        }),
      ).rejects.toMatchObject({ code: 'FILE_TOO_LARGE', statusCode: 400 });
      expect(mockCloudinary).not.toHaveBeenCalled();
    });

    it('throws NOT_FOUND when the user is not in the caller branch', async () => {
      mockFindFirst.mockResolvedValue(null);
      await expect(
        setProfileImage({
          userId: USER,
          branchId: BRANCH,
          actorId: ACTOR,
          buffer: Buffer.from('jpeg'),
          mimeType: 'image/jpeg',
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 });
      expect(mockCloudinary).not.toHaveBeenCalled();
      expect(mockUpdate).not.toHaveBeenCalled();
    });
  });

  describe('removeProfileImage', () => {
    it('nulls the URL and audits the removal when one was set', async () => {
      mockFindFirst.mockResolvedValue({ id: USER, profileImageUrl: 'https://x/y.jpg' });
      mockUpdate.mockResolvedValue({});

      const result = await removeProfileImage({
        userId: USER,
        branchId: BRANCH,
        actorId: ACTOR,
      });

      expect(result).toEqual({ profileImageUrl: null });
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: USER },
        data: { profileImageUrl: null },
      });
      expect(mockAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'USER_PROFILE_IMAGE_REMOVED',
          oldValue: { profileImageUrl: 'https://x/y.jpg' },
          newValue: { profileImageUrl: null },
        }),
      );
    });

    it('is a no-op when there was no photo to begin with', async () => {
      mockFindFirst.mockResolvedValue({ id: USER, profileImageUrl: null });

      const result = await removeProfileImage({
        userId: USER,
        branchId: BRANCH,
        actorId: ACTOR,
      });

      expect(result).toEqual({ profileImageUrl: null });
      expect(mockUpdate).not.toHaveBeenCalled();
      expect(mockAudit).not.toHaveBeenCalled();
    });

    it('refuses to remove a photo from a user outside the caller branch', async () => {
      mockFindFirst.mockResolvedValue(null);
      await expect(
        removeProfileImage({ userId: USER, branchId: BRANCH, actorId: ACTOR }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 });
      expect(mockUpdate).not.toHaveBeenCalled();
    });
  });

  describe('getProfileImageUrl', () => {
    it('returns the current profileImageUrl for an in-branch user', async () => {
      mockFindFirst.mockResolvedValue({ profileImageUrl: 'https://x/y.jpg' });
      const result = await getProfileImageUrl(USER, BRANCH);
      expect(result).toEqual({ profileImageUrl: 'https://x/y.jpg' });
    });

    it('throws NOT_FOUND when the user is not in the caller branch', async () => {
      mockFindFirst.mockResolvedValue(null);
      await expect(getProfileImageUrl(USER, BRANCH)).rejects.toMatchObject({
        code: 'NOT_FOUND',
        statusCode: 404,
      });
    });
  });
});
