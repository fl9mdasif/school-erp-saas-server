import { Router } from 'express';
import { catchAsync } from '../../lib/catchAsync';
import { ok } from '../../lib/sendResponse';
import { authenticate, roleGuard } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import * as svc from './school.service';
import * as v from './school.validation';
import { ROLE } from '../../lib/roles';

const router = Router();
router.use(authenticate());

router.get(
  '/profile',
  roleGuard(ROLE.ADMIN, ROLE.ACCOUNTANT),
  catchAsync(async (_req, res) => ok(res, await svc.getProfile())),
);
router.patch(
  '/profile',
  roleGuard(ROLE.ADMIN),
  validateRequest({ body: v.updateProfileBody }),
  catchAsync(async (req, res) => ok(res, await svc.updateProfile(req.body))),
);
router.patch(
  '/settings',
  roleGuard(ROLE.ADMIN),
  validateRequest({ body: v.updateSettingsBody }),
  catchAsync(async (req, res) => ok(res, await svc.updateSettings(req.body))),
);
router.get(
  '/usage',
  roleGuard(ROLE.ADMIN),
  catchAsync(async (_req, res) => ok(res, await svc.getUsage())),
);

export const schoolRoutes = router;
