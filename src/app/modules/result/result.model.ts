import mongoose, { Schema } from 'mongoose';
import { createTenantSchema } from '../../plugins/createTenantSchema';

const subject = new Schema(
  {
    subjectId: { type: Schema.Types.ObjectId, required: true },
    name: String,
    kind: String,
    total: Number,
    fullMarks: Number,
    letter: String,
    point: Number,
    passed: Boolean,
  },
  { _id: false },
);

const schema = createTenantSchema(
  {
    examId: { type: Schema.Types.ObjectId, ref: 'Exam', required: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
    enrolmentId: { type: Schema.Types.ObjectId, ref: 'Enrolment', required: true },
    classId: { type: Schema.Types.ObjectId, ref: 'Class', required: true },
    sectionId: { type: Schema.Types.ObjectId, ref: 'Section' },
    roll: { type: Number, required: true },
    subjects: [subject],
    totalMarks: Number,
    fullMarks: Number,
    percent: Number,
    gpa: Number,
    letter: String,
    division: String,
    passed: Boolean,
    failedSubjectIds: [Schema.Types.ObjectId],
    positionInClass: Number,
    positionInSection: Number,
    remark: String,
    status: { type: String, enum: ['draft', 'published'], default: 'draft' },
    version: { type: Number, default: 1 },
    calculatedAt: Date,
    publishedAt: Date,
  },
  { auditable: false },
);
schema.index({ tenantId: 1, examId: 1, studentId: 1 }, { unique: true });
schema.index({ tenantId: 1, examId: 1, classId: 1, positionInClass: 1 });
schema.index({ tenantId: 1, examId: 1, classId: 1, roll: 1 });

export const Result = mongoose.model('Result', schema) as unknown as mongoose.Model<any>;
