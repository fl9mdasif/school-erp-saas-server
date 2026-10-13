import mongoose, { Schema } from 'mongoose';
import { createTenantSchema } from '../../plugins/createTenantSchema';

const schema = createTenantSchema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true },
    relation: { type: String, enum: ['father', 'mother', 'other'], default: 'other' },
    occupation: String,
    address: String,
    studentIds: [{ type: Schema.Types.ObjectId, ref: 'Student' }],
  },
  { softDelete: true },
);
schema.index({ tenantId: 1, phone: 1 }, { unique: true });

export const Guardian = mongoose.model('Guardian', schema);
