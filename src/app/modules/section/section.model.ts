import mongoose, { Schema } from 'mongoose';
import { createTenantSchema } from '../../plugins/createTenantSchema';

const schema = createTenantSchema(
  {
    classId: { type: Schema.Types.ObjectId, ref: 'Class', required: true },
    name: { type: String, required: true, trim: true },
    capacity: Number,
    classTeacherId: { type: Schema.Types.ObjectId, ref: 'User' },
    isDefault: { type: Boolean, default: false },
  },
  { softDelete: true },
);
schema.index(
  { tenantId: 1, classId: 1, name: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } },
);

export const Section = mongoose.model('Section', schema);
