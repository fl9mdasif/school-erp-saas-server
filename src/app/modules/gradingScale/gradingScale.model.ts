import mongoose from 'mongoose';
import { createTenantSchema } from '../../plugins/createTenantSchema';

const band = new mongoose.Schema(
  {
    minPercent: { type: Number, required: true },
    maxPercent: { type: Number, required: true },
    letter: { type: String, required: true },
    point: Number,
    remark: String,
  },
  { _id: false },
);

const schema = createTenantSchema({
  name: { type: String, required: true, trim: true },
  kind: { type: String, enum: ['gpa', 'division', 'percentage'], required: true },
  bands: { type: [band], required: true },
  passPercent: { type: Number, default: 33, min: 0, max: 100 },
  rules: {
    failIfAnyCompulsoryFails: { type: Boolean, default: true },
    fourthSubjectBonus: { type: Boolean, default: true },
    graceMarksPerSubject: { type: Number, default: 0, min: 0 },
    meritTieBreak: { type: String, enum: ['total_then_roll', 'total_then_name'], default: 'total_then_roll' },
  },
  isDefault: { type: Boolean, default: false },
});
schema.index({ tenantId: 1, isDefault: 1 });

export const GradingScale = mongoose.model('GradingScale', schema) as unknown as mongoose.Model<any>;
