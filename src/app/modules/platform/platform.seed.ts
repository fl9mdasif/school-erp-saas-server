import { hashPassword } from '../../lib/password';
import { PlatformAdmin } from './platformAdmin.model';

/** Creates the platform owner if none exists with that email. Never overwrites an existing password. */
export const ensureSuperAdmin = async (email: string, password: string, name = 'Platform Owner') => {
  const existing = await PlatformAdmin.findOne({ email: email.toLowerCase() });
  if (existing) return { created: false, id: existing._id };
  const doc = await PlatformAdmin.create({ name, email, passwordHash: await hashPassword(password) });
  return { created: true, id: doc._id };
};
