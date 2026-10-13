import { Router } from 'express';
import { catchAsync } from '../../lib/catchAsync';
import { buildMeta } from '../../lib/pagination';
import { requireAuth } from '../../lib/requireAuth';
import { created, ok } from '../../lib/sendResponse';
import { authenticate, roleGuard } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import * as marks from '../marks/marks.service';
import * as svc from './exam.service';
import * as v from './exam.validation';
import { ROLE } from '../../lib/roles';

const router = Router();
router.use(authenticate());

const id = (req: any) => req.params.id as string;
const admin = roleGuard(ROLE.ADMIN);
const staff = roleGuard(ROLE.ADMIN, ROLE.TEACHER);

router.get(
  '/',
  validateRequest({ query: v.listExamsQuery }),
  catchAsync(async (req, res) => {
    const { page, limit, ...f } = req.query as any;
    const { rows, total } = await svc.listExams(requireAuth(req), { page, limit }, f);
    ok(res, rows, buildMeta({ page, limit }, total));
  }),
);
router.get(
  '/:id',
  validateRequest({ params: v.examParams }),
  catchAsync(async (req, res) => ok(res, await svc.getExam(requireAuth(req), id(req)))),
);

router.post(
  '/',
  admin,
  validateRequest({ body: v.createExamBody }),
  catchAsync(async (req, res) => created(res, await svc.createExam(req.body))),
);
router.patch(
  '/:id',
  admin,
  validateRequest({ params: v.examParams, body: v.updateExamBody }),
  catchAsync(async (req, res) => ok(res, await svc.updateExam(id(req), req.body))),
);
router.patch(
  '/:id/status',
  admin,
  validateRequest({ params: v.examParams, body: v.examStatusBody }),
  catchAsync(async (req, res) => ok(res, await svc.setExamStatus(id(req), req.body.status))),
);
router.delete(
  '/:id',
  admin,
  validateRequest({ params: v.examParams }),
  catchAsync(async (req, res) => {
    await svc.deleteExam(id(req), requireAuth(req).userId);
    ok(res, { deleted: true });
  }),
);

// Marks entry
router.get(
  '/:id/marks-sheet',
  staff,
  validateRequest({ params: v.examParams, query: v.marksSheetQuery }),
  catchAsync(async (req, res) =>
    ok(res, await marks.getMarksSheet(requireAuth(req), id(req), req.query as any)),
  ),
);
router.put(
  '/:id/marks',
  staff,
  validateRequest({ params: v.examParams, body: v.saveMarksBody }),
  catchAsync(async (req, res) => ok(res, await marks.saveMarks(requireAuth(req), id(req), req.body))),
);
router.post(
  '/:id/marks/submit',
  staff,
  validateRequest({ params: v.examParams, body: v.submitMarksBody }),
  catchAsync(async (req, res) => ok(res, await marks.submitMarks(requireAuth(req), id(req), req.body))),
);
router.post(
  '/:id/marks/unlock',
  admin,
  validateRequest({ params: v.examParams, body: v.submitMarksBody }),
  catchAsync(async (req, res) => ok(res, await marks.unlockMarks(id(req), req.body))),
);
router.get(
  '/:id/progress',
  admin,
  validateRequest({ params: v.examParams }),
  catchAsync(async (req, res) => ok(res, await marks.examProgress(id(req)))),
);

export const examRoutes = router;
