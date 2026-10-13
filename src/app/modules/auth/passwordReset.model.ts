import mongoose, { Schema } from 'mongoose';
import { createTenantSchema } from '../../plugins/createTenantSchema';

const schema = createTenantSchema(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    usedAt: Date,
  },
  { auditable: false },
);
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

interface IPasswordReset {
  tenantId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
  usedAt?: Date;
}

export const PasswordReset = mongoose.model<IPasswordReset>('PasswordReset', schema);
