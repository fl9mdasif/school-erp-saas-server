import mongoose, { Schema } from 'mongoose';
import { createTenantSchema } from '../../plugins/createTenantSchema';

// Append-only: no update, no delete, no soft delete. Corrections are new reversal entries.
const schema = createTenantSchema(
  {
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
    invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice' },
    paymentId: { type: Schema.Types.ObjectId, ref: 'Payment' },
    type: { type: String, enum: ['invoice', 'payment', 'reversal', 'adjustment'], required: true },
    // debit raises what the student owes, credit lowers it
    direction: { type: String, enum: ['debit', 'credit'], required: true },
    amount: { type: Number, required: true, min: 1, validate: Number.isInteger },
    reversesEntryId: { type: Schema.Types.ObjectId, ref: 'LedgerEntry' },
    note: String,
    occurredAt: { type: Date, default: () => new Date() },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
schema.index({ tenantId: 1, studentId: 1, occurredAt: 1 });
schema.index({ tenantId: 1, invoiceId: 1 });
schema.index({ tenantId: 1, paymentId: 1 });
schema.index({ tenantId: 1, type: 1, occurredAt: 1 });

for (const op of [
  'updateOne',
  'updateMany',
  'findOneAndUpdate',
  'deleteOne',
  'deleteMany',
  'findOneAndDelete',
  'replaceOne',
] as const) {
  schema.pre(op as any, () => {
    throw new Error('LEDGER_APPEND_ONLY');
  });
}
schema.pre('save', function (this: any) {
  if (!this.isNew) throw new Error('LEDGER_APPEND_ONLY');
});

export const LedgerEntry = mongoose.model('LedgerEntry', schema) as unknown as mongoose.Model<any>;
