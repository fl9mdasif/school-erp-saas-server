import type { Types } from 'mongoose';
import { AppError } from '../../errors/AppError';
import { AcademicSession } from '../academicSession/academicSession.model';
import { ClassSubject } from '../classSubject/classSubject.model';
import { Enrolment } from '../enrolment/enrolment.model';
import { Guardian } from '../guardian/guardian.model';
import { Section } from '../section/section.model';
import { User } from '../user/user.model';

export type Scope =
  | { kind: 'all' }
  | { kind: 'teacher'; pairs: { classId: Types.ObjectId; sectionId?: Types.ObjectId }[] }
  | { kind: 'own'; studentIds: Types.ObjectId[] };

interface Auth {
  userId: Types.ObjectId;
  role: string;
}

/** Student ids a student or guardian account is linked to. Always derived server side. */
export const linkedStudentIds = async (auth: Auth): Promise<Types.ObjectId[]> => {
  const user = await User.findById(auth.userId).select('linkedStudentId linkedGuardianId').lean();
  if (!user) return [];
  if (auth.role === 'student') return user.linkedStudentId ? [user.linkedStudentId] : [];
  if (auth.role === 'guardian' && user.linkedGuardianId) {
    const g = await Guardian.findById(user.linkedGuardianId).select('studentIds').lean();
    return (g?.studentIds as Types.ObjectId[]) ?? [];
  }
  return [];
};

/** A teacher's classes come from ClassSubject.teacherId and Section.classTeacherId, never from the client. */
export const teacherPairs = async (teacherId: Types.ObjectId) => {
  const current = await AcademicSession.findOne({ isCurrent: true }).select('_id').lean();
  const pairs: { classId: Types.ObjectId; sectionId?: Types.ObjectId }[] = [];
  if (current) {
    const maps = await ClassSubject.find({ sessionId: current._id, teacherId })
      .select('classId sectionId')
      .lean();
    for (const m of maps) pairs.push({ classId: m.classId, sectionId: m.sectionId ?? undefined });
  }
  const own = await Section.find({ classTeacherId: teacherId }).select('classId _id').lean();
  for (const s of own) pairs.push({ classId: s.classId, sectionId: s._id });
  return pairs;
};

export const scopeFor = async (auth: Auth): Promise<Scope> => {
  if (auth.role === 'admin' || auth.role === 'accountant') return { kind: 'all' };
  if (auth.role === 'teacher') return { kind: 'teacher', pairs: await teacherPairs(auth.userId) };
  return { kind: 'own', studentIds: await linkedStudentIds(auth) };
};

/** Enrolment filter fragment for a teacher scope. */
export const teacherEnrolmentFilter = (pairs: { classId: Types.ObjectId; sectionId?: Types.ObjectId }[]) => ({
  $or: pairs.length
    ? pairs.map((p) =>
        p.sectionId ? { classId: p.classId, sectionId: p.sectionId } : { classId: p.classId },
      )
    : [{ _id: null }],
});

export const assertCanSeeStudent = async (
  auth: Auth,
  student: { _id: Types.ObjectId; currentEnrolmentId?: Types.ObjectId },
) => {
  const scope = await scopeFor(auth);
  if (scope.kind === 'all') return;
  if (scope.kind === 'own') {
    if (scope.studentIds.some((id) => id.equals(student._id))) return;
    throw AppError.notFound('Student not found');
  }
  const ok = student.currentEnrolmentId
    ? await Enrolment.exists({ _id: student.currentEnrolmentId, ...teacherEnrolmentFilter(scope.pairs) })
    : null;
  if (!ok) throw AppError.notFound('Student not found');
};
