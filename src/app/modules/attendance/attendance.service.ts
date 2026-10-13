import { Types } from 'mongoose';
import { AppError } from '../../errors/AppError';
import { dayOfWeek, isFuture } from '../../lib/localDate';
import { requireTenantId } from '../../lib/tenantContext';
import { writeAudit } from '../auditLog/auditLog.model';
import { Enrolment } from '../enrolment/enrolment.model';
import { currentSession } from '../enrolment/enrolment.service';
import { Section } from '../section/section.model';
import { linkedStudentIds, scopeFor, teacherPairs } from '../student/student.access';
import { Student } from '../student/student.model';
import { Tenant } from '../tenant/tenant.model';
import { AttendanceSheet } from './attendance.model';

interface Auth {
  userId: Types.ObjectId;
  role: string;
}
type Rec = { studentId: string; status: 'present' | 'absent' | 'late' | 'leave'; note?: string };

const loadSection = async (sectionId: string) => {
  const s = await Section.findById(sectionId);
  if (!s) throw AppError.notFound('Section not found');
  return s;
};

/** Admin always; a teacher only for classes or sections they are assigned to. */
const assertSectionAccess = async (auth: Auth, section: { _id: Types.ObjectId; classId: Types.ObjectId }) => {
  if (auth.role === 'admin' || auth.role === 'accountant') return;
  const pairs = await teacherPairs(auth.userId);
  const ok = pairs.some(
    (p) => p.classId.equals(section.classId) && (!p.sectionId || p.sectionId.equals(section._id)),
  );
  if (!ok) throw AppError.forbidden('You are not assigned to this class');
};

const roster = async (sectionId: Types.ObjectId, sessionId: Types.ObjectId) => {
  const enrolments = await Enrolment.find({ sessionId, sectionId, status: 'active' })
    .sort({ roll: 1 })
    .lean();
  const students = await Student.find({ _id: { $in: enrolments.map((e) => e.studentId) }, status: 'active' })
    .select('name studentId')
    .lean();
  const byId = new Map(students.map((s) => [String(s._id), s]));
  return enrolments
    .filter((e) => byId.has(String(e.studentId)))
    .map((e) => ({ enrolment: e, student: byId.get(String(e.studentId))! }));
};

export const getSheet = async (auth: Auth, sectionId: string, date: string) => {
  const section = await loadSection(sectionId);
  await assertSectionAccess(auth, section);
  const existing = await AttendanceSheet.findOne({ sectionId: section._id, date }).lean();
  const sess = await currentSession();
  const people = await roster(section._id, sess._id);
  const status = new Map((existing?.records ?? []).map((r) => [String(r.studentId), r]));
  return {
    exists: !!existing,
    sheetId: existing?._id,
    date,
    sectionId: section._id,
    takenAt: existing?.takenAt,
    records: people.map((p) => ({
      studentId: p.student._id,
      name: p.student.name,
      studentCode: p.student.studentId,
      roll: p.enrolment.roll,
      status: status.get(String(p.student._id))?.status ?? 'present',
      note: status.get(String(p.student._id))?.note,
    })),
  };
};

export const submitSheet = async (
  auth: Auth,
  input: { sectionId: string; date: string; records: Rec[]; allowWeekend: boolean },
) => {
  const section = await loadSection(input.sectionId);
  await assertSectionAccess(auth, section);
  if (isFuture(input.date))
    throw AppError.badRequest('Attendance cannot be taken for a future date', undefined, 'FUTURE_DATE');

  const tenant = await Tenant.findById(requireTenantId()).select('settings.weekendDays').lean();
  const weekend = tenant?.settings.weekendDays ?? [5];
  if (weekend.includes(dayOfWeek(input.date)) && !input.allowWeekend) {
    throw AppError.badRequest(
      'This date is a weekend day. Set allowWeekend to record it anyway.',
      undefined,
      'WEEKEND_DATE',
    );
  }

  const existing = await AttendanceSheet.findOne({ sectionId: section._id, date: input.date });
  if (existing) return { existing: true, sheet: existing };

  const sess = await currentSession();
  const people = await roster(section._id, sess._id);
  const allowed = new Set(people.map((p) => String(p.student._id)));
  const overrides = new Map<string, Rec>();
  for (const r of input.records) {
    if (!allowed.has(r.studentId))
      throw AppError.badRequest('A student in the list is not in this section', undefined, 'NOT_IN_SECTION');
    overrides.set(r.studentId, r);
  }
  const records = people.map((p) => {
    const o = overrides.get(String(p.student._id));
    return {
      studentId: p.student._id,
      enrolmentId: p.enrolment._id,
      status: o?.status ?? 'present',
      note: o?.note,
    };
  });

  try {
    const sheet = await AttendanceSheet.create({
      sessionId: sess._id,
      classId: section.classId,
      sectionId: section._id,
      date: input.date,
      records,
      takenBy: auth.userId,
      takenAt: new Date(),
    });
    return { existing: false, sheet };
  } catch (err: any) {
    if (err?.code === 11000)
      return {
        existing: true,
        sheet: await AttendanceSheet.findOne({ sectionId: section._id, date: input.date }),
      };
    throw err;
  }
};

