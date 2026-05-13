import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary';
import { AppError } from '@/lib/errors';

let configured = false;

function configureCloudinary() {
  if (configured) return;
  const cloud_name = process.env.CLOUDINARY_CLOUD_NAME;
  const api_key = process.env.CLOUDINARY_API_KEY;
  const api_secret = process.env.CLOUDINARY_API_SECRET;

  if (!cloud_name || !api_key || !api_secret) {
    throw new AppError(
      'CLOUDINARY_NOT_CONFIGURED',
      'Cloudinary credentials are not set. Add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET to .env.local.',
      500,
    );
  }

  cloudinary.config({ cloud_name, api_key, api_secret, secure: true });
  configured = true;
}

export interface UploadProfileImageParams {
  buffer: Buffer;
  branchId: string;
  userId: string;
}

export interface UploadProfileImageResult {
  url: string;
  publicId: string;
}

/**
 * Upload a profile image. The returned URL has face-aware crop + auto format
 * baked in via Cloudinary URL transformations, so consumers (TV, lists,
 * avatars) can render it directly without per-call transforms.
 */
export async function uploadProfileImage({
  buffer,
  branchId,
  userId,
}: UploadProfileImageParams): Promise<UploadProfileImageResult> {
  configureCloudinary();

  const folder = `sector7/profile-images/${branchId}`;
  const publicId = `${userId}`;

  const result = await new Promise<UploadApiResponse>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: publicId,
        overwrite: true,
        resource_type: 'image',
        // Eager transform: 400x400 face-aware crop, auto format/quality.
        // We still return the transformed delivery URL below via `cloudinary.url`.
      },
      (err, res) => {
        if (err || !res) reject(err ?? new Error('Cloudinary upload returned no result'));
        else resolve(res);
      },
    );
    stream.end(buffer);
  });

  const transformedUrl = cloudinary.url(result.public_id, {
    secure: true,
    version: result.version,
    transformation: [
      { width: 400, height: 400, crop: 'fill', gravity: 'face' },
      { fetch_format: 'auto', quality: 'auto' },
    ],
  });

  return { url: transformedUrl, publicId: result.public_id };
}
