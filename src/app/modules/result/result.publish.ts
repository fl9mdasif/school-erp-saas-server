import { Types } from 'mongoose';
import { AppError } from '../../errors/AppError';
import { scopedBulkWrite } from '../../lib/scopedBulk';
import { withTransaction } from '../../lib/transaction';
import { writeAudit } from '../auditLog/auditLog.model';
import { Exam } from '../exam/exam.model';
import { loadExam } from '../exam/exam.service';
import { Mark } from '../marks/mark.model';
import { componentsOf, examProgress, findClassSubject, scaleOf, subjectRoster } from '../marks/marks.service';
import { ClassSubject } from '../classSubject/classSubject.model';
import { assignPositions, computeExam, calculateExam } from './result.calc';
import { Result } from './result.model';
import { gradeSubject } from './result.engine';
import { Subject } from '../subject/subject.model';

interface Auth {
  userId: Types.ObjectId;
  role: string;
}

/** Marks that were never entered become explicit absent marks, so nothing is silently missing. */
const fillMissingAsAbsent = async (exam: any, auth: Auth) => {
  const scale = await scaleOf(exam);
  const mappings = await ClassSubject.find({
    sessionId: exam.sessionId,
    classId: { $in: exam.classIds },
  }).lean();
  let filled = 0;
  for (const cs of mappings as any[]) {
    const scope = {
      classId: String(cs.classId),
      sectionId: cs.sectionId ? String(cs.sectionId) : undefined,
      subjectId: String(cs.subjectId),
    };
    const roster = await subjectRoster(exam, scope, cs);
    const existing = new Set(
      (
        await Mark.find({
          examId: exam._id,
          subjectId: cs.subjectId,
          studentId: { $in: roster.map((r) => r.student._id) },
        })
          .select('studentId')
          .lean()
      ).map((m: any) => String(m.studentId)),
    );
    const defs = componentsOf(cs);
    const name = ((await Subject.findById(cs.subjectId).select('name').lean()) as any)?.name ?? '';
    for (const r of roster) {
      if (existing.has(String(r.student._id))) continue;
      const comps = defs.map((d) => ({ key: d.key, obtained: null, absent: true }));
      const g = gradeSubject(
        {
          subjectId: scope.subjectId,
          name,
          kind: cs.kind,
          fullMarks: cs.fullMarks,
          components: defs,
          marks: comps,
        },
        scale,
      );
      await Mark.create({
        examId: exam._id,
        studentId: r.student._id,
        enrolmentId: r.enrolment._id,
        classId: r.enrolment.classId,
        sectionId: r.enrolment.sectionId,
        subjectId: cs.subjectId,
        components: comps,
        total: g.total,
        percent: g.percent,
        letter: g.letter,
        point: g.point,
        status: 'submitted',
        enteredBy: auth.userId,
        submittedAt: new Date(),
      });
      filled += 1;
    }
  }
  return filled;
};

/**
 * Publish: requires every subject-section submitted (or forceMissingAsAbsent), recalculates,
 * then locks marks and results one class at a time. Each class is one transaction and the whole thing is safe to retry.
 */
export const publishExam = async (auth: Auth, examId: string, opts: { forceMissingAsAbsent: boolean }) => {
  const exam = await loadExam(examId);
  if (exam.status === 'published') return { alreadyPublished: true, publishedAt: exam.publishedAt };
  if (exam.status !== 'marks_closed')
    throw AppError.conflict('Close marks entry before publishing', 'EXAM_STATE');

  const progress = await examProgress(examId);
  if (!progress.complete && !opts.forceMissingAsAbsent) {
    throw AppError.conflict(
      'Some marks are not submitted. Finish entry or publish with forceMissingAsAbsent.',
      'MARKS_INCOMPLETE',
      progress.rows.filter((r) => !r.complete && r.students > 0),
    );
  }
  let filled = 0;
  if (!progress.complete) filled = await fillMissingAsAbsent(exam, auth);
  // any leftover draft marks are submitted by the force flag
  if (opts.forceMissingAsAbsent)
    await Mark.updateMany(
      { examId: exam._id, status: 'draft' },
      { $set: { status: 'submitted', submittedAt: new Date() } },
    );

  // move to marks_closed → calculate on a non-published exam
  await calculateExam(examId);
  const now = new Date();
  for (const classId of exam.classIds) {
    await withTransaction(async (session) => {
      await Mark.updateMany(
        { examId: exam._id, classId, status: { $ne: 'locked' } },
        { $set: { status: 'locked' } },
        { session },
      );
      await Result.updateMany(
        { examId: exam._id, classId },
        { $set: { status: 'published', publishedAt: now } },
        { session },
      );
    });
  }
  exam.status = 'published';
  exam.publishedAt = now;
  exam.publishedBy = auth.userId;
  await exam.save();
  const count = await Result.countDocuments({ examId: exam._id });
  await writeAudit({
    action: 'exam.publish',
    entityType: 'Exam',
    entityId: exam._id,
    after: { results: count, filledAbsent: filled },
  });
  return { alreadyPublished: false, publishedAt: now, results: count, filledAbsent: filled };
};

