import { Types } from 'mongoose';
import { User } from '../user/user.model';
import { todayLocal } from '../../lib/localDate';
import { AttendanceSheet } from '../attendance/attendance.model';
import { Notice } from '../notice/notice.model';
import { Section } from '../section/section.model';
import { teacherPairs, linkedStudentIds } from '../student/student.access';
import { Student } from '../student/student.model';
import { Enrolment } from '../enrolment/enrolment.model';
import { Inquiry } from '../inquiry/inquiry.model';
import { currentSession } from '../enrolment/enrolment.service';

interface Auth {
  userId: Types.ObjectId;
  role: string;
}

/** Numbers that other phases (fees, exams) add to through this registry without editing this file. */
export const dashboardWidgets: Record<string, (auth: Auth) => Promise<Record<string, unknown>>> = {};

const attendanceToday = async (sectionFilter?: Record<string, unknown>) => {
  const sheets = await AttendanceSheet.find({ date: todayLocal(), ...(sectionFilter ?? {}) })
    .select('records.status')
    .lean();
  const t = { present: 0, absent: 0, late: 0, leave: 0, sheets: sheets.length };
  for (const s of sheets) for (const r of (s as any).records) (t as any)[r.status] += 1;
  return t;
};

const adminSummary = async () => {
  const [students, staff, newInquiries, notices] = await Promise.all([
    Student.countDocuments({ status: 'active' }),
    User.countDocuments({ role: { $in: ['admin', 'teacher', 'accountant'] }, status: 'active' }),
    Inquiry.countDocuments({ status: 'new' }),
    Notice.countDocuments({ status: 'published' }),
  ]);
  return { students, staff, newInquiries, notices, attendanceToday: await attendanceToday() };
};

const teacherSummary = async (auth: Auth) => {
  const pairs = await teacherPairs(auth.userId);
  const sess = await currentSession().catch(() => null);
  const found = pairs.length
    ? await Section.find({
        $or: pairs.map((p) => (p.sectionId ? { _id: p.sectionId } : { classId: p.classId })),
      })
        .select('classId name isDefault')
        .lean()
    : [];
  // The hidden default section only matters once it actually holds students.
  const used =
    sess && found.length
      ? new Set(
          (
            await Enrolment.find({
              sessionId: sess._id,
              sectionId: { $in: found.map((s) => s._id) },
              status: 'active',
            }).distinct('sectionId')
          ).map(String),
        )
      : new Set<string>();
  const sections = found.filter((s) => !s.isDefault || used.has(String(s._id)));
  const taken = await AttendanceSheet.find({
    date: todayLocal(),
    sectionId: { $in: sections.map((s) => s._id) },
  })
    .select('sectionId')
    .lean();
  const takenIds = new Set(taken.map((t) => String(t.sectionId)));
  const counts = sess
    ? await Enrolment.aggregate([
        { $match: { sessionId: sess._id, sectionId: { $in: sections.map((s) => s._id) }, status: 'active' } },
        { $group: { _id: '$sectionId', n: { $sum: 1 } } },
      ])
    : [];
  const size = new Map(counts.map((c) => [String(c._id), c.n]));
  return {
    myClasses: sections.map((s) => ({
      sectionId: s._id,
      classId: s.classId,
      name: s.isDefault ? undefined : s.name,
      students: size.get(String(s._id)) ?? 0,
      attendanceTakenToday: takenIds.has(String(s._id)),
    })),
    pendingAttendance: sections.filter((s) => !takenIds.has(String(s._id))).length,
  };
};

const ownSummary = async (auth: Auth) => {
  const ids = await linkedStudentIds(auth);
  const students = await Student.find({ _id: { $in: ids } })
    .select('name studentId currentEnrolmentId')
    .lean();
  const month = todayLocal().slice(0, 7);
  const sheets = await AttendanceSheet.find({
    'records.studentId': { $in: ids },
    date: { $regex: `^${month}` },
  })
    .select('records date')
    .lean();
  return {
    children: students.map((s) => {
      let present = 0,
        absent = 0,
        late = 0;
      for (const sh of sheets) {
        const r = (sh as any).records.find((x: any) => String(x.studentId) === String(s._id));
        if (r?.status === 'present') present++;
        else if (r?.status === 'absent') absent++;
        else if (r?.status === 'late') late++;
      }
      return { id: s._id, name: s.name, studentId: s.studentId, thisMonth: { present, absent, late } };
    }),
  };
};

export const summaryFor = async (auth: Auth) => {
  let base: Record<string, unknown>;
  if (auth.role === 'admin') base = await adminSummary();
  else if (auth.role === 'teacher') base = await teacherSummary(auth);
  else if (auth.role === 'student' || auth.role === 'guardian') base = await ownSummary(auth);
  else base = {};
  for (const widget of Object.values(dashboardWidgets)) Object.assign(base, await widget(auth));
  return { role: auth.role, date: todayLocal(), ...base };
};
