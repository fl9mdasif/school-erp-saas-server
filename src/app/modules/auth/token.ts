import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import { env } from '../../config/env';
import { parseDuration } from '../../lib/duration';
import type { Role } from '../../lib/tenantContext';

export interface AccessPayload {
  sub: string;
  tid?: string;
  role: Role;
  typ: 'user' | 'platform';
}

export const signAccessToken = (p: {
  userId: Types.ObjectId;
  tenantId?: Types.ObjectId;
  role: Role;
}): string =>
  jwt.sign(
    {
      sub: p.userId.toString(),
      tid: p.tenantId?.toString(),
      role: p.role,
      typ: p.role === 'superAdmin' ? 'platform' : 'user',
    },
    env.JWT_ACCESS_SECRET,
    { expiresIn: env.JWT_ACCESS_EXPIRES_IN as any },
  );

export const verifyAccessToken = (token: string): AccessPayload =>
  jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessPayload;

export const accessTtlMs = () => parseDuration(env.JWT_ACCESS_EXPIRES_IN);

/** Staff refresh lifetime comes from env; students and guardians stay signed in longer. */
export const refreshTtlMs = (role: Role): number =>
  role === 'student' || role === 'guardian' ? 30 * 86_400_000 : parseDuration(env.JWT_REFRESH_EXPIRES_IN);

export const newOpaqueToken = (): string => randomBytes(48).toString('base64url');
export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');
export const newFamilyId = (): string => randomBytes(16).toString('hex');

export const REFRESH_COOKIE = 'refreshToken';
