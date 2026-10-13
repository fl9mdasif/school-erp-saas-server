import mongoose, { Schema } from 'mongoose';
import { createTenantSchema } from '../../plugins/createTenantSchema';

const schema = createTenantSchema({
  receiptNo: { type: String, required: true },
  studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
  allocations: {
    type: [
      new Schema(
        {
          invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice', required: true },
          amount: { type: Number, required: true, min: 1 },
        },
        { _id: false },
      ),
    ],
    required: true,
  },
  amount: { type: Number, required: true, min: 1, validate: Number.isInteger },
  method: {
    type: String,
    enum: ['cash', 'bank', 'cheque', 'bkash_manual', 'nagad_manual', 'rocket_manual', 'online'],
    required: true,
  },
  status: { type: String, enum: ['pending', 'succeeded', 'failed', 'reversed'], default: 'succeeded' },
  provider: { type: String, enum: ['manual', 'bkash', 'nagad', 'sslcommerz', 'aamarpay'], default: 'manual' },
  providerRef: String,
  idempotencyKey: { type: String, required: true },
  receivedBy: { type: Schema.Types.ObjectId, required: true },
  receivedAt: { type: Date, required: true },
  reversedByPaymentId: Schema.Types.ObjectId,
  reversedAt: Date,
  reversalReason: String,
  note: { type: String, maxlength: 300 },
});
schema.index({ tenantId: 1, idempotencyKey: 1 }, { unique: true });
schema.index({ tenantId: 1, receiptNo: 1 }, { unique: true });
schema.index({ tenantId: 1, studentId: 1, receivedAt: -1 });
schema.index({ tenantId: 1, status: 1, receivedAt: -1 });

export const Payment = mongoose.model('Payment', schema) as unknown as mongoose.Model<any>;
