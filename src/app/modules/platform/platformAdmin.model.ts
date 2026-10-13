import mongoose from 'mongoose';
import { createPlatformSchema } from '../../plugins/createTenantSchema';
import type { IPlatformAdmin } from './platformAdmin.interface';

const schema = createPlatformSchema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  lastLoginAt: Date,
  failedLoginCount: { type: Number, default: 0 },
  lockedUntil: Date,
});

export const PlatformAdmin = mongoose.model<IPlatformAdmin>('PlatformAdmin', schema);
