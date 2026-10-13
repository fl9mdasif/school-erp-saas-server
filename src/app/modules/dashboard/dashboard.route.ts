import { Router } from 'express';
import { catchAsync } from '../../lib/catchAsync';
import { requireAuth } from '../../lib/requireAuth';
import { ok } from '../../lib/sendResponse';
import { authenticate } from '../../middlewares/auth';
import { summaryFor } from './dashboard.service';

const router = Router();
router.use(authenticate());
router.get(
  '/summary',
  catchAsync(async (req, res) => ok(res, await summaryFor(requireAuth(req)))),
);

export const dashboardRoutes = router;
