import mongoose, { Schema } from 'mongoose';
import { createPlatformSchema } from '../../plugins/createTenantSchema';

export interface IRefreshToken {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  userType: 'user' | 'platformAdmin';
  tenantId?: mongoose.Types.ObjectId;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt?: Date;
  replacedBy?: mongoose.Types.ObjectId;
  userAgent?: string;
  createdAt: Date;
}

const schema = createPlatformSchema(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    userType: { type: String, enum: ['user', 'platformAdmin'], required: true },
    tenantId: { type: Schema.Types.ObjectId },
    familyId: { type: String, required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    revokedAt: Date,
    replacedBy: Schema.Types.ObjectId,
    userAgent: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshToken = mongoose.model<IRefreshToken>('RefreshToken', schema);
