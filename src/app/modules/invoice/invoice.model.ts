import mongoose, { Schema } from 'mongoose';
import { createTenantSchema } from '../../plugins/createTenantSchema';

const line = new Schema(
  {
    feeHeadId: { type: Schema.Types.ObjectId, ref: 'FeeHead', required: true },
    label: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
    discount: { type: Number, required: true, min: 0, default: 0 },
  },
  { _id: false },
);

const schema = createTenantSchema({
  invoiceNo: { type: String, required: true },
  studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
  enrolmentId: { type: Schema.Types.ObjectId, ref: 'Enrolment', required: true },
  sessionId: { type: Schema.Types.ObjectId, ref: 'AcademicSession', required: true },
  periodLabel: { type: String, required: true },
  feeHeadSignature: { type: String, required: true },
  lines: { type: [line], required: true },
  total: { type: Number, required: true, min: 0 },
  dueDate: { type: String, required: true },
  issuedAt: { type: Date, required: true },
  batchId: String,
  // Derived cache, maintained together with ledger writes. The ledger is the source of truth.
  paidTotal: { type: Number, default: 0, min: 0 },
  dueAmount: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ['unpaid', 'partial', 'paid', 'voided'], default: 'unpaid' },
  voidedAt: Date,
  voidReason: String,
});
schema.index({ tenantId: 1, invoiceNo: 1 }, { unique: true });
// One live invoice per student, session, period and set of fee heads. A voided one may be regenerated.
schema.index(
  { tenantId: 1, studentId: 1, sessionId: 1, periodLabel: 1, feeHeadSignature: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ['unpaid', 'partial', 'paid'] } } },
);
schema.index({ tenantId: 1, status: 1, dueDate: 1 });
schema.index({ tenantId: 1, studentId: 1, status: 1 });

export const Invoice = mongoose.model('Invoice', schema) as unknown as mongoose.Model<any>;

const batchSchema = createTenantSchema({
  key: { type: String, required: true },
  status: { type: String, enum: ['running', 'done'], default: 'running' },
  summary: Schema.Types.Mixed,
});
batchSchema.index({ tenantId: 1, key: 1 }, { unique: true });
export const InvoiceBatch = mongoose.model('InvoiceBatch', batchSchema) as unknown as mongoose.Model<any>;
