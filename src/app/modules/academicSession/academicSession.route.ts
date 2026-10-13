import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../../errors/AppError';
import { catchAsync } from '../../lib/catchAsync';
import { idParams } from '../../lib/objectId';
import { buildMeta, paginationQuery, toSkip } from '../../lib/pagination';
import { created, ok } from '../../lib/sendResponse';
import { isValidLocalDate } from '../../lib/localDate';
import { withTransaction } from '../../lib/transaction';
import { authenticate, roleGuard } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { writeAudit } from '../auditLog/auditLog.model';
import { AcademicSession } from './academicSession.model';
import { ROLE } from '../../lib/roles';

const date = z.string().refine(isValidLocalDate, 'Use YYYY-MM-DD');
const createBody = z
  .strictObject({
    name: z.string().trim().min(1).max(40),
    startDate: date,
    endDate: date,
    isCurrent: z.boolean().optional(),
  })
  .refine((v) => v.endDate > v.startDate, { message: 'endDate must be after startDate', path: ['endDate'] });
const updateBody = z.strictObject({
  name: z.string().trim().min(1).max(40).optional(),
  startDate: date.optional(),
  endDate: date.optional(),
  isCurrent: z.literal(true).optional(),
});

const router = Router();
router.use(authenticate());

router.get(
  '/',
  validateRequest({ query: z.strictObject({ ...paginationQuery }) }),
  catchAsync(async (req, res) => {
    const { page, limit } = req.query as any;
    const [rows, total] = await Promise.all([
      AcademicSession.find({}).sort({ startDate: -1 }).skip(toSkip({ page, limit })).limit(limit).lean(),
      AcademicSession.countDocuments({}),
    ]);
    ok(res, rows, buildMeta({ page, limit }, total));
  }),
);

router.post(
  '/',
  roleGuard(ROLE.ADMIN),
  validateRequest({ body: createBody }),
  catchAsync(async (req, res) => {
    const doc = await withTransaction(async (session) => {
      if (req.body.isCurrent)
        await AcademicSession.updateMany({ isCurrent: true }, { $set: { isCurrent: false } }, { session });
      const [d] = await AcademicSession.create([req.body], { session });
      return d;
    });
    await writeAudit({
      action: 'session.create',
      entityType: 'AcademicSession',
      entityId: doc._id,
      after: req.body,
    });
    created(res, doc);
  }),
);

router.patch(
  '/:id',
  roleGuard(ROLE.ADMIN),
  validateRequest({ params: idParams, body: updateBody }),
  catchAsync(async (req, res) => {
    const doc = await withTransaction(async (session) => {
      const s = await AcademicSession.findById(req.params.id).session(session);
      if (!s) throw AppError.notFound('Session not found');
      const next = { startDate: req.body.startDate ?? s.startDate, endDate: req.body.endDate ?? s.endDate };
      if (next.endDate <= next.startDate) throw AppError.badRequest('endDate must be after startDate');
      if (req.body.isCurrent)
        await AcademicSession.updateMany({ isCurrent: true }, { $set: { isCurrent: false } }, { session });
      s.set(req.body);
      await s.save({ session });
      return s;
    });
    await writeAudit({
      action: 'session.update',
      entityType: 'AcademicSession',
      entityId: doc._id,
      after: req.body,
    });
    ok(res, doc);
  }),
);

export const sessionRoutes = router;
