import mongoose from 'mongoose';
import { createPlatformSchema } from '../../plugins/createTenantSchema';
import type { IPlan } from './plan.interface';

const schema = createPlatformSchema({
  code: { type: String, required: true, unique: true, lowercase: true, trim: true },
  name: { type: String, required: true, trim: true },
  priceMonthly: { type: Number, required: true, min: 0 },
  studentCap: { type: Number, required: true, min: 1 },
  features: {
    customDomain: { type: Boolean, default: false },
    csvImport: { type: Boolean, default: true },
    marksheetPdf: { type: Boolean, default: true },
  },
  isActive: { type: Boolean, default: true },
});

export const Plan = mongoose.model<IPlan>('Plan', schema);
