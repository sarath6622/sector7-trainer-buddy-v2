import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { v2 as cloudinary } from 'cloudinary';
import { signUpload } from '@/lib/cloudinary';

// Deterministic creds for signature assertions (never the real secret).
beforeEach(() => {
  vi.stubEnv('CLOUDINARY_CLOUD_NAME', 'testcloud');
  vi.stubEnv('CLOUDINARY_API_KEY', '999888777');
  vi.stubEnv('CLOUDINARY_API_SECRET', 'unit-test-secret');
});
afterEach(() => vi.unstubAllEnvs());

describe('signUpload', () => {
  it('profile: branch-scoped folder, public_id pinned to the user, no secret leaked', () => {
    const r = signUpload({ branchId: 'branch-1', userId: 'user-9', kind: 'profile' });

    expect(r.cloudName).toBe('testcloud');
    expect(r.apiKey).toBe('999888777');
    expect(r.folder).toBe('sector7/profile-images/branch-1');
    expect(r.publicId).toBe('user-9');
    expect(r.uploadUrl).toBe('https://api.cloudinary.com/v1_1/testcloud/image/upload');
    expect(r.timestamp).toBeGreaterThan(1_700_000_000);
    expect(r.signature).toMatch(/^[a-f0-9]{40}$/); // sha1 hex
    // The secret must never appear in the response.
    expect(JSON.stringify(r)).not.toContain('unit-test-secret');
  });

  it('progress: progress-photos folder, no pinned public_id', () => {
    const r = signUpload({ branchId: 'branch-1', userId: 'user-9', kind: 'progress' });
    expect(r.folder).toBe('sector7/progress-photos/branch-1');
    expect(r.publicId).toBeUndefined();
  });

  it('signature matches a recomputation over exactly the echoed params', () => {
    const r = signUpload({ branchId: 'branch-2', userId: 'user-7', kind: 'profile' });
    // Cloudinary will re-sign { folder, public_id, timestamp } + secret; the app
    // must send exactly those, so the recomputed signature must match.
    const expected = cloudinary.utils.api_sign_request(
      { folder: r.folder, public_id: r.publicId, timestamp: r.timestamp },
      'unit-test-secret',
    );
    expect(r.signature).toBe(expected);
  });
});
