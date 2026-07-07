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

// ── Signed direct upload (mobile) ─────────────────────────────────────────────

export type UploadKind = 'profile' | 'progress';

export interface SignUploadInput {
  branchId: string;
  userId: string;
  kind: UploadKind;
}

/**
 * Params a native client echoes to Cloudinary's upload endpoint. The API secret
 * is **never** included — it only seeds the signature, computed server-side.
 */
export interface SignedUploadResult {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  folder: string;
  /** Pinned for `profile` (overwrites the user's avatar); omitted for `progress`. */
  publicId?: string;
  signature: string;
  uploadUrl: string;
}

/**
 * Produce signed params so a mobile app can upload an image **directly** to
 * Cloudinary without ever holding the API secret (Phase 0 of the Flutter
 * migration — see docs/flutter-migration-plan.md §3.3).
 *
 * The folder is server-decided and branch-scoped so a client can't write
 * outside their own space. Only the fields the app will send to Cloudinary
 * (`folder`, `timestamp`, and `public_id` for avatars) are signed — they must
 * be echoed back exactly or Cloudinary rejects the upload with "Invalid
 * Signature". The caller persists the returned `secure_url` afterwards (avatar
 * via the existing profile-image route; progress photos via the progress POST).
 */
export function signUpload({ branchId, userId, kind }: SignUploadInput): SignedUploadResult {
  configureCloudinary();
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME as string;
  const apiKey = process.env.CLOUDINARY_API_KEY as string;
  const apiSecret = process.env.CLOUDINARY_API_SECRET as string;

  const timestamp = Math.floor(Date.now() / 1000);
  const subfolder = kind === 'profile' ? 'profile-images' : 'progress-photos';
  const folder = `sector7/${subfolder}/${branchId}`;

  const paramsToSign: Record<string, string | number> = { folder, timestamp };
  let publicId: string | undefined;
  if (kind === 'profile') {
    // Pin the avatar to the user so re-uploads overwrite the same asset.
    publicId = userId;
    paramsToSign.public_id = userId;
  }

  const signature = cloudinary.utils.api_sign_request(paramsToSign, apiSecret);

  return {
    cloudName,
    apiKey,
    timestamp,
    folder,
    publicId,
    signature,
    uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
  };
}
