import type { ClientSession, Types } from 'mongoose';
import { AppError } from '../../errors/AppError';
import { AcademicSession } from '../academicSession/academicSession.model';
import { ClassModel } from '../class/class.model';
import { Section } from '../section/section.model';
import { Enrolment } from './enrolment.model';

export const currentSession = async (sessionId?: string | Types.ObjectId) => {
  const s = sessionId
    ? await AcademicSession.findById(sessionId)
    : await AcademicSession.findOne({ isCurrent: true });
  if (!s)
    throw AppError.badRequest(
      sessionId ? 'Session not found' : 'No current academic session is set',
      undefined,
      'NO_CURRENT_SESSION',
    );
  return s;
};

/** Resolves the section to use: the one given (must belong to the class) or the class's hidden default section. */
export const resolveSection = async (
  classId: Types.ObjectId | string,
  sectionId?: Types.ObjectId | string,
  session?: ClientSession,
) => {
  const cls = await ClassModel.findById(classId).session(session ?? null);
  if (!cls) throw AppError.badRequest('Class not found');
  if (sectionId) {
    const sec = await Section.findOne({ _id: sectionId, classId }).session(session ?? null);
    if (!sec) throw AppError.badRequest('Section does not belong to this class');
    return { cls, section: sec };
  }
  let def = await Section.findOne({ classId, isDefault: true }).session(session ?? null);
  if (!def) [def] = await Section.create([{ classId, name: 'Default', isDefault: true }], { session });
  return { cls, section: def! };
};

export const nextRoll = async (
  sessionId: Types.ObjectId,
  classId: Types.ObjectId,
  sectionId: Types.ObjectId,
  session?: ClientSession,
) => {
  const last = await Enrolment.findOne({ sessionId, classId, sectionId })
    .sort({ roll: -1 })
    .select('roll')
    .session(session ?? null)
    .lean();
  return (last?.roll ?? 0) + 1;
};
