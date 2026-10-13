import { Router } from 'express';
import { catchAsync } from '../../lib/catchAsync';
import { idParams } from '../../lib/objectId';
import { requireAuth } from '../../lib/requireAuth';
import { authenticate, roleGuard } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { buildReceipt, renderReceiptHtml, renderReceiptPdf } from './receipt.service';

const router = Router();
router.use(authenticate(), roleGuard('admin', 'accountant', 'student', 'guardian'));

router.get(
  '/:id/receipt.pdf',
  validateRequest({ params: idParams }),
  catchAsync(async (req, res) => {
    const pdf = await renderReceiptPdf(await buildReceipt(requireAuth(req), req.params.id as string));
    res.setHeader('content-type', 'application/pdf');
    res.setHeader('content-disposition', `inline; filename="receipt-${req.params.id}.pdf"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(pdf);
  }),
);

router.get(
  '/:id/receipt.html',
  validateRequest({ params: idParams }),
  catchAsync(async (req, res) => {
    const html = renderReceiptHtml(await buildReceipt(requireAuth(req), req.params.id as string));
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(html);
  }),
);

export const receiptRoutes = router;
