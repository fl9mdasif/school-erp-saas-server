import type { Types } from 'mongoose';

export interface IPlatformAdmin {
  _id: Types.ObjectId;
  name: string;
  email: string;
  passwordHash: string;
  status: 'active' | 'inactive';
  lastLoginAt?: Date;
  failedLoginCount: number;
  lockedUntil?: Date;
  createdAt: Date;
  updatedAt: Date;
}
