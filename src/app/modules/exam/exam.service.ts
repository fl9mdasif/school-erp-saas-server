import { Types } from 'mongoose';
import { AppError } from '../../errors/AppError';
import { toSkip, type PageParams } from '../../lib/pagination';
import { writeAudit } from '../auditLog/auditLog.model';
import { AcademicSession } from '../academicSession/academicSession.model';
import { ClassModel } from '../class/class.model';
import { GradingScale } from '../gradingScale/gradingScale.model';
import { Mark } from '../marks/mark.model';
import { Exam } from './exam.model';

interface Auth {
  userId: Types.ObjectId;
  role: string;
}

export const loadExam = async (id: string) => {
  const exam = await Exam.findById(id);
  if (!exam) throw AppError.notFound('Exam not found');
  return exam;
};

export const listExams = async (auth: Auth, page: PageParams, f: { status?: string; sessionId?: string }) => {
  const filter: Record<string, any> = {};
  if (f.sessionId) filter.sessionId = f.sessionId;
  // Students and guardians only ever see published exams.
  if (auth.role === 'student' || auth.role === 'guardian') filter.status = 'published';
  else if (f.status) filter.status = f.status;
  const [rows, total] = await Promise.all([
    Exam.find(filter).sort({ createdAt: -1 }).skip(toSkip(page)).limit(page.limit).lean(),
    Exam.countDocuments(filter),
  ]);
  return { rows, total };
};

export const getExam = async (auth: Auth, id: string) => {
  const exam = await Exam.findById(id).lean();
  if (!exam || ((auth.role === 'student' || auth.role === 'guardian') && exam.status !== 'published'))
    throw AppError.notFound('Exam not found');
  return exam;
};

const validateRefs = async (b: { sessionId?: string; classIds?: string[]; gradingScaleId?: string }) => {
  if (b.sessionId && !(await AcademicSession.exists({ _id: b.sessionId })))
    throw AppError.badRequest('Session not found');
  if (
    b.classIds &&
    (await ClassModel.countDocuments({ _id: { $in: b.classIds } })) !== new Set(b.classIds).size
  )
    throw AppError.badRequest('A class was not found');
  if (b.gradingScaleId && !(await GradingScale.exists({ _id: b.gradingScaleId })))
    throw AppError.badRequest('Grading scale not found');
};

export const createExam = async (body: any) => {
  await validateRefs(body);
  let gradingScaleId = body.gradingScaleId;
  if (!gradingScaleId) {
    const def = await GradingScale.findOne({ isDefault: true }).lean();
    if (!def)
      throw AppError.badRequest('No default grading scale. Create one first.', undefined, 'NO_GRADING_SCALE');
    gradingScaleId = def._id;
  }
  const exam = await Exam.create({ ...body, gradingScaleId });
  await writeAudit({
    action: 'exam.create',
    entityType: 'Exam',
    entityId: exam._id,
    after: { name: exam.name },
  });
  return exam;
};

export const updateExam = async (id: string, patch: any) => {
  const exam = await loadExam(id);
  if (exam.status === 'published')
    throw AppError.conflict('A published exam cannot be edited', 'EXAM_PUBLISHED');
  await validateRefs(patch);
  if (
    patch.gradingScaleId &&
    String(patch.gradingScaleId) !== String(exam.gradingScaleId) &&
    (await Mark.exists({ examId: exam._id }))
  ) {
    throw AppError.conflict('The grading scale cannot change once marks exist', 'MARKS_EXIST');
  }
  exam.set(patch);
  await exam.save();
  await writeAudit({ action: 'exam.update', entityType: 'Exam', entityId: exam._id });
  return exam;
};

const FLOW: Record<string, string[]> = {
  draft: ['marks_open'],
  marks_open: ['marks_closed', 'draft'],
  marks_closed: ['marks_open'],
};

export const setExamStatus = async (id: string, status: string) => {
  const exam = await loadExam(id);
  if (exam.status === 'published') throw AppError.conflict('A published exam is final', 'EXAM_PUBLISHED');
  if (!FLOW[exam.status]?.includes(status))
    throw AppError.conflict(`Cannot move an exam from ${exam.status} to ${status}`, 'EXAM_STATE');
  if (status === 'draft' && (await Mark.exists({ examId: exam._id })))
    throw AppError.conflict('Marks already exist, the exam cannot go back to draft', 'MARKS_EXIST');
  const before = exam.status;
  exam.status = status;
  await exam.save();
  await writeAudit({
    action: 'exam.status_change',
    entityType: 'Exam',
    entityId: exam._id,
    before: { status: before },
    after: { status },
  });
  return exam;
};

export const deleteExam = async (id: string, actorId: Types.ObjectId) => {
  const exam = await loadExam(id);
  if (exam.status !== 'draft') throw AppError.conflict('Only a draft exam can be deleted', 'EXAM_STATE');
  await exam.softDelete(actorId);
  await writeAudit({ action: 'exam.delete', entityType: 'Exam', entityId: exam._id });
};
