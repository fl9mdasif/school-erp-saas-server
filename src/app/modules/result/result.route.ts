import { Router } from 'express';
import { catchAsync } from '../../lib/catchAsync';
import { requireAuth } from '../../lib/requireAuth';
import { ok } from '../../lib/sendResponse';
import { authenticate, roleGuard } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { examParams } from '../exam/exam.validation';
import { calculateExam } from './result.calc';
import { correctResult, publishExam } from './result.publish';
import * as svc from './result.service';
import * as v from './result.validation';
import { ROLE } from '../../lib/roles';

const router = Router();
router.use(authenticate());
const admin = roleGuard(ROLE.ADMIN);
const staff = roleGuard(ROLE.ADMIN, ROLE.TEACHER);
const id = (req: any) => req.params.id as string;

router.post(
  '/:id/calculate',
  admin,
  validateRequest({ params: examParams }),
  catchAsync(async (req, res) => ok(res, await calculateExam(id(req)))),
);
router.get(
  '/:id/results',
  staff,
  validateRequest({ params: examParams, query: v.resultsQuery }),
  catchAsync(async (req, res) => ok(res, await svc.listResults(requireAuth(req), id(req), req.query as any))),
);
router.post(
  '/:id/publish',
  admin,
  validateRequest({ params: examParams, body: v.publishBody }),
  catchAsync(async (req, res) => ok(res, await publishExam(requireAuth(req), id(req), req.body))),
);
router.post(
  '/:id/results/:studentId/correct',
  admin,
  validateRequest({ params: v.examStudentParams, body: v.correctBody }),
  catchAsync(async (req, res) =>
    ok(res, await correctResult(requireAuth(req), id(req), req.params.studentId as string, req.body)),
  ),
);

router.get(
  '/:id/merit-list',
  staff,
  validateRequest({ params: examParams, query: v.meritQuery }),
  catchAsync(async (req, res) => {
    const q = req.query as any;
    const r: any = await svc.meritList(requireAuth(req), id(req), q.classId, q.format === 'csv');
    if (q.format === 'csv') {
      res.setHeader('content-type', 'text/csv; charset=utf-8');
      res.setHeader('content-disposition', `attachment; filename="${r.filename}"`);
      return void res.send(r.csv);
    }
    ok(res, r.list);
  }),
);

export const resultRoutes = router;

/** Student and guardian views of published results. */
const me = Router();
me.use(authenticate(), roleGuard(ROLE.STUDENT, ROLE.GUARDIAN));
me.get(
  '/results',
  catchAsync(async (req, res) => ok(res, await svc.myResults(requireAuth(req)))),
);
export const meResultRoutes = me;

/** GET /students/:id/results for the admin's student profile. */
const ofStudent = Router();
ofStudent.use(authenticate(), roleGuard(ROLE.ADMIN));
ofStudent.get(
  '/:id/results',
  validateRequest({ params: examParams }),
  catchAsync(async (req, res) => ok(res, await svc.resultsOfStudent(req.params.id as string))),
);
export const studentResultRoutes = ofStudent;
