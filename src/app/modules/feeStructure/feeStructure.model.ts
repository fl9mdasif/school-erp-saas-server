import mongoose, { Schema } from 'mongoose';
import { createTenantSchema } from '../../plugins/createTenantSchema';

const item = new Schema(
  {
    feeHeadId: { type: Schema.Types.ObjectId, ref: 'FeeHead', required: true },
    amount: { type: Number, required: true, min: 0, validate: Number.isInteger },
    cycle: { type: String, enum: ['monthly', 'term', 'yearly', 'one_time'], required: true },
    dueDay: { type: Number, min: 1, max: 28 },
  },
  { _id: false },
);

const schema = createTenantSchema({
  sessionId: { type: Schema.Types.ObjectId, ref: 'AcademicSession', required: true },
  classId: { type: Schema.Types.ObjectId, ref: 'Class', required: true },
  group: { type: String, default: null },
  items: { type: [item], default: [] },
});
schema.index({ tenantId: 1, sessionId: 1, classId: 1, group: 1 }, { unique: true });

export const FeeStructure = mongoose.model('FeeStructure', schema) as unknown as mongoose.Model<any>;
