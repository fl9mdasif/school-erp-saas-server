import { Router } from 'express';
import { Types } from 'mongoose';
import { catchAsync } from '../../lib/catchAsync';
import { todayLocal } from '../../lib/localDate';
import { requireAuth } from '../../lib/requireAuth';
import { ok } from '../../lib/sendResponse';
import { authenticate, roleGuard } from '../../middlewares/auth';
import { ClassModel } from '../class/class.model';
import { Enrolment } from '../enrolment/enrolment.model';
import { currentSession } from '../enrolment/enrolment.service';
import { Section } from '../section/section.model';
import { scopeFor } from '../student/student.access';
import { AttendanceSheet } from './attendance.model';

/**
 * Every place attendance can be taken today: named sections, plus a class's hidden default
 * section once students sit in it. Teachers only see what they are assigned to. This is what the
 * "take attendance" picker needs, because the sections list never returns the hidden defaults.
 */
const takeableSections = async (auth: { userId: Types.ObjectId; role: string }) => {
  const scope = await scopeFor(auth as any);
  const sess = await currentSession().catch(() => null);
  if (!sess) return [];

  const classes = await ClassModel.find({ isActive: { $ne: false } })
    .sort({ order: 1, name: 1 })
    .select('name order')
    .lean();
  const classIds = classes.map((c: any) => c._id);
  const sections = await Section.find({ classId: { $in: classIds } })
    .select('classId name isDefault')
    .lean();

  const counts = await Enrolment.aggregate([
    { $match: { sessionId: sess._id, classId: { $in: classIds }, status: 'active' } },
    { $group: { _id: '$sectionId', n: { $sum: 1 } } },
  ]);
  const size = new Map(counts.map((c: any) => [String(c._id), c.n as number]));

  const allowed = (s: any) =>
    scope.kind !== 'teacher' ||
    scope.pairs.some((p) => p.classId.equals(s.classId) && (!p.sectionId || p.sectionId.equals(s._id)));

  const visible = sections.filter((s: any) => allowed(s) && (!s.isDefault || (size.get(String(s._id)) ?? 0) > 0));
  const taken = await AttendanceSheet.find({ date: todayLocal(), sectionId: { $in: visible.map((s: any) => s._id) } })
    .select('sectionId')
    .lean();
  const takenIds = new Set(taken.map((t: any) => String(t.sectionId)));
  const className = new Map(classes.map((c: any) => [String(c._id), c.name]));
  const classOrder = new Map(classes.map((c: any, i: number) => [String(c._id), i]));

  return visible
    .map((s: any) => ({
      sectionId: s._id,
      classId: s.classId,
      className: className.get(String(s.classId)),
      name: s.isDefault ? undefined : s.name,
      students: size.get(String(s._id)) ?? 0,
      takenToday: takenIds.has(String(s._id)),
    }))
    .sort(
      (a, b) =>
        (classOrder.get(String(a.classId)) ?? 0) - (classOrder.get(String(b.classId)) ?? 0) ||
        String(a.name ?? '').localeCompare(String(b.name ?? '')),
    );
};

const router = Router();
router.use(authenticate(), roleGuard('admin', 'teacher'));
router.get(
  '/',
  catchAsync(async (req, res) => ok(res, await takeableSections(requireAuth(req)))),
);

export const attendanceSectionsRoutes = router;
