import { Router } from 'express';
import { catchAsync } from '../../lib/catchAsync';
import { idParams } from '../../lib/objectId';
import { requireAuth } from '../../lib/requireAuth';
import { created, ok } from '../../lib/sendResponse';
import { authenticate, roleGuard } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import * as svc from './attendance.service';
import * as v from './attendance.validation';
import { ROLE } from '../../lib/roles';

const router = Router();
router.use(authenticate());

const staff = roleGuard(ROLE.ADMIN, ROLE.TEACHER);

router.get(
  '/sheet',
  staff,
  validateRequest({ query: v.sheetQuery }),
  catchAsync(async (req, res) => {
    const q = req.query as any;
    ok(res, await svc.getSheet(requireAuth(req), q.sectionId, q.date));
  }),
);

router.post(
  '/',
  staff,
  validateRequest({ body: v.submitBody }),
  catchAsync(async (req, res) => {
    const r = await svc.submitSheet(requireAuth(req), req.body);
    if (r.existing) ok(res, { existing: true, sheet: r.sheet });
    else created(res, { existing: false, sheet: r.sheet });
  }),
);

router.patch(
  '/:id',
  staff,
  validateRequest({ params: idParams, body: v.editBody }),
  catchAsync(async (req, res) => {
    ok(res, await svc.editSheet(requireAuth(req), req.params.id as string, req.body.records));
  }),
);

router.get(
  '/report/section',
  roleGuard(ROLE.ADMIN, ROLE.TEACHER, ROLE.ACCOUNTANT),
  validateRequest({ query: v.sectionReportQuery }),
  catchAsync(async (req, res) => {
    const q = req.query as any;
    ok(res, await svc.sectionReport(requireAuth(req), q.sectionId, q.from, q.to));
  }),
);

router.get(
  '/report/student/:studentId',
  roleGuard(ROLE.ADMIN, ROLE.TEACHER, ROLE.ACCOUNTANT, ROLE.STUDENT, ROLE.GUARDIAN),
  validateRequest({ params: v.studentParams, query: v.studentReportQuery }),
  catchAsync(async (req, res) => {
    const q = req.query as any;
    ok(res, await svc.studentReport(requireAuth(req), req.params.studentId as string, q.from, q.to));
  }),
);

export const attendanceRoutes = router;
