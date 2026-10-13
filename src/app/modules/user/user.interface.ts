import type { Types } from 'mongoose';

export type UserRole = 'admin' | 'teacher' | 'accountant' | 'student' | 'guardian';

export interface IUser {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  role: UserRole;
  name: string;
  email?: string;
  phone?: string;
  studentLoginId?: string;
  passwordHash: string;
  mustChangePassword: boolean;
  status: 'active' | 'inactive';
  linkedStudentId?: Types.ObjectId;
  linkedGuardianId?: Types.ObjectId;
  lastLoginAt?: Date;
  failedLoginCount: number;
  lockedUntil?: Date;
  createdAt: Date;
  updatedAt: Date;
}
