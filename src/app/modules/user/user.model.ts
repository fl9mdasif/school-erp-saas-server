import mongoose from 'mongoose';
import { createTenantSchema } from '../../plugins/createTenantSchema';
import type { IUser } from './user.interface';

const schema = createTenantSchema({
  role: {
    type: String,
    enum: ['admin', 'teacher', 'accountant', 'student', 'guardian'],
    required: true,
    index: true,
  },
  name: { type: String, required: true, trim: true },
  email: { type: String, lowercase: true, trim: true },
  phone: { type: String, trim: true },
  studentLoginId: { type: String, trim: true },
  passwordHash: { type: String, required: true, select: false },
  mustChangePassword: { type: Boolean, default: false },
  status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
  linkedStudentId: { type: mongoose.Schema.Types.ObjectId },
  linkedGuardianId: { type: mongoose.Schema.Types.ObjectId },
  lastLoginAt: Date,
  failedLoginCount: { type: Number, default: 0 },
  lockedUntil: Date,
});

schema.index(
  { tenantId: 1, email: 1 },
  { unique: true, partialFilterExpression: { email: { $type: 'string' } } },
);
schema.index(
  { tenantId: 1, phone: 1 },
  {
    unique: true,
    partialFilterExpression: {
      phone: { $type: 'string' },
      role: { $in: ['admin', 'teacher', 'accountant', 'guardian'] },
    },
  },
);
schema.index(
  { tenantId: 1, studentLoginId: 1 },
  { unique: true, partialFilterExpression: { studentLoginId: { $type: 'string' } } },
);

export const User = mongoose.model<IUser>('User', schema);
