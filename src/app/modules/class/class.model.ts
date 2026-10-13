import mongoose from 'mongoose';
import { createTenantSchema } from '../../plugins/createTenantSchema';

const schema = createTenantSchema(
  {
    name: { type: String, required: true, trim: true },
    nameBn: String,
    order: { type: Number, required: true, default: 1 },
    group: { type: String, enum: ['science', 'commerce', 'arts', null], default: null },
    isActive: { type: Boolean, default: true },
  },
  { softDelete: true },
);
schema.index(
  { tenantId: 1, name: 1, group: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } },
);
schema.index({ tenantId: 1, order: 1 });

export const ClassModel = mongoose.model('Class', schema) as unknown as mongoose.Model<any>;
