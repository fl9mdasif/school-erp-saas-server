import { Types } from 'mongoose';
import type { Role } from '../../lib/tenantContext';
import { AppError } from '../../errors/AppError';
import { hashToken, newFamilyId, newOpaqueToken, refreshTtlMs, signAccessToken } from './token';
import { RefreshToken } from './refreshToken.model';

export interface SessionSubject {
  userId: Types.ObjectId;
  tenantId?: Types.ObjectId;
  role: Role;
}

export interface IssuedSession {
  accessToken: string;
  refreshToken: string;
  refreshMaxAgeMs: number;
}

const issue = async (
  s: SessionSubject,
  familyId: string,
  userAgent?: string,
): Promise<IssuedSession & { rowId: Types.ObjectId }> => {
  const refreshToken = newOpaqueToken();
  const ttl = refreshTtlMs(s.role);
  const row = await RefreshToken.create({
    userId: s.userId,
    userType: s.role === 'superAdmin' ? 'platformAdmin' : 'user',
    tenantId: s.tenantId,
    familyId,
    tokenHash: hashToken(refreshToken),
    expiresAt: new Date(Date.now() + ttl),
    userAgent: userAgent?.slice(0, 200),
  });
  return { accessToken: signAccessToken(s), refreshToken, refreshMaxAgeMs: ttl, rowId: row._id };
};

export const startSession = async (s: SessionSubject, userAgent?: string): Promise<IssuedSession> => {
  const { rowId: _rowId, ...session } = await issue(s, newFamilyId(), userAgent);
  return session;
};

export const revokeFamily = async (familyId: string) => {
  await RefreshToken.updateMany(
    { familyId, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date() } },
  );
};

export const revokeAllForUser = async (userId: Types.ObjectId) => {
  await RefreshToken.updateMany(
    { userId, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date() } },
  );
};

export const revokeByToken = async (token: string) => {
  const row = await RefreshToken.findOne({ tokenHash: hashToken(token) });
  if (row) await revokeFamily(row.familyId);
};

/**
 * Rotates a refresh token. Presenting an already-used token revokes the whole family
 * (theft detection) and the caller must sign in again.
 */
export const rotateSession = async (
  token: string,
  userAgent?: string,
): Promise<{
  subject: Pick<SessionSubject, 'userId' | 'tenantId'> & { userType: 'user' | 'platformAdmin' };
  familyId: string;
  build: (role: Role) => Promise<IssuedSession>;
}> => {
  const row = await RefreshToken.findOne({ tokenHash: hashToken(token) });
  if (!row) throw AppError.unauthorized('Session expired, please sign in again', 'SESSION_INVALID');
  if (row.revokedAt) {
    await revokeFamily(row.familyId);
    throw AppError.unauthorized('Session expired, please sign in again', 'SESSION_INVALID');
  }
  if (row.expiresAt.getTime() < Date.now())
    throw AppError.unauthorized('Session expired, please sign in again', 'SESSION_INVALID');

  // Claim the row atomically so two parallel refreshes cannot both succeed.
  const claimed = await RefreshToken.findOneAndUpdate(
    { _id: row._id, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date() } },
  );
  if (!claimed) {
    await revokeFamily(row.familyId);
    throw AppError.unauthorized('Session expired, please sign in again', 'SESSION_INVALID');
  }
  return {
    subject: { userId: row.userId, tenantId: row.tenantId, userType: row.userType },
    familyId: row.familyId,
    build: async (role) => {
      const next = await issue({ userId: row.userId, tenantId: row.tenantId, role }, row.familyId, userAgent);
      await RefreshToken.updateOne({ _id: row._id }, { $set: { replacedBy: next.rowId } });
      const { rowId: _r, ...session } = next;
      return session;
    },
  };
};
