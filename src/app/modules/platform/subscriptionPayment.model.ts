import mongoose, { Schema } from 'mongoose';
import { createPlatformSchema } from '../../plugins/createTenantSchema';

const schema = createPlatformSchema({
  tenantId: { type: Schema.Types.ObjectId, required: true, index: true },
  planId: { type: Schema.Types.ObjectId, required: true },
  amount: { type: Number, required: true, min: 0 },
  method: { type: String, enum: ['bkash_manual', 'nagad_manual', 'bank', 'cash'], required: true },
  reference: { type: String, required: true },
  periodStart: { type: Date, required: true },
  periodEnd: { type: Date, required: true },
  recordedBy: { type: Schema.Types.ObjectId, required: true },
});

export const SubscriptionPayment = mongoose.model(
  'SubscriptionPayment',
  schema,
) as unknown as mongoose.Model<any>;
