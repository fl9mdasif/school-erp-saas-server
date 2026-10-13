import { Router } from 'express';
import { catchAsync } from '../../lib/catchAsync';
import { ok } from '../../lib/sendResponse';
import { authenticate, roleGuard } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import * as svc from './school.service';
import * as v from './school.validation';

const router = Router();
router.use(authenticate());

router.get(
  '/profile',
  roleGuard('admin', 'accountant'),
  catchAsync(async (_req, res) => ok(res, await svc.getProfile())),
);
router.patch(
  '/profile',
  roleGuard('admin'),
  validateRequest({ body: v.updateProfileBody }),
  catchAsync(async (req, res) => ok(res, await svc.updateProfile(req.body))),
);
router.patch(
  '/settings',
  roleGuard('admin'),
  validateRequest({ body: v.updateSettingsBody }),
  catchAsync(async (req, res) => ok(res, await svc.updateSettings(req.body))),
);
router.get(
  '/usage',
  roleGuard('admin'),
  catchAsync(async (_req, res) => ok(res, await svc.getUsage())),
);

export const schoolRoutes = router;
