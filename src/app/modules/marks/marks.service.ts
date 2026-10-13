import { Types } from 'mongoose';
import { AppError } from '../../errors/AppError';
import { ClassSubject } from '../classSubject/classSubject.model';
import { Enrolment } from '../enrolment/enrolment.model';
import { Exam } from '../exam/exam.model';
import { loadExam } from '../exam/exam.service';
import { GradingScale } from '../gradingScale/gradingScale.model';
import { gradeSubject, type ComponentDef, type Scale } from '../result/result.engine';
import { Student } from '../student/student.model';
import { Subject } from '../subject/subject.model';
import { Mark } from './mark.model';

interface Auth {
  userId: Types.ObjectId;
  role: string;
}

export interface SheetScope {
  classId: string;
  sectionId?: string;
  subjectId: string;
}

/** Components of a class-subject. Without components a single "total" component is used and the percent rule decides pass. */
export const componentsOf = (cs: any): ComponentDef[] =>
  cs.components?.length
    ? cs.components.map((c: any) => ({ key: c.key, fullMarks: c.fullMarks, passMarks: c.passMarks }))
    : [{ key: 'total', fullMarks: cs.fullMarks, passMarks: 0 }];

export const scaleOf = async (exam: any): Promise<Scale> => {
  const s: any = await GradingScale.findById(exam.gradingScaleId).lean();
  if (!s) throw AppError.notFound('Grading scale not found');
  return { kind: s.kind, bands: s.bands, passPercent: s.passPercent, rules: s.rules };
};

/** Finds the class-subject for an exam. A section-specific mapping wins over a class-wide one. */
export const findClassSubject = async (exam: any, scope: SheetScope) => {
  if (!exam.classIds.some((c: Types.ObjectId) => String(c) === scope.classId))
    throw AppError.badRequest('This class is not part of the exam', undefined, 'CLASS_NOT_IN_EXAM');
  const candidates = await ClassSubject.find({
    sessionId: exam.sessionId,
    classId: scope.classId,
    subjectId: scope.subjectId,
  }).lean();
  const cs =
    candidates.find((c: any) => scope.sectionId && String(c.sectionId) === scope.sectionId) ??
    candidates.find((c: any) => !c.sectionId);
  if (!cs) throw AppError.notFound('This subject is not taught in this class', 'SUBJECT_NOT_MAPPED');
  return cs as any;
};

const assertMayEnter = (auth: Auth, cs: any) => {
  if (auth.role === 'admin') return;
  if (!cs.teacherId || String(cs.teacherId) !== String(auth.userId))
    throw AppError.forbidden('You are not the teacher of this subject');
};

/** Students who take this subject: everyone for compulsory, only choosers for optional and fourth. */
export const subjectRoster = async (exam: any, scope: SheetScope, cs: any) => {
  const filter: Record<string, any> = { sessionId: exam.sessionId, classId: scope.classId, status: 'active' };
  if (scope.sectionId) filter.sectionId = scope.sectionId;
  if (cs.sectionId) filter.sectionId = cs.sectionId;
  const enrolments = await Enrolment.find(filter).sort({ roll: 1 }).lean();
  const takes = (e: any) =>
    cs.kind === 'compulsory' ||
    (cs.kind === 'optional' &&
      (e.optionalSubjectIds ?? []).some((id: Types.ObjectId) => String(id) === scope.subjectId)) ||
    (cs.kind === 'fourth' && String(e.fourthSubjectId) === scope.subjectId);
  const taking = enrolments.filter(takes);
  const students = await Student.find({ _id: { $in: taking.map((e: any) => e.studentId) }, status: 'active' })
    .select('name studentId')
    .lean();
  const byId = new Map(students.map((s: any) => [String(s._id), s]));
  return taking
    .filter((e: any) => byId.has(String(e.studentId)))
    .map((e: any) => ({ enrolment: e, student: byId.get(String(e.studentId)) as any }));
};

