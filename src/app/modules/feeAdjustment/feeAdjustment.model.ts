import mongoose, { Schema } from 'mongoose';
import { createTenantSchema } from '../../plugins/createTenantSchema';

const schema = createTenantSchema({
  studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
  sessionId: { type: Schema.Types.ObjectId, ref: 'AcademicSession', required: true },
  feeHeadId: { type: Schema.Types.ObjectId, ref: 'FeeHead' },
  type: { type: String, enum: ['percent', 'fixed'], required: true },
  value: { type: Number, required: true, min: 0 },
  reason: { type: String, required: true, maxlength: 300 },
  approvedBy: { type: Schema.Types.ObjectId, required: true },
  validFrom: String,
  validTo: String,
});
schema.index({ tenantId: 1, studentId: 1, sessionId: 1 });

export const FeeAdjustment = mongoose.model('FeeAdjustment', schema) as unknown as mongoose.Model<any>;
