import mongoose, { Schema } from 'mongoose';
import { createTenantSchema } from '../../plugins/createTenantSchema';

const schema = createTenantSchema({
  isPublished: { type: Boolean, default: false },
  theme: {
    primaryColor: { type: String, default: '#1d4ed8' },
    template: { type: String, enum: ['classic', 'modern'], default: 'classic' },
  },
  hero: { title: { type: String, default: '' }, subtitle: String, imageUrl: String },
  about: String,
  mission: String,
  headMessage: { name: String, designation: String, photoUrl: String, text: String },
  admissionInfo: {
    isOpen: { type: Boolean, default: false },
    text: String,
    classes: [String],
    lastDate: String,
  },
  contact: { phone: String, email: String, address: String, mapUrl: String },
  gallery: {
    type: [new Schema({ url: { type: String, required: true }, caption: String }, { _id: false })],
    default: [],
  },
  social: { facebook: String, youtube: String },
  seo: { title: String, description: String },
  sectionsVisible: {
    about: { type: Boolean, default: true },
    teachers: { type: Boolean, default: true },
    notices: { type: Boolean, default: true },
    gallery: { type: Boolean, default: true },
    admission: { type: Boolean, default: true },
    results: { type: Boolean, default: true },
  },
});
schema.path('tenantId').index(false);
schema.index({ tenantId: 1 }, { unique: true });

export const PublicSite = mongoose.model('PublicSite', schema) as unknown as mongoose.Model<any>;
