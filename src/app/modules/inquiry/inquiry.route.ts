import { z } from 'zod';
import { Router } from 'express';
import { catchAsync } from '../../lib/catchAsync';
import { idParams } from '../../lib/objectId';
import { buildMeta, paginationQuery, toSkip } from '../../lib/pagination';
import { ok } from '../../lib/sendResponse';
import { AppError } from '../../errors/AppError';
import { authenticate, roleGuard } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { writeAudit } from '../auditLog/auditLog.model';
import { Inquiry } from './inquiry.model';

const router = Router();
router.use(authenticate(), roleGuard('admin'));

router.get(
  '/',
  validateRequest({
    query: z.strictObject({ ...paginationQuery, status: z.enum(['new', 'contacted', 'closed']).optional() }),
  }),
  catchAsync(async (req, res) => {
    const { page, limit, status } = req.query as any;
    const filter = status ? { status } : {};
    const [rows, total] = await Promise.all([
      Inquiry.find(filter).sort({ createdAt: -1 }).skip(toSkip({ page, limit })).limit(limit).lean(),
      Inquiry.countDocuments(filter),
    ]);
    ok(res, rows, buildMeta({ page, limit }, total));
  }),
);

router.patch(
  '/:id',
  validateRequest({
    params: idParams,
    body: z.strictObject({ status: z.enum(['new', 'contacted', 'closed']) }),
  }),
  catchAsync(async (req, res) => {
    const doc = await Inquiry.findById(req.params.id);
    if (!doc) throw AppError.notFound('Inquiry not found');
    const before = doc.status;
    doc.status = req.body.status;
    await doc.save();
    await writeAudit({
      action: 'inquiry.update',
      entityType: 'Inquiry',
      entityId: doc._id,
      before: { status: before },
      after: { status: doc.status },
    });
    ok(res, doc);
  }),
);

export const inquiryRoutes = router;