export interface CorrectionInput {
  reason: string;
  changes: { subjectId: string; components: { key: string; obtained: number | null; absent: boolean }[] }[];
}

/** Post-publish correction: the only way a locked mark changes. Recomputes the student, re-ranks the class, audits before and after. */
export const correctResult = async (
  auth: Auth,
  examId: string,
  studentId: string,
  input: CorrectionInput,
) => {
  const exam = await loadExam(examId);
  if (exam.status !== 'published')
    throw AppError.conflict(
      'Only a published exam needs a correction. Edit the marks directly before publishing.',
      'EXAM_STATE',
    );
  const before = await Result.findOne({ examId: exam._id, studentId }).lean();
  if (!before) throw AppError.notFound('Result not found');

  const scale = await scaleOf(exam);
  const beforeMarks = await Mark.find({
    examId: exam._id,
    studentId,
    subjectId: { $in: input.changes.map((c) => c.subjectId) },
  }).lean();

  for (const ch of input.changes) {
    const scope = {
      classId: String(before.classId),
      sectionId: before.sectionId ? String(before.sectionId) : undefined,
      subjectId: ch.subjectId,
    };
    const cs = await findClassSubject(exam, scope);
    const defs = componentsOf(cs);
    for (const c of ch.components) {
      const def = defs.find((d) => d.key === c.key);
      if (!def) throw AppError.badRequest(`Unknown component "${c.key}"`, undefined, 'MARKS_INVALID');
      if (!c.absent && c.obtained !== null && c.obtained > def.fullMarks)
        throw AppError.badRequest(
          `${c.key}: ${c.obtained} is above the full marks ${def.fullMarks}`,
          undefined,
          'MARKS_INVALID',
        );
    }
    const existing: any = beforeMarks.find((m: any) => String(m.subjectId) === ch.subjectId);
    if (!existing) throw AppError.notFound('No mark to correct for this subject');
    const comps = ch.components.map((c) => ({
      key: c.key,
      obtained: c.absent ? null : c.obtained,
      absent: c.absent,
    }));
    const name = ((await Subject.findById(ch.subjectId).select('name').lean()) as any)?.name ?? '';
    const g = gradeSubject(
      {
        subjectId: ch.subjectId,
        name,
        kind: cs.kind,
        fullMarks: cs.fullMarks,
        components: defs,
        marks: comps,
      },
      scale,
    );
    await Mark.updateOne(
      { _id: existing._id },
      { $set: { components: comps, total: g.total, percent: g.percent, letter: g.letter, point: g.point } },
    );
  }

  const newVersion = exam.resultVersion + 1;
  const rows = await computeExam(exam, scale);
  const pos = assignPositions(rows, scale.rules.meritTieBreak);
  const now = new Date();
  const classRows = rows.filter((r) => String(r.enrolment.classId) === String(before.classId));
  // only the class of the corrected student can change rank, but every result in it is rewritten to the new version
  await scopedBulkWrite(
    Result,
    classRows.map((r) => ({
      updateOne: {
        filter: { examId: exam._id, studentId: r.student._id },
        update: {
          $set: {
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
            version: newVersion,
            calculatedAt: now,
          },
        },
      },
    })),
  );
  await Exam.updateOne({ _id: exam._id }, { $set: { resultVersion: newVersion } });
  const after = await Result.findOne({ examId: exam._id, studentId }).lean();
  await writeAudit({
    action: 'result.correct',
    entityType: 'Result',
    entityId: (after as any)._id,
    reason: input.reason,
    before: {
      marks: beforeMarks.map((m: any) => ({
        subjectId: m.subjectId,
        components: m.components,
        total: m.total,
      })),
      gpa: before.gpa,
      percent: before.percent,
      passed: before.passed,
      positionInClass: before.positionInClass,
      version: before.version,
    },
    after: {
      changes: input.changes,
      gpa: (after as any).gpa,
      percent: (after as any).percent,
      passed: (after as any).passed,
      positionInClass: (after as any).positionInClass,
      version: newVersion,
    },
  });
  return after;
};
