import mongoose, { Schema } from 'mongoose';
import { createTenantSchema } from '../../plugins/createTenantSchema';
import { componentSchema } from '../subject/subject.model';

const schema = createTenantSchema(
  {
    sessionId: { type: Schema.Types.ObjectId, ref: 'AcademicSession', required: true },
    classId: { type: Schema.Types.ObjectId, ref: 'Class', required: true },
    sectionId: { type: Schema.Types.ObjectId, ref: 'Section' },
    subjectId: { type: Schema.Types.ObjectId, ref: 'Subject', required: true },
    teacherId: { type: Schema.Types.ObjectId, ref: 'User' },
    kind: { type: String, enum: ['compulsory', 'optional', 'fourth'], default: 'compulsory' },
    fullMarks: { type: Number, required: true, min: 0 },
    passMarks: { type: Number, required: true, min: 0 },
    components: { type: [componentSchema], default: [] },
    order: { type: Number, default: 0 },
  },
  { softDelete: true },
);
schema.index(
  { tenantId: 1, sessionId: 1, classId: 1, sectionId: 1, subjectId: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } },
);
schema.index({ tenantId: 1, teacherId: 1 });

export const ClassSubject = mongoose.model('ClassSubject', schema);
