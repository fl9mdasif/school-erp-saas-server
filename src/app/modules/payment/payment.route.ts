import { Router } from 'express';
import { AppError } from '../../errors/AppError';
import { catchAsync } from '../../lib/catchAsync';
import { idParams } from '../../lib/objectId';
import { buildMeta } from '../../lib/pagination';
import { requireAuth } from '../../lib/requireAuth';
import { created, ok } from '../../lib/sendResponse';
import { authenticate, roleGuard } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import * as svc from './payment.service';
import * as v from './payment.validation';

const router = Router();
router.use(authenticate());
const staff = roleGuard('admin', 'accountant');

router.post(
  '/',
  staff,
  validateRequest({ body: v.createPaymentBody }),
  catchAsync(async (req, res) => {
    const key = req.header('idempotency-key');
    if (!key || key.length < 8 || key.length > 100)
      throw AppError.badRequest(
        'Idempotency-Key header (8 to 100 characters) is required',
        undefined,
        'IDEMPOTENCY_KEY_REQUIRED',
      );
    const { payment, replayed } = await svc.createPayment(requireAuth(req), req.body, key);
    if (replayed) ok(res, { ...payment, replayed: true });
    else created(res, payment);
  }),
);

router.get(
  '/',
  staff,
  validateRequest({ query: v.listPaymentsQuery }),
  catchAsync(async (req, res) => {
    const { page, limit, ...f } = req.query as any;
    const { rows, total } = await svc.listPayments({ page, limit }, f);
    ok(res, rows, buildMeta({ page, limit }, total));
  }),
);

router.get(
  '/:id',
  roleGuard('admin', 'accountant', 'student', 'guardian'),
  validateRequest({ params: idParams }),
  catchAsync(async (req, res) => ok(res, await svc.getPayment(requireAuth(req), req.params.id as string))),
);

router.post(
  '/:id/reverse',
  roleGuard('admin'),
  validateRequest({ params: idParams, body: v.reverseBody }),
  catchAsync(async (req, res) =>
    ok(res, await svc.reversePayment(requireAuth(req), req.params.id as string, req.body.reason)),
  ),
);

export const paymentRoutes = router;
