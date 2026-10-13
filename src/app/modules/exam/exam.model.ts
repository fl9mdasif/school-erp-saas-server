import mongoose, { Schema } from 'mongoose';
import { createTenantSchema } from '../../plugins/createTenantSchema';

const schema = createTenantSchema(
  {
    name: { type: String, required: true, trim: true },
    kind: { type: String, enum: ['term', 'class_test', 'model_test', 'monthly', 'custom'], default: 'term' },
    sessionId: { type: Schema.Types.ObjectId, ref: 'AcademicSession', required: true },
    classIds: [{ type: Schema.Types.ObjectId, ref: 'Class' }],
    gradingScaleId: { type: Schema.Types.ObjectId, ref: 'GradingScale', required: true },
    startDate: String,
    endDate: String,
    status: { type: String, enum: ['draft', 'marks_open', 'marks_closed', 'published'], default: 'draft' },
    publishedAt: Date,
    publishedBy: Schema.Types.ObjectId,
    resultVersion: { type: Number, default: 1 },
  },
  { softDelete: true },
);
schema.index({ tenantId: 1, sessionId: 1, status: 1 });
schema.index({ tenantId: 1, status: 1, publishedAt: -1 });

export const Exam = mongoose.model('Exam', schema) as unknown as mongoose.Model<any>;
