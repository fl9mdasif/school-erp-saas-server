import { createHash, randomBytes } from 'node:crypto';
import { env } from '../config/env';
import { AppError } from '../errors/AppError';

export type UploadKind = 'image' | 'pdf';

export const LIMITS: Record<UploadKind, { maxBytes: number; mime: string[] }> = {
  image: { maxBytes: 2 * 1024 * 1024, mime: ['image/jpeg', 'image/png', 'image/webp'] },
  pdf: { maxBytes: 5 * 1024 * 1024, mime: ['application/pdf'] },
};

export interface SignedUpload {
  provider: string;
  uploadUrl: string;
  fields: Record<string, string>;
  cloudName?: string;
  publicUrlBase?: string;
  maxBytes: number;
  allowedMime: string[];
  expiresAt: string;
}

export interface UploadProvider {
  sign(input: { tenantId: string; kind: UploadKind; folder: string }): SignedUpload;
}

/** Development provider: returns a placeholder target so the client flow can be built without an account. */
class MockUploadProvider implements UploadProvider {
  sign({ tenantId, kind, folder }: { tenantId: string; kind: UploadKind; folder: string }): SignedUpload {
    const key = `${tenantId}/${folder}/${randomBytes(8).toString('hex')}`;
    return {
      provider: 'mock',
      uploadUrl: `https://uploads.invalid/${key}`,
      fields: { key },
      maxBytes: LIMITS[kind].maxBytes,
      allowedMime: LIMITS[kind].mime,
      expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    };
  }
}

/** Cloudinary signed upload parameters. The file goes browser to Cloudinary, never through this server. */
export class CloudinaryUploadProvider implements UploadProvider {
  sign({ tenantId, kind, folder }: { tenantId: string; kind: UploadKind; folder: string }): SignedUpload {
    const { CLOUDINARY_CLOUD_NAME: cloud, CLOUDINARY_API_KEY: apiKey, CLOUDINARY_API_SECRET: secret } = env;
    if (!cloud || !apiKey || !secret)
      throw new AppError(503, 'UPLOAD_NOT_CONFIGURED', 'File uploads are not configured');
    const timestamp = Math.floor(Date.now() / 1000);
    // Every parameter the browser sends (except file and api_key) must be part of the signature.
    // The folder is tenant scoped, and the format list stops a client from uploading anything but images.
    const params: Record<string, string | number> = { folder: `${tenantId}/${folder}`, timestamp };
    if (kind === 'image') params.allowed_formats = 'jpg,jpeg,png,webp';
    const toSign = Object.entries(params)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
    const signature = createHash('sha1')
      .update(toSign + secret)
      .digest('hex');
    const fields: Record<string, string> = { api_key: apiKey, signature };
    for (const [k, v] of Object.entries(params)) fields[k] = String(v);
    return {
      provider: 'cloudinary',
      uploadUrl: `https://api.cloudinary.com/v1_1/${cloud}/${kind === 'pdf' ? 'raw' : 'image'}/upload`,
      fields,
      cloudName: cloud,
      publicUrlBase: `https://res.cloudinary.com/${cloud}/`,
      maxBytes: LIMITS[kind].maxBytes,
      allowedMime: LIMITS[kind].mime,
      expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    };
  }
}

let provider: UploadProvider =
  env.UPLOAD_PROVIDER === 'cloudinary' ? new CloudinaryUploadProvider() : new MockUploadProvider();
export const getUploadProvider = () => provider;
export const setUploadProvider = (p: UploadProvider) => {
  provider = p;
};
