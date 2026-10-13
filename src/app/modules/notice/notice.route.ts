import { Router } from 'express';
import { catchAsync } from '../../lib/catchAsync';
import { idParams } from '../../lib/objectId';
import { buildMeta } from '../../lib/pagination';
import { requireAuth } from '../../lib/requireAuth';
import { created, ok } from '../../lib/sendResponse';
import { authenticate, roleGuard } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import * as svc from './notice.service';
import * as v from './notice.validation';

const router = Router();
router.use(authenticate());

router.get(
  '/',
  validateRequest({ query: v.listNoticesQuery }),
  catchAsync(async (req, res) => {
    const { page, limit, status } = req.query as any;
    const { rows, total } = await svc.listNotices(requireAuth(req), { page, limit }, status);
    ok(res, rows, buildMeta({ page, limit }, total));
  }),
);
router.get(
  '/:id',
  validateRequest({ params: idParams }),
  catchAsync(async (req, res) => ok(res, await svc.getNotice(requireAuth(req), req.params.id as string))),
);

const writers = roleGuard('admin', 'teacher');
router.post(
  '/',
  writers,
  validateRequest({ body: v.createNoticeBody }),
  catchAsync(async (req, res) => created(res, await svc.createNotice(requireAuth(req), req.body))),
);
router.patch(
  '/:id',
  writers,
  validateRequest({ params: idParams, body: v.updateNoticeBody }),
  catchAsync(async (req, res) =>
    ok(res, await svc.updateNotice(requireAuth(req), req.params.id as string, req.body)),
  ),
);
router.delete(
  '/:id',
  writers,
  validateRequest({ params: idParams }),
  catchAsync(async (req, res) => {
    await svc.deleteNotice(requireAuth(req), req.params.id as string);
    ok(res, { deleted: true });
  }),
);

export const noticeRoutes = router;
