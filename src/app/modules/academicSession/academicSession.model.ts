import mongoose from 'mongoose';
import { createTenantSchema } from '../../plugins/createTenantSchema';

const schema = createTenantSchema(
  {
    name: { type: String, required: true, trim: true },
    startDate: { type: String, required: true },
    endDate: { type: String, required: true },
    isCurrent: { type: Boolean, default: false },
  },
  { softDelete: true },
);
schema.index({ tenantId: 1, name: 1 }, { unique: true, partialFilterExpression: { isDeleted: false } });
schema.index(
  { tenantId: 1, isCurrent: 1 },
  { unique: true, partialFilterExpression: { isCurrent: true, isDeleted: false } },
);

export const AcademicSession = mongoose.model<any>('AcademicSession', schema);
