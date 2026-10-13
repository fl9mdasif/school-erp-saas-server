import { z } from 'zod';
import { objectIdSchema } from '../../lib/objectId';
import { normalizeBdPhone } from '../../lib/phone';
import { paginationQuery } from '../../lib/pagination';

const staffRole = z.enum(['admin', 'teacher', 'accountant']);
const phone = z.string().transform((v, ctx) => {
  const n = normalizeBdPhone(v);
  if (!n) ctx.addIssue({ code: 'custom', message: 'Enter a valid Bangladesh mobile number' });
  return n ?? v;
});

export const listUsersQuery = z.strictObject({
  ...paginationQuery,
  role: staffRole.optional(),
  status: z.enum(['active', 'inactive']).optional(),
  q: z.string().trim().max(60).optional(),
});

export const createUserBody = z
  .strictObject({
    role: staffRole,
    name: z.string().trim().min(2).max(100),
    email: z.string().trim().toLowerCase().email().optional(),
    phone: phone.optional(),
    password: z.string().min(8).max(128).optional(),
  })
  .refine((v) => v.email || v.phone, { message: 'Provide an email or a phone number', path: ['email'] });

export const updateUserBody = z.strictObject({
  role: staffRole.optional(),
  name: z.string().trim().min(2).max(100).optional(),
  email: z.string().trim().toLowerCase().email().optional(),
  phone: phone.optional(),
});

export const statusBody = z.strictObject({ status: z.enum(['active', 'inactive']) });
export const userIdParams = z.strictObject({ id: objectIdSchema });
