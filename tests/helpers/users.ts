import { Types } from 'mongoose';
import { hashPassword } from '../../src/app/lib/password';
import { runAsTenant } from '../../src/app/lib/tenantContext';
import { User } from '../../src/app/modules/user/user.model';

export const addUser = async (
  tenantId: string,
  over: {
    role: 'teacher' | 'accountant' | 'admin' | 'student' | 'guardian';
    email?: string;
    phone?: string;
    studentLoginId?: string;
    password?: string;
    name?: string;
  },
) =>
  runAsTenant(new Types.ObjectId(tenantId), async () =>
    User.create({
      name: over.name ?? `${over.role} user`,
      role: over.role,
      email: over.email,
      phone: over.phone,
      studentLoginId: over.studentLoginId,
      passwordHash: await hashPassword(over.password ?? 'Passw0rd!long'),
    }),
  );