export const getMarksSheet = async (auth: Auth, examId: string, scope: SheetScope) => {
  const exam = await loadExam(examId);
  const cs = await findClassSubject(exam, scope);
  assertMayEnter(auth, cs);
  const roster = await subjectRoster(exam, scope, cs);
  const marks = await Mark.find({
    examId: exam._id,
    subjectId: scope.subjectId,
    studentId: { $in: roster.map((r) => r.student._id) },
  }).lean();
  const byStudent = new Map(marks.map((m: any) => [String(m.studentId), m]));
  const subject: any = await Subject.findById(scope.subjectId).select('name').lean();
  return {
    exam: { id: exam._id, name: exam.name, status: exam.status },
    subject: {
      id: scope.subjectId,
      name: subject?.name,
      kind: cs.kind,
      fullMarks: cs.fullMarks,
      components: cs.components,
    },
    rows: roster.map((r) => {
      const m: any = byStudent.get(String(r.student._id));
      return {
        studentId: r.student._id,
        studentCode: r.student.studentId,
        name: r.student.name,
        roll: r.enrolment.roll,
        status: m?.status ?? 'empty',
        components: m?.components ?? [],
        total: m?.total,
        letter: m?.letter,
      };
    }),
  };
};

export const saveMarks = async (
  auth: Auth,
  examId: string,
  body: {
    classId: string;
    sectionId?: string;
    subjectId: string;
    marks: { studentId: string; components: { key: string; obtained: number | null; absent: boolean }[] }[];
  },
) => {
  const exam = await loadExam(examId);
  if (exam.status !== 'marks_open')
    throw AppError.conflict('Marks entry is not open for this exam', 'MARKS_CLOSED');
  const scope: SheetScope = { classId: body.classId, sectionId: body.sectionId, subjectId: body.subjectId };
  const cs = await findClassSubject(exam, scope);
  assertMayEnter(auth, cs);
  const defs = componentsOf(cs);
  const scale = await scaleOf(exam);
  const roster = await subjectRoster(exam, scope, cs);
  const rosterBy = new Map(roster.map((r) => [String(r.student._id), r]));
  const subject: any = await Subject.findById(scope.subjectId).select('name').lean();

  // Validate everything first so a bad row rejects the whole request and nothing is half saved.
  const errors: { studentId: string; message: string }[] = [];
  for (const entry of body.marks) {
    if (!rosterBy.has(entry.studentId)) {
      errors.push({
        studentId: entry.studentId,
        message: 'Student does not take this subject in this class',
      });
      continue;
    }
    for (const c of entry.components) {
      const def = defs.find((d) => d.key === c.key);
      if (!def) errors.push({ studentId: entry.studentId, message: `Unknown component "${c.key}"` });
      else if (!c.absent && c.obtained !== null && c.obtained > def.fullMarks)
        errors.push({
          studentId: entry.studentId,
          message: `${c.key}: ${c.obtained} is above the full marks ${def.fullMarks}`,
        });
    }
  }
  if (errors.length) throw AppError.badRequest('Some marks are not valid', errors, 'MARKS_INVALID');

  const locked = await Mark.find({
    examId: exam._id,
    subjectId: scope.subjectId,
    studentId: { $in: body.marks.map((m) => m.studentId) },
    status: { $ne: 'draft' },
  })
    .select('studentId')
    .lean();
  if (locked.length)
    throw AppError.conflict(
      'Some marks are submitted or locked. Ask an admin to unlock them.',
      'MARK_LOCKED',
      { studentIds: locked.map((l: any) => String(l.studentId)) },
    );

  let saved = 0;
  for (const entry of body.marks) {
    const r = rosterBy.get(entry.studentId)!;
    const components = entry.components.map((c) => ({
      key: c.key,
      obtained: c.absent ? null : c.obtained,
      absent: c.absent,
    }));
    const g = gradeSubject(
      {
        subjectId: scope.subjectId,
        name: subject?.name ?? '',
        kind: cs.kind,
        fullMarks: cs.fullMarks,
        components: defs,
        marks: components,
      },
      scale,
    );
    await Mark.findOneAndUpdate(
      { examId: exam._id, studentId: entry.studentId, subjectId: scope.subjectId },
      {
        $set: {
          components,
          total: g.total,
          percent: g.percent,
          letter: g.letter,
          point: g.point,
          enteredBy: auth.userId,
          enrolmentId: r.enrolment._id,
          classId: r.enrolment.classId,
          sectionId: r.enrolment.sectionId,
        },
        $setOnInsert: { status: 'draft' },
      },
      { upsert: true },
    );
    saved += 1;
  }
  return { saved };
};

