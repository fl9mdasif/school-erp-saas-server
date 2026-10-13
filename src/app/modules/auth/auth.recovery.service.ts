import { AppError } from '../../errors/AppError';
import { getEmailProvider } from '../../lib/emailProvider';
import { env } from '../../config/env';
import { hashPassword } from '../../lib/password';
import { runAsTenant } from '../../lib/tenantContext';
import { User } from '../user/user.model';
import { findTenantBySlug } from './auth.service';
import { PasswordReset } from './passwordReset.model';
import { revokeAllForUser } from './session.service';
import { hashToken, newOpaqueToken } from './token';

const RESET_TTL_MS = 60 * 60_000;

/** Admin-only email reset. Always succeeds from the caller's point of view so accounts cannot be enumerated. */
export const requestPasswordReset = async (input: { tenantSlug: string; email: string }) => {
  const tenant = await findTenantBySlug(input.tenantSlug);
  if (!tenant) return;
  await runAsTenant(tenant._id, async () => {
    const user = await User.findOne({ email: input.email, role: 'admin', status: 'active' });
    if (!user) return;
    const token = newOpaqueToken();
    await PasswordReset.create({
      userId: user._id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + RESET_TTL_MS),
    });
    const link = `https://${env.PLATFORM_DOMAIN}/schools/${tenant.slug}/reset-password?token=${token}`;
    await getEmailProvider().send(
      input.email,
      `${env.PLATFORM_NAME} password reset`,
      `Reset your password: ${link}\nThis link expires in 1 hour.`,
    );
  });
};

export const resetPassword = async (input: { tenantSlug: string; token: string; newPassword: string }) => {
  const tenant = await findTenantBySlug(input.tenantSlug);
  const invalid = () =>
    AppError.badRequest('This reset link is invalid or has expired', undefined, 'RESET_TOKEN_INVALID');
  if (!tenant) throw invalid();
  await runAsTenant(tenant._id, async () => {
    const row = await PasswordReset.findOneAndUpdate(
      { tokenHash: hashToken(input.token), usedAt: { $exists: false }, expiresAt: { $gt: new Date() } },
      { $set: { usedAt: new Date() } },
    );
    if (!row) throw invalid();
    await User.updateOne(
      { _id: row.userId },
      {
        $set: {
          passwordHash: await hashPassword(input.newPassword),
          mustChangePassword: false,
          failedLoginCount: 0,
        },
        $unset: { lockedUntil: 1 },
      },
    );
    await revokeAllForUser(row.userId);
  });
};
