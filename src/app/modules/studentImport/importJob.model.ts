import mongoose from 'mongoose';
import { createTenantSchema } from '../../plugins/createTenantSchema';

const schema = createTenantSchema({
  kind: { type: String, enum: ['students'], default: 'students' },
  status: { type: String, enum: ['dry_run', 'committed', 'failed'], default: 'dry_run' },
  fileName: String,
  totalRows: Number,
  validRows: Number,
  rowErrors: [{ row: Number, field: String, message: String, _id: false }],
  rows: { type: [mongoose.Schema.Types.Mixed], select: false },
  committedAt: Date,
  result: { created: Number, guardiansReused: Number },
});

export const ImportJob = mongoose.model('ImportJob', schema);
