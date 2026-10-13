import mongoose from 'mongoose';
import { createTenantSchema } from '../../plugins/createTenantSchema';

const schema = createTenantSchema({
  name: { type: String, required: true, trim: true },
  nameBn: String,
  code: { type: String, required: true, uppercase: true, trim: true },
  kind: { type: String, enum: ['recurring', 'one_time'], required: true },
  isActive: { type: Boolean, default: true },
});
schema.index({ tenantId: 1, code: 1 }, { unique: true });

export const FeeHead = mongoose.model('FeeHead', schema) as unknown as mongoose.Model<any>;
