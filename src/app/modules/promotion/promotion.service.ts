import { Types } from 'mongoose';
import { AppError } from '../../errors/AppError';
import { withTransaction } from '../../lib/transaction';
import { writeAudit } from '../auditLog/auditLog.model';
import { AcademicSession } from '../academicSession/academicSession.model';
import { Enrolment } from '../enrolment/enrolment.model';
import { nextRoll, resolveSection } from '../enrolment/enrolment.service';
import { Student } from '../student/student.model';

interface PromoteInput {
  fromSessionId: string;
  toSessionId: string;
  fromClassId: string;
  toClassId?: string;
  toSectionId?: string;
  studentIds?: string[];
  repeatStudentIds: string[];
  rollMode: 'previous_roll' | 'name';
  passOut: boolean;
}

interface Plan {
  promote: { enrolment: any; student: any; roll: number }[];
  repeat: { enrolment: any; student: any; roll: number }[];
  passOut: { enrolment: any; student: any }[];
  conflicts: { studentId: string; reason: string }[];
  targetClassId?: Types.ObjectId;
  targetSectionId?: Types.ObjectId;
}

/** Builds the full plan without writing. Dry run returns it; commit applies exactly the same plan. */
const buildPlan = async (input: PromoteInput): Promise<Plan> => {
  const [from, to] = await Promise.all([
    AcademicSession.findById(input.fromSessionId),
    AcademicSession.findById(input.toSessionId),
  ]);
  if (!from || !to) throw AppError.badRequest('Session not found');

  const filter: Record<string, any> = { sessionId: from._id, classId: input.fromClassId, status: 'active' };
  if (input.studentIds?.length) filter.studentId = { $in: input.studentIds };
  const enrolments = await Enrolment.find(filter).lean();
  const students = await Student.find({ _id: { $in: enrolments.map((e) => e.studentId) }, status: 'active' })
    .select('name studentId')
    .lean();
  const byId = new Map(students.map((s) => [String(s._id), s]));

  const already = new Set(
    (
      await Enrolment.find({ sessionId: to._id, studentId: { $in: enrolments.map((e) => e.studentId) } })
        .select('studentId')
        .lean()
    ).map((e) => String(e.studentId)),
  );
  const repeatSet = new Set(input.repeatStudentIds);

  const plan: Plan = { promote: [], repeat: [], passOut: [], conflicts: [] };
  const eligible = enrolments.filter((e) => {
    const s = byId.get(String(e.studentId));
    if (!s) return false;
    if (already.has(String(e.studentId))) {
      plan.conflicts.push({ studentId: s.studentId, reason: 'Already enrolled in the target session' });
      return false;
    }
    return true;
  });

  if (input.passOut) {
    plan.passOut = eligible.map((e) => ({ enrolment: e, student: byId.get(String(e.studentId)) }));
    return plan;
  }

  const { section } = await resolveSection(input.toClassId!, input.toSectionId);
  plan.targetClassId = section.classId;
  plan.targetSectionId = section._id;

  const order = (list: typeof eligible) =>
    [...list].sort((a, b) =>
      input.rollMode === 'name'
        ? String(byId.get(String(a.studentId))!.name).localeCompare(
            String(byId.get(String(b.studentId))!.name),
          )
        : a.roll - b.roll,
    );

  let roll = await nextRoll(to._id, section.classId, section._id);
  for (const e of order(eligible.filter((x) => !repeatSet.has(String(x.studentId)))))
    plan.promote.push({ enrolment: e, student: byId.get(String(e.studentId)), roll: roll++ });

  // Repeaters stay in the same class and section, keeping their roll if it is free in the target session.
  const taken = new Set(
    (
      await Enrolment.find({ sessionId: to._id, classId: input.fromClassId }).select('sectionId roll').lean()
    ).map((r) => `${r.sectionId}|${r.roll}`),
  );
  for (const e of eligible.filter((x) => repeatSet.has(String(x.studentId)))) {
    let r = e.roll;
    while (taken.has(`${e.sectionId}|${r}`)) r += 1;
    taken.add(`${e.sectionId}|${r}`);
    plan.repeat.push({ enrolment: e, student: byId.get(String(e.studentId)), roll: r });
  }
  return plan;
};

const summary = (p: Plan) => ({
  promote: p.promote.length,
  repeat: p.repeat.length,
  passOut: p.passOut.length,
  conflicts: p.conflicts,
  preview: [
    ...p.promote
      .slice(0, 20)
      .map((x) => ({
        studentId: x.student.studentId,
        name: x.student.name,
        action: 'promote',
        roll: x.roll,
      })),
    ...p.repeat
      .slice(0, 20)
      .map((x) => ({ studentId: x.student.studentId, name: x.student.name, action: 'repeat', roll: x.roll })),
  ],
});

export const previewPromotion = async (input: PromoteInput) => ({
  dryRun: true,
  ...summary(await buildPlan(input)),
});

export const commitPromotion = async (input: PromoteInput) => {
  const plan = await buildPlan(input);
  await withTransaction(async (session) => {
    const mk = async (
      item: { enrolment: any; student: any; roll: number },
      classId: Types.ObjectId,
      sectionId: Types.ObjectId,
    ) => {
      const [created] = await Enrolment.create(
        [
          {
            studentId: item.enrolment.studentId,
            sessionId: input.toSessionId,
            classId,
            sectionId,
            roll: item.roll,
            group: item.enrolment.group ?? null,
            status: 'active',
            promotedFromEnrolmentId: item.enrolment._id,
          },
        ],
        { session },
      );
      await Student.updateOne(
        { _id: item.enrolment.studentId },
        { $set: { currentEnrolmentId: created._id } },
        { session },
      );
    };
    for (const p of plan.promote) {
      await mk(p, plan.targetClassId!, plan.targetSectionId!);
      await Enrolment.updateOne({ _id: p.enrolment._id }, { $set: { status: 'promoted' } }, { session });
    }
    for (const r of plan.repeat) {
      await mk(r, r.enrolment.classId, r.enrolment.sectionId);
      await Enrolment.updateOne({ _id: r.enrolment._id }, { $set: { status: 'repeated' } }, { session });
    }
    for (const g of plan.passOut) {
      await Enrolment.updateOne({ _id: g.enrolment._id }, { $set: { status: 'promoted' } }, { session });
      await Student.updateOne(
        { _id: g.enrolment.studentId },
        { $set: { status: 'passed_out' } },
        { session },
      );
    }
  });
  const result = summary(plan);
  await writeAudit({
    action: 'student.promote',
    entityType: 'Enrolment',
    after: { promote: result.promote, repeat: result.repeat, passOut: result.passOut },
  });
  return { dryRun: false, ...result };
};
