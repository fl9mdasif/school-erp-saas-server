import mongoose from 'mongoose';
import { createPlatformSchema } from '../../plugins/createTenantSchema';
import type { IPlan } from './plan.interface';

const schema = createPlatformSchema({
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  name: { type: String, required: true, trim: true },
  monthlyPrice: { type: Number, required: true, min: 0 },
  yearlyPrice: { type: Number, required: true, min: 0 },
  yearlyDiscount: { type: Number, default: 0 },
  trialDays: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  isPopular: { type: Boolean, default: false },
  features: [{ type: String }],
  notIncluded: [{ type: String }],
});

export const Plan = mongoose.model<IPlan>('Plan', schema);
