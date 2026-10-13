import mongoose from 'mongoose';
import { createTenantSchema } from '../../plugins/createTenantSchema';

export const componentSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    fullMarks: { type: Number, required: true, min: 0 },
    passMarks: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const schema = createTenantSchema(
  {
    name: { type: String, required: true, trim: true },
    nameBn: String,
    code: String,
    components: { type: [componentSchema], default: [] },
  },
  { softDelete: true },
);
schema.index({ tenantId: 1, name: 1 }, { unique: true, partialFilterExpression: { isDeleted: false } });

export const Subject = mongoose.model('Subject', schema) as unknown as mongoose.Model<any>;
