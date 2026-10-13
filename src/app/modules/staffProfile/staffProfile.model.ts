import mongoose, { Schema } from 'mongoose';
import { createTenantSchema } from '../../plugins/createTenantSchema';

const schema = createTenantSchema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    name: { type: String, required: true, trim: true },
    designation: { type: String, required: true, trim: true },
    photoUrl: String,
    bio: { type: String, maxlength: 1000 },
    showOnPublicSite: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  { softDelete: true },
);
schema.index({ tenantId: 1, showOnPublicSite: 1, order: 1 });

export const StaffProfile = mongoose.model('StaffProfile', schema) as unknown as mongoose.Model<any>;
