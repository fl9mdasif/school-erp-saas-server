import mongoose from 'mongoose';
import { createTenantSchema } from '../../plugins/createTenantSchema';

const schema = createTenantSchema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    phone: { type: String, required: true },
    message: { type: String, maxlength: 1000 },
    classInterest: { type: String, maxlength: 60 },
    status: { type: String, enum: ['new', 'contacted', 'closed'], default: 'new' },
    source: { type: String, enum: ['public_site'], default: 'public_site' },
  },
  { auditable: false },
);
schema.index({ tenantId: 1, status: 1, createdAt: -1 });

export const Inquiry = mongoose.model('Inquiry', schema) as unknown as mongoose.Model<any>;
