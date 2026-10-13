import mongoose, { Schema } from 'mongoose';
import { createTenantSchema } from '../../plugins/createTenantSchema';

const record = new Schema(
  {
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
    enrolmentId: { type: Schema.Types.ObjectId, ref: 'Enrolment', required: true },
    status: { type: String, enum: ['present', 'absent', 'late', 'leave'], required: true },
    note: { type: String, maxlength: 200 },
  },
  { _id: false },
);

const schema = createTenantSchema({
  sessionId: { type: Schema.Types.ObjectId, ref: 'AcademicSession', required: true },
  classId: { type: Schema.Types.ObjectId, ref: 'Class', required: true },
  sectionId: { type: Schema.Types.ObjectId, ref: 'Section', required: true },
  date: { type: String, required: true },
  records: { type: [record], default: [] },
  takenBy: { type: Schema.Types.ObjectId, required: true },
  takenAt: { type: Date, required: true },
  lastEditedBy: Schema.Types.ObjectId,
  lastEditedAt: Date,
});
schema.index({ tenantId: 1, sectionId: 1, date: 1 }, { unique: true });
schema.index({ tenantId: 1, date: 1 });
schema.index({ tenantId: 1, 'records.studentId': 1, date: 1 });

export const AttendanceSheet = mongoose.model('AttendanceSheet', schema);
