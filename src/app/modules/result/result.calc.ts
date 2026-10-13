import { Types } from 'mongoose';
import { AppError } from '../../errors/AppError';
import { scopedBulkWrite } from '../../lib/scopedBulk';
import { ClassSubject } from '../classSubject/classSubject.model';
import { Enrolment } from '../enrolment/enrolment.model';
import { loadExam } from '../exam/exam.service';
import { componentsOf, scaleOf } from '../marks/marks.service';
import { Mark } from '../marks/mark.model';
import { Student } from '../student/student.model';
import { Subject } from '../subject/subject.model';
import { Result } from './result.model';
import { gradeStudent, rank, type Scale, type SubjectInput } from './result.engine';

/** Subjects one enrolment takes: class wide ones plus section specific, and only the optional/fourth ones it chose. */
export const subjectsForEnrolment = (e: any, mappings: any[]) => {
  const mine = mappings.filter(
    (m) =>
      String(m.classId) === String(e.classId) &&
      (!m.sectionId || String(m.sectionId) === String(e.sectionId)),
  );
  // a section specific mapping replaces the class wide one for the same subject
  const bySubject = new Map<string, any>();
  for (const m of mine) {
    const k = String(m.subjectId);
    if (!bySubject.has(k) || m.sectionId) bySubject.set(k, m);
  }
  return [...bySubject.values()]
    .filter(
      (m) =>
        m.kind === 'compulsory' ||
        (m.kind === 'optional' &&
          (e.optionalSubjectIds ?? []).some((id: Types.ObjectId) => String(id) === String(m.subjectId))) ||
        (m.kind === 'fourth' && String(e.fourthSubjectId) === String(m.subjectId)),
    )
    .sort((a, b) => a.order - b.order);
};

export interface CalcRow {
  student: any;
  enrolment: any;
  grade: ReturnType<typeof gradeStudent>;
}

/** Grades every active student of the exam's classes. No writes. */
export const computeExam = async (exam: any, scale: Scale): Promise<CalcRow[]> => {
  const mappings = await ClassSubject.find({
    sessionId: exam.sessionId,
    classId: { $in: exam.classIds },
  }).lean();
  const subjectNames = new Map(
    (
      await Subject.find({ _id: { $in: mappings.map((m: any) => m.subjectId) } })
        .select('name')
        .lean()
    ).map((s: any) => [String(s._id), s.name]),
  );
  const enrolments = await Enrolment.find({
    sessionId: exam.sessionId,
    classId: { $in: exam.classIds },
    status: 'active',
  }).lean();
  const students = await Student.find({
    _id: { $in: enrolments.map((e: any) => e.studentId) },
    status: 'active',
  })
    .select('name studentId')
    .lean();
  const studentBy = new Map(students.map((s: any) => [String(s._id), s]));
  const marks = await Mark.find({ examId: exam._id }).lean();
  const marksBy = new Map<string, any>();
  for (const m of marks as any[]) marksBy.set(`${m.studentId}|${m.subjectId}`, m);

  const rows: CalcRow[] = [];
  for (const e of enrolments as any[]) {
    const student = studentBy.get(String(e.studentId));
    if (!student) continue;
    const inputs: SubjectInput[] = subjectsForEnrolment(e, mappings).map((m) => ({
      subjectId: String(m.subjectId),
      name: subjectNames.get(String(m.subjectId)) ?? 'Subject',
      kind: m.kind,
      fullMarks: m.fullMarks,
      components: componentsOf(m),
      marks: (marksBy.get(`${e.studentId}|${m.subjectId}`)?.components ?? []).map((c: any) => ({
        key: c.key,
        obtained: c.obtained,
        absent: c.absent,
      })),
    }));
    if (!inputs.length) continue;
    rows.push({ student, enrolment: e, grade: gradeStudent(inputs, scale) });
  }
  return rows;
};

/** Class and section positions. */
export const assignPositions = (rows: CalcRow[], tieBreak: Scale['rules']['meritTieBreak']) => {
  const toRank = (r: CalcRow) => ({
    id: String(r.student._id),
    roll: r.enrolment.roll,
    name: r.student.name,
    passed: r.grade.passed,
    gpa: r.grade.gpa,
    percent: r.grade.percent,
    totalMarks: r.grade.totalMarks,
  });
  const inClass = new Map<string, number>();
  const inSection = new Map<string, number>();
  const byClass = new Map<string, CalcRow[]>();
  const bySection = new Map<string, CalcRow[]>();
  for (const r of rows) {
    const c = String(r.enrolment.classId);
    byClass.set(c, [...(byClass.get(c) ?? []), r]);
    const s = `${c}|${r.enrolment.sectionId}`;
    bySection.set(s, [...(bySection.get(s) ?? []), r]);
  }
  for (const list of byClass.values())
    for (const p of rank(list.map(toRank), tieBreak)) inClass.set(p.id, p.position);
  for (const list of bySection.values())
    for (const p of rank(list.map(toRank), tieBreak)) inSection.set(p.id, p.position);
  return { inClass, inSection };
};

/** Computes and stores draft results. Idempotent: running it again overwrites the drafts. */
export const calculateExam = async (examId: string) => {
  const exam = await loadExam(examId);
  if (exam.status === 'draft')
    throw AppError.conflict('Open marks entry before calculating results', 'EXAM_STATE');
  if (exam.status === 'published')
    throw AppError.conflict('Results are published. Use a correction.', 'EXAM_PUBLISHED');
  const scale = await scaleOf(exam);
  const rows = await computeExam(exam, scale);
  const pos = assignPositions(rows, scale.rules.meritTieBreak);
  const now = new Date();

  await scopedBulkWrite(
    Result,
    rows.map((r) => ({
      updateOne: {
        filter: { examId: exam._id, studentId: r.student._id },
        upsert: true,
        update: {
          $set: {
            enrolmentId: r.enrolment._id,
            classId: r.enrolment.classId,
            sectionId: r.enrolment.sectionId,
            roll: r.enrolment.roll,
            subjects: r.grade.subjects.map((s) => ({
              subjectId: s.subjectId,
              name: s.name,
              kind: s.kind,
              total: s.total,
              fullMarks: s.fullMarks,
              letter: s.letter,
              point: s.point,
              passed: s.passed,
            })),
            totalMarks: r.grade.totalMarks,
            fullMarks: r.grade.fullMarks,
            percent: r.grade.percent,
            gpa: r.grade.gpa,
            letter: r.grade.letter,
            division: r.grade.division,
            passed: r.grade.passed,
            failedSubjectIds: r.grade.failedSubjectIds,
            positionInClass: pos.inClass.get(String(r.student._id)),
            positionInSection: pos.inSection.get(String(r.student._id)),
            status: 'draft',
            version: exam.resultVersion,
            calculatedAt: now,
          },
        },
      },
    })),
  );
  // students who left the roster since the last run must not keep a stale draft
  await Result.deleteMany({
    examId: exam._id,
    status: 'draft',
    studentId: { $nin: rows.map((r) => r.student._id) },
  });
  return {
    calculated: rows.length,
    passed: rows.filter((r) => r.grade.passed).length,
    failed: rows.filter((r) => !r.grade.passed).length,
  };
};
