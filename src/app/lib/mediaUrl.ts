import { z } from 'zod';
import { env } from '../config/env';

/**
 * Image and file links stored in the database. With Cloudinary configured, only URLs on this school platform's own
 * Cloudinary account are accepted, so a client cannot save a link to an arbitrary or malicious host.
 */
export const isAllowedMediaUrl = (value: string): boolean => {
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:') return false;
  if (env.UPLOAD_PROVIDER !== 'cloudinary' || !env.CLOUDINARY_CLOUD_NAME) return true;
  return u.hostname === 'res.cloudinary.com' && u.pathname.startsWith(`/${env.CLOUDINARY_CLOUD_NAME}/`);
};

export const mediaUrl = z
  .string()
  .max(500)
  .refine(isAllowedMediaUrl, 'Upload the file through the app and use the returned link');
