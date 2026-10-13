import { Router } from 'express';
import { AppError } from '../../errors/AppError';
import { catchAsync } from '../../lib/catchAsync';
import { idParams } from '../../lib/objectId';
import { buildMeta } from '../../lib/pagination';
import { requireAuth } from '../../lib/requireAuth';
import { ok } from '../../lib/sendResponse';
import { authenticate, roleGuard } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { voidInvoice } from '../payment/payment.service';
import { generateInvoices, previewInvoices } from './invoice.generate';
import * as svc from './invoice.service';
import * as v from './invoice.validation';
import { ROLE } from '../../lib/roles';

const router = Router();
router.use(authenticate());

const staff = roleGuard(ROLE.ADMIN, ROLE.ACCOUNTANT);

router.post(
  '/generate',
  staff,
  validateRequest({ body: v.generateBody, query: v.generateQuery }),
  catchAsync(async (req, res) => {
    if ((req.query as any).dryRun === 'true') return void ok(res, await previewInvoices(req.body));
    const key = req.header('idempotency-key');
    if (!key || key.length < 8 || key.length > 100)
      throw AppError.badRequest(
        'Idempotency-Key header (8 to 100 characters) is required',
        undefined,
        'IDEMPOTENCY_KEY_REQUIRED',
      );
    ok(res, await generateInvoices(req.body, key));
  }),
);

router.get(
  '/',
  roleGuard(ROLE.ADMIN, ROLE.ACCOUNTANT, ROLE.STUDENT, ROLE.GUARDIAN),
  validateRequest({ query: v.listInvoicesQuery }),
  catchAsync(async (req, res) => {
    const { page, limit, ...f } = req.query as any;
    const { rows, total } = await svc.listInvoices(requireAuth(req), { page, limit }, f);
    ok(res, rows, buildMeta({ page, limit }, total));
  }),
);

router.get(
  '/:id',
  roleGuard(ROLE.ADMIN, ROLE.ACCOUNTANT, ROLE.STUDENT, ROLE.GUARDIAN),
  validateRequest({ params: idParams }),
  catchAsync(async (req, res) => ok(res, await svc.getInvoice(requireAuth(req), req.params.id as string))),
);

router.post(
  '/:id/void',
  roleGuard(ROLE.ADMIN),
  validateRequest({ params: idParams, body: v.voidBody }),
  catchAsync(async (req, res) => ok(res, await voidInvoice(req.params.id as string, req.body.reason))),
);

export const invoiceRoutes = router;
