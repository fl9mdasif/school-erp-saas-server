import { Types } from 'mongoose';
import { AppError } from '../../errors/AppError';
import { toSkip, type PageParams } from '../../lib/pagination';
import { writeAudit } from '../auditLog/auditLog.model';
import { Enrolment } from '../enrolment/enrolment.model';
import { Section } from '../section/section.model';
import { linkedStudentIds, teacherPairs } from '../student/student.access';
import { Student } from '../student/student.model';
import { Notice } from './notice.model';

interface Auth {
  userId: Types.ObjectId;
  role: string;
}

const live = () => {
  const now = new Date();
  return {
    status: 'published',
    publishAt: { $lte: now },
    $or: [{ expiresAt: { $exists: false } }, { expiresAt: null }, { expiresAt: { $gt: now } }],
  };
};

/** Mongo filter of notices a given user may read. Audience rules live on the server only. */
const visibleFilter = async (auth: Auth): Promise<Record<string, any>> => {
  if (auth.role === 'admin') return {};
  if (auth.role === 'accountant') return { $and: [live(), { 'audience.type': { $in: ['all', 'staff'] } }] };

  const classIds: Types.ObjectId[] = [];
  const sectionIds: Types.ObjectId[] = [];
  let types: string[];
  if (auth.role === 'teacher') {
    types = ['all', 'staff', 'students_guardians'];
    for (const p of await teacherPairs(auth.userId)) {
      if (p.sectionId) sectionIds.push(p.sectionId);
      else classIds.push(p.classId);
    }
  } else {
    types = ['all', 'students_guardians'];
    const ids = await linkedStudentIds(auth);
    const students = await Student.find({ _id: { $in: ids } })
      .select('currentEnrolmentId')
      .lean();
    const enrols = await Enrolment.find({
      _id: { $in: students.map((s) => s.currentEnrolmentId).filter(Boolean) },
    })
      .select('classId sectionId')
      .lean();
    for (const e of enrols) {
      classIds.push(e.classId);
      if (e.sectionId) sectionIds.push(e.sectionId);
    }
  }
  const audience: any[] = [{ 'audience.type': { $in: types } }];
  if (classIds.length) audience.push({ 'audience.type': 'class', 'audience.classIds': { $in: classIds } });
  if (sectionIds.length)
    audience.push({ 'audience.type': 'section', 'audience.sectionIds': { $in: sectionIds } });
  const published = { $and: [live(), { $or: audience }] };
  return auth.role === 'teacher' ? { $or: [published, { postedBy: auth.userId }] } : published;
};

/** A teacher may post only to classes or sections they are assigned to, and never publicly. */
const assertTeacherMayPost = async (auth: Auth, body: any) => {
  if (auth.role !== 'teacher') return;
  if (body.isPublic) throw AppError.forbidden('Teachers cannot post public notices');
  const type = body.audience?.type;
  if (type !== 'class' && type !== 'section')
    throw AppError.forbidden('Teachers can only post to their own classes or sections');
  const pairs = await teacherPairs(auth.userId);
  if (type === 'class') {
    for (const id of body.audience.classIds)
      if (
        !pairs.some((p) => p.classId.equals(id) && !p.sectionId) &&
        !pairs.some((p) => p.classId.equals(id))
      )
        throw AppError.forbidden('You are not assigned to one of these classes');
  } else {
    const sections = await Section.find({ _id: { $in: body.audience.sectionIds } })
      .select('classId')
      .lean();
    for (const s of sections)
      if (!pairs.some((p) => p.classId.equals(s.classId) && (!p.sectionId || p.sectionId.equals(s._id))))
        throw AppError.forbidden('You are not assigned to one of these sections');
  }
};

export const listNotices = async (auth: Auth, page: PageParams, status?: string) => {
  const base = await visibleFilter(auth);
  const filter: any = status && auth.role === 'admin' ? { ...base, status } : base;
  const [rows, total] = await Promise.all([
    Notice.find(filter).sort({ publishAt: -1 }).skip(toSkip(page)).limit(page.limit).lean(),
    Notice.countDocuments(filter),
  ]);
  return { rows, total };
};

export const getNotice = async (auth: Auth, id: string) => {
  const n = await Notice.findOne({ $and: [{ _id: id }, await visibleFilter(auth)] }).lean();
  if (!n) throw AppError.notFound('Notice not found');
  return n;
};

export const createNotice = async (auth: Auth, body: any) => {
  await assertTeacherMayPost(auth, body);
  const notice = await Notice.create({
    ...body,
    postedBy: auth.userId,
    publishAt: body.publishAt ?? new Date(),
  });
  await writeAudit({
    action: 'notice.create',
    entityType: 'Notice',
    entityId: notice._id,
    after: { title: notice.title, audience: notice.audience.type },
  });
  return notice;
};

const loadOwn = async (auth: Auth, id: string) => {
  const n = await Notice.findById(id);
  if (!n) throw AppError.notFound('Notice not found');
  if (auth.role !== 'admin' && !n.postedBy.equals(auth.userId)) throw AppError.notFound('Notice not found');
  return n;
};

export const updateNotice = async (auth: Auth, id: string, patch: any) => {
  const n = await loadOwn(auth, id);
  await assertTeacherMayPost(auth, { ...n.toObject(), ...patch });
  n.set(patch);
  await n.save();
  await writeAudit({ action: 'notice.update', entityType: 'Notice', entityId: n._id });
  return n;
};

export const deleteNotice = async (auth: Auth, id: string) => {
  const n = await loadOwn(auth, id);
  await (n as any).softDelete(auth.userId);
  await writeAudit({ action: 'notice.delete', entityType: 'Notice', entityId: n._id });
};
