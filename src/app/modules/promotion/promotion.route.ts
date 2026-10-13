import { Router } from 'express';
import { catchAsync } from '../../lib/catchAsync';
import { ok } from '../../lib/sendResponse';
import { authenticate, roleGuard } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { commitPromotion, previewPromotion } from './promotion.service';
import { promoteBody, promoteQuery } from './promotion.validation';
import { ROLE } from '../../lib/roles';

const router = Router();
router.use(authenticate(), roleGuard(ROLE.ADMIN));

router.post(
  '/',
  validateRequest({ body: promoteBody, query: promoteQuery }),
  catchAsync(async (req, res) => {
    const dry = (req.query as any).dryRun === 'true';
    ok(res, dry ? await previewPromotion(req.body) : await commitPromotion(req.body));
  }),
);

export const promotionRoutes = router;
