import { Router } from 'express';
import { catchAsync } from '../../lib/catchAsync';
import { ok } from '../../lib/sendResponse';
import { authenticate, roleGuard } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import * as svc from './publicSite.service';
import { updateSiteBody } from './publicSite.validation';

const router = Router();
router.use(authenticate(), roleGuard('admin'));

router.get(
  '/',
  catchAsync(async (_req, res) => ok(res, await svc.getOrCreateSite())),
);
router.patch(
  '/',
  validateRequest({ body: updateSiteBody }),
  catchAsync(async (req, res) => ok(res, await svc.updateSite(req.body))),
);
router.post(
  '/publish',
  catchAsync(async (_req, res) => ok(res, await svc.setPublished(true))),
);
router.post(
  '/unpublish',
  catchAsync(async (_req, res) => ok(res, await svc.setPublished(false))),
);

export const siteRoutes = router;