export const editSheet = async (auth: Auth, id: string, records: Rec[]) => {
  const sheet = await AttendanceSheet.findById(id);
  if (!sheet) throw AppError.notFound('Attendance sheet not found');
  const section = await loadSection(String(sheet.sectionId));
  await assertSectionAccess(auth, section);

  const tenant = await Tenant.findById(requireTenantId()).select('settings.attendanceEditWindowHours').lean();
  const windowMs = (tenant?.settings.attendanceEditWindowHours ?? 24) * 3_600_000;
  const outside = Date.now() - sheet.takenAt.getTime() > windowMs;
  if (outside && auth.role !== 'admin') {
    throw AppError.forbidden(
      'The edit window for this sheet has closed. Ask an admin to correct it.',
      'EDIT_WINDOW_CLOSED',
    );
  }

  const before = sheet.records.map((r) => ({ studentId: r.studentId, status: r.status }));
  const map = new Map(records.map((r) => [r.studentId, r]));
  for (const r of records)
    if (!sheet.records.some((x) => String(x.studentId) === r.studentId))
      throw AppError.badRequest('A student in the list is not on this sheet', undefined, 'NOT_IN_SECTION');
  sheet.records.forEach((r) => {
    const o = map.get(String(r.studentId));
    if (o) {
      r.status = o.status;
      r.note = o.note;
    }
  });
  sheet.lastEditedBy = auth.userId;
  sheet.lastEditedAt = new Date();
  await sheet.save();
  if (outside) {
    await writeAudit({
      action: 'attendance.edit_after_window',
      entityType: 'AttendanceSheet',
      entityId: sheet._id,
      before,
      after: records,
      reason: 'admin edit after window',
    });
  }
  return sheet;
};

const percent = (present: number, late: number, absent: number) => {
  const denom = present + late + absent; // leave is excluded from the denominator, late counts as present
  return denom === 0 ? null : Math.round(((present + late) / denom) * 10000) / 100;
};

export const sectionReport = async (auth: Auth, sectionId: string, from: string, to: string) => {
  const section = await loadSection(sectionId);
  await assertSectionAccess(auth, section);
  if (to < from) throw AppError.badRequest('to must not be before from');
  const sheets = await AttendanceSheet.find({ sectionId: section._id, date: { $gte: from, $lte: to } })
    .sort({ date: 1 })
    .lean();
  const stats = new Map<
    string,
    { present: number; absent: number; late: number; leave: number; byDate: Record<string, string> }
  >();
  for (const sh of sheets) {
    for (const r of sh.records) {
      const k = String(r.studentId);
      const s = stats.get(k) ?? { present: 0, absent: 0, late: 0, leave: 0, byDate: {} };
      s[r.status] += 1;
      s.byDate[sh.date] = r.status;
      stats.set(k, s);
    }
  }
  const students = await Student.find({ _id: { $in: [...stats.keys()] } })
    .select('name studentId')
    .lean();
  const names = new Map(students.map((s) => [String(s._id), s]));
  return {
    sectionId: section._id,
    from,
    to,
    days: sheets.map((s) => s.date),
    rows: [...stats.entries()].map(([id, s]) => ({
      studentId: id,
      name: names.get(id)?.name,
      studentCode: names.get(id)?.studentId,
      present: s.present,
      absent: s.absent,
      late: s.late,
      leave: s.leave,
      percent: percent(s.present, s.late, s.absent),
      byDate: s.byDate,
    })),
  };
};

export const studentReport = async (auth: Auth, studentId: string, from: string, to: string) => {
  const student = await Student.findById(studentId);
  if (!student) throw AppError.notFound('Student not found');
  const scope = await scopeFor(auth);
  if (scope.kind === 'own' && !(await linkedStudentIds(auth)).some((id) => id.equals(student._id)))
    throw AppError.notFound('Student not found');
  if (scope.kind === 'teacher') {
    const enrol = student.currentEnrolmentId
      ? await Enrolment.findById(student.currentEnrolmentId).lean()
      : null;
    const ok =
      !!enrol &&
      scope.pairs.some(
        (p) =>
          p.classId.equals(enrol.classId) &&
          (!p.sectionId || p.sectionId.equals(enrol.sectionId as Types.ObjectId)),
      );
    if (!ok) throw AppError.notFound('Student not found');
  }
  const sheets = await AttendanceSheet.find({
    'records.studentId': student._id,
    date: { $gte: from, $lte: to },
  })
    .sort({ date: 1 })
    .lean();
  const months: Record<string, { present: number; absent: number; late: number; leave: number }> = {};
  const days: { date: string; status: string }[] = [];
  for (const sh of sheets) {
    const r = sh.records.find((x) => String(x.studentId) === String(student._id));
    if (!r) continue;
    const m = (months[sh.date.slice(0, 7)] ??= { present: 0, absent: 0, late: 0, leave: 0 });
    m[r.status] += 1;
    days.push({ date: sh.date, status: r.status });
  }
  const totals = Object.values(months).reduce(
    (a, m) => ({
      present: a.present + m.present,
      absent: a.absent + m.absent,
      late: a.late + m.late,
      leave: a.leave + m.leave,
    }),
    { present: 0, absent: 0, late: 0, leave: 0 },
  );
  return {
    studentId: student._id,
    name: student.name,
    from,
    to,
    totals: { ...totals, percent: percent(totals.present, totals.late, totals.absent) },
    months: Object.entries(months).map(([month, m]) => ({
      month,
      ...m,
      percent: percent(m.present, m.late, m.absent),
    })),
    days,
  };
};
