import mongoose, { Schema } from 'mongoose';
import { createTenantSchema } from '../../plugins/createTenantSchema';

const schema = createTenantSchema({
  examId: { type: Schema.Types.ObjectId, ref: 'Exam', required: true },
  studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
  enrolmentId: { type: Schema.Types.ObjectId, ref: 'Enrolment', required: true },
  classId: { type: Schema.Types.ObjectId, ref: 'Class', required: true },
  sectionId: { type: Schema.Types.ObjectId, ref: 'Section' },
  subjectId: { type: Schema.Types.ObjectId, ref: 'Subject', required: true },
  components: {
    type: [
      new Schema(
        {
          key: { type: String, required: true },
          obtained: { type: Number, default: null },
          absent: { type: Boolean, default: false },
        },
        { _id: false },
      ),
    ],
    default: [],
  },
  total: { type: Number, default: 0 },
  percent: { type: Number, default: 0 },
  letter: String,
  point: Number,
  status: { type: String, enum: ['draft', 'submitted', 'locked'], default: 'draft' },
  enteredBy: { type: Schema.Types.ObjectId, required: true },
  submittedAt: Date,
});
schema.index({ tenantId: 1, examId: 1, studentId: 1, subjectId: 1 }, { unique: true });
schema.index({ tenantId: 1, examId: 1, classId: 1, sectionId: 1, subjectId: 1 });

export const Mark = mongoose.model('Mark', schema) as unknown as mongoose.Model<any>;
