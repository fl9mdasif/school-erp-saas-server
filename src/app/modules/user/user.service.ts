import { Types } from 'mongoose';
import { AppError } from '../../errors/AppError';
import { escapeRegex, toSkip, type PageParams } from '../../lib/pagination';
import { hashPassword } from '../../lib/password';
import { generateTempPassword } from '../../lib/tempPassword';
import { writeAudit } from '../auditLog/auditLog.model';
import { revokeAllForUser } from '../auth/session.service';
import { User } from './user.model';

const STAFF = ['admin', 'teacher', 'accountant'];
const PUBLIC_FIELDS = 'role name email phone status mustChangePassword lastLoginAt createdAt';

const getStaff = async (id: string) => {
  const user = await User.findOne({ _id: id, role: { $in: STAFF } });
  if (!user) throw AppError.notFound('User not found');
  return user;
};

/** Refuses any change that would leave the institution without an active admin. */
const assertNotLastAdmin = async (target: { _id: Types.ObjectId; role: string; status: string }) => {
  if (target.role !== 'admin' || target.status !== 'active') return;
  const others = await User.countDocuments({ role: 'admin', status: 'active', _id: { $ne: target._id } });
  if (others === 0) throw AppError.conflict('At least one active admin is required', 'LAST_ADMIN');
};

export const listUsers = async (page: PageParams, f: { role?: string; status?: string; q?: string }) => {
  const filter: Record<string, unknown> = { role: f.role ?? { $in: STAFF } };
  if (f.status) filter.status = f.status;
  if (f.q) {
    const re = new RegExp(escapeRegex(f.q), 'i');
    filter.$or = [{ name: re }, { email: re }, { phone: re }];
  }
  const [rows, total] = await Promise.all([
    User.find(filter)
      .select(PUBLIC_FIELDS)
      .sort({ createdAt: -1 })
      .skip(toSkip(page))
      .limit(page.limit)
      .lean(),
    User.countDocuments(filter),
  ]);
  return { rows, total };
};

export const createUser = async (input: {
  role: string;
  name: string;
  email?: string;
  phone?: string;
  password?: string;
}) => {
  const temp = input.password ? undefined : generateTempPassword();
  const user = await User.create({
    role: input.role,
    name: input.name,
    email: input.email,
    phone: input.phone,
    passwordHash: await hashPassword(input.password ?? temp!),
    mustChangePassword: true,
  });
  await writeAudit({
    action: 'user.create',
    entityType: 'User',
    entityId: user._id,
    after: { role: user.role, name: user.name },
  });
  return {
    user: { id: user._id, role: user.role, name: user.name, email: user.email, phone: user.phone },
    temporaryPassword: temp,
  };
};

export const getUser = async (id: string) => {
  const u = await User.findOne({ _id: id, role: { $in: STAFF } })
    .select(PUBLIC_FIELDS)
    .lean();
  if (!u) throw AppError.notFound('User not found');
  return u;
};

export const updateUser = async (
  id: string,
  patch: { role?: string; name?: string; email?: string; phone?: string },
  actorId: Types.ObjectId,
) => {
  const user = await getStaff(id);
  const before = { role: user.role, name: user.name, email: user.email, phone: user.phone };

  if (patch.role && patch.role !== user.role) {
    if (user._id.equals(actorId)) throw AppError.forbidden('You cannot change your own role');
    await assertNotLastAdmin(user);
    user.role = patch.role as any;
  }
  if (patch.name) user.name = patch.name;
  if (patch.email) user.email = patch.email;
  if (patch.phone) user.phone = patch.phone;
  await user.save();

  if (before.role !== user.role) {
    await revokeAllForUser(user._id); // force a fresh token carrying the new role
    await writeAudit({
      action: 'user.role_change',
      entityType: 'User',
      entityId: user._id,
      before: { role: before.role },
      after: { role: user.role },
    });
  } else {
    await writeAudit({
      action: 'user.update',
      entityType: 'User',
      entityId: user._id,
      before,
      after: { name: user.name, email: user.email, phone: user.phone },
    });
  }
  return getUser(id);
};

export const setUserStatus = async (id: string, status: 'active' | 'inactive', actorId: Types.ObjectId) => {
  const user = await getStaff(id);
  if (status === 'inactive') {
    if (user._id.equals(actorId)) throw AppError.forbidden('You cannot deactivate your own account');
    await assertNotLastAdmin(user);
  }
  const before = user.status;
  user.status = status;
  await user.save();
  if (status === 'inactive') await revokeAllForUser(user._id);
  await writeAudit({
    action: 'user.status_change',
    entityType: 'User',
    entityId: user._id,
    before: { status: before },
    after: { status },
  });
  return getUser(id);
};

export const resetUserPassword = async (id: string) => {
  const user = await getStaff(id);
  const temp = generateTempPassword();
  await User.updateOne(
    { _id: user._id },
    {
      $set: { passwordHash: await hashPassword(temp), mustChangePassword: true, failedLoginCount: 0 },
      $unset: { lockedUntil: 1 },
    },
  );
  await revokeAllForUser(user._id);
  await writeAudit({ action: 'user.reset_password', entityType: 'User', entityId: user._id });
  return { temporaryPassword: temp };
};
