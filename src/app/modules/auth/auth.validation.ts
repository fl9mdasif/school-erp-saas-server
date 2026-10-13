import { z } from 'zod';
import { normalizeBdPhone } from '../../lib/phone';

const password = z.string().min(8, 'Password must be at least 8 characters').max(128);
const phone = z.string().transform((v, ctx) => {
  const n = normalizeBdPhone(v);
  if (!n) ctx.addIssue({ code: 'custom', message: 'Enter a valid Bangladesh mobile number' });
  return n ?? v;
});

export const slugAvailableQuery = z.strictObject({ slug: z.string().min(1).max(60) });

export const registerInstitutionBody = z.strictObject({
  institutionName: z.string().trim().min(2).max(120),
  institutionNameBn: z.string().trim().max(120).optional(),
  institutionType: z.enum(['school', 'madrasa', 'coaching']),
  slug: z.string().min(1).max(60),
  phone,
  district: z.string().trim().max(60).optional(),
  adminName: z.string().trim().min(2).max(100),
  adminEmail: z.string().trim().toLowerCase().email(),
  password,
});

export const loginBody = z.strictObject({
  tenantSlug: z.string().trim().min(1).max(60),
  identifier: z.string().trim().min(1).max(120),
  password: z.string().min(1).max(128),
});

export const platformLoginBody = z.strictObject({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(128),
});

export const changePasswordBody = z.strictObject({
  oldPassword: z.string().min(1).max(128),
  newPassword: password,
});
export const forgotPasswordBody = z.strictObject({
  tenantSlug: z.string().trim().min(1),
  email: z.string().trim().toLowerCase().email(),
});
export const resetPasswordBody = z.strictObject({
  tenantSlug: z.string().trim().min(1),
  token: z.string().min(20).max(200),
  newPassword: password,
});