export const submitMarks = async (auth: Auth, examId: string, scope: SheetScope) => {
  const exam = await loadExam(examId);
  if (exam.status !== 'marks_open')
    throw AppError.conflict('Marks entry is not open for this exam', 'MARKS_CLOSED');
  const cs = await findClassSubject(exam, scope);
  assertMayEnter(auth, cs);
  const defs = componentsOf(cs);
  const roster = await subjectRoster(exam, scope, cs);
  const ids = roster.map((r) => r.student._id);
  const marks = await Mark.find({
    examId: exam._id,
    subjectId: scope.subjectId,
    studentId: { $in: ids },
  }).lean();
  const have = new Map(marks.map((m: any) => [String(m.studentId), m]));

  const missing = roster.filter((r) => {
    const m: any = have.get(String(r.student._id));
    if (!m) return true;
    return defs.some((d) => {
      const c = m.components.find((x: any) => x.key === d.key);
      return !c || (!c.absent && c.obtained === null);
    });
  });
  if (missing.length)
    throw AppError.badRequest(
      'Enter marks (or mark absent) for every student before submitting',
      {
        missing: missing.map((m) => ({
          studentId: m.student._id,
          name: m.student.name,
          roll: m.enrolment.roll,
        })),
      },
      'MISSING_MARKS',
    );

  await Mark.updateMany(
    { examId: exam._id, subjectId: scope.subjectId, studentId: { $in: ids }, status: 'draft' },
    { $set: { status: 'submitted', submittedAt: new Date() } },
  );
  return { submitted: ids.length };
};

export const unlockMarks = async (examId: string, scope: SheetScope) => {
  const exam = await loadExam(examId);
  if (exam.status === 'published')
    throw AppError.conflict('Published marks change only through a result correction', 'EXAM_PUBLISHED');
  const cs = await findClassSubject(exam, scope);
  const roster = await subjectRoster(exam, scope, cs);
  const res = await Mark.updateMany(
    {
      examId: exam._id,
      subjectId: scope.subjectId,
      studentId: { $in: roster.map((r) => r.student._id) },
      status: 'submitted',
    },
    { $set: { status: 'draft' }, $unset: { submittedAt: 1 } },
  );
  return { unlocked: res.modifiedCount };
};

/** Entry progress per subject and section, for the admin to chase teachers. */
export const examProgress = async (examId: string) => {
  const exam = await loadExam(examId);
  const mappings = await ClassSubject.find({
    sessionId: exam.sessionId,
    classId: { $in: exam.classIds },
  }).lean();
  const subjects = await Subject.find({ _id: { $in: mappings.map((m: any) => m.subjectId) } })
    .select('name')
    .lean();
  const names = new Map(subjects.map((s: any) => [String(s._id), s.name]));
  const rows = [];
  for (const cs of mappings as any[]) {
    const scope: SheetScope = {
      classId: String(cs.classId),
      sectionId: cs.sectionId ? String(cs.sectionId) : undefined,
      subjectId: String(cs.subjectId),
    };
    const roster = await subjectRoster(exam, scope, cs);
    const ids = roster.map((r) => r.student._id);
    const [entered, submitted] = await Promise.all([
      Mark.countDocuments({ examId: exam._id, subjectId: cs.subjectId, studentId: { $in: ids } }),
      Mark.countDocuments({
        examId: exam._id,
        subjectId: cs.subjectId,
        studentId: { $in: ids },
        status: { $in: ['submitted', 'locked'] },
      }),
    ]);
    rows.push({
      classId: cs.classId,
      sectionId: cs.sectionId,
      subjectId: cs.subjectId,
      subject: names.get(String(cs.subjectId)),
      teacherId: cs.teacherId,
      students: ids.length,
      entered,
      submitted,
      complete: ids.length > 0 && submitted === ids.length,
    });
  }
  return {
    examId: exam._id,
    status: exam.status,
    rows,
    complete: rows.every((r) => r.complete || r.students === 0),
  };
};

void Exam;
