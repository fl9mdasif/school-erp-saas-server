import mongoose, { Schema } from 'mongoose';
import { createTenantSchema } from '../../plugins/createTenantSchema';

const schema = createTenantSchema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    body: { type: String, required: true, maxlength: 10000 },
    audience: {
      type: {
        type: String,
        enum: ['all', 'staff', 'students_guardians', 'class', 'section'],
        default: 'all',
      },
      classIds: [{ type: Schema.Types.ObjectId, ref: 'Class' }],
      sectionIds: [{ type: Schema.Types.ObjectId, ref: 'Section' }],
    },
    isPublic: { type: Boolean, default: false },
    attachments: {
      type: [
        new Schema(
          { url: { type: String, required: true }, name: { type: String, required: true } },
          { _id: false },
        ),
      ],
      default: [],
    },
    status: { type: String, enum: ['draft', 'published'], default: 'published' },
    publishAt: { type: Date, default: () => new Date() },
    expiresAt: Date,
    postedBy: { type: Schema.Types.ObjectId, required: true },
  },
  { softDelete: true },
);
schema.index({ tenantId: 1, status: 1, publishAt: -1 });
schema.index({ tenantId: 1, isPublic: 1, status: 1, publishAt: -1 });

export const Notice = mongoose.model('Notice', schema);
