import mongoose, { Schema } from 'mongoose';
import { createTenantSchema } from '../../plugins/createTenantSchema';

const schema = createTenantSchema({
  studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
  sessionId: { type: Schema.Types.ObjectId, ref: 'AcademicSession', required: true },
  classId: { type: Schema.Types.ObjectId, ref: 'Class', required: true },
  sectionId: { type: Schema.Types.ObjectId, ref: 'Section' },
  roll: { type: Number, required: true, min: 1 },
  group: { type: String, enum: ['science', 'commerce', 'arts', null], default: null },
  optionalSubjectIds: [{ type: Schema.Types.ObjectId, ref: 'Subject' }],
  fourthSubjectId: { type: Schema.Types.ObjectId, ref: 'Subject' },
  status: { type: String, enum: ['active', 'promoted', 'repeated', 'left'], default: 'active' },
  promotedFromEnrolmentId: { type: Schema.Types.ObjectId, ref: 'Enrolment' },
});
// roll is unique inside a section for a session; students without a section share a null section key
schema.index({ tenantId: 1, sessionId: 1, classId: 1, sectionId: 1, roll: 1 }, { unique: true });
schema.index({ tenantId: 1, sessionId: 1, studentId: 1 }, { unique: true });
schema.index({ tenantId: 1, sessionId: 1, classId: 1, sectionId: 1 });

export const Enrolment = mongoose.model('Enrolment', schema);
