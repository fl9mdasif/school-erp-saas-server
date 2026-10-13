import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../../errors/AppError';
import { catchAsync } from '../../lib/catchAsync';
import { isValidLocalDate, todayLocal } from '../../lib/localDate';
import { idParams, objectIdSchema } from '../../lib/objectId';
import { buildMeta, paginationQuery, toSkip } from '../../lib/pagination';
import { requireAuth } from '../../lib/requireAuth';
import { created, ok } from '../../lib/sendResponse';
import { authenticate, roleGuard } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { writeAudit } from '../auditLog/auditLog.model';
import { AcademicSession } from '../academicSession/academicSession.model';
import { FeeHead } from '../feeHead/feeHead.model';
import { Student } from '../student/student.model';
import { FeeAdjustment } from './feeAdjustment.model';

const date = z.string().refine(isValidLocalDate, 'Use YYYY-MM-DD');
const body = z
  .strictObject({
    studentId: objectIdSchema,
    sessionId: objectIdSchema,
    feeHeadId: objectIdSchema.optional(),
    type: z.enum(['percent', 'fixed']),
    value: z.number().min(0),
    reason: z.string().trim().min(3).max(300),
    validFrom: date.optional(),
    validTo: date.optional(),
  })
  .refine((v) => v.type !== 'percent' || v.value <= 100, {
    message: 'Percent must be between 0 and 100',
    path: ['value'],
  })
  .refine((v) => v.type !== 'fixed' || Number.isInteger(v.value), {
    message: 'Fixed amounts are whole poisha',
    path: ['value'],
  });

const router = Router();
router.use(authenticate(), roleGuard('admin'));

router.get(
  '/',
  validateRequest({
    query: z.strictObject({
      ...paginationQuery,
      studentId: objectIdSchema.optional(),
      sessionId: objectIdSchema.optional(),
    }),
  }),
  catchAsync(async (req, res) => {
    const { page, limit, studentId, sessionId } = req.query as any;
    const filter = { ...(studentId ? { studentId } : {}), ...(sessionId ? { sessionId } : {}) };
    const [rows, total] = await Promise.all([
      FeeAdjustment.find(filter).sort({ createdAt: -1 }).skip(toSkip({ page, limit })).limit(limit).lean(),
      FeeAdjustment.countDocuments(filter),
    ]);
    ok(res, rows, buildMeta({ page, limit }, total));
  }),
);

router.post(
  '/',
  validateRequest({ body }),
  catchAsync(async (req, res) => {
    const b = req.body;
    if (!(await Student.exists({ _id: b.studentId }))) throw AppError.badRequest('Student not found');
    if (!(await AcademicSession.exists({ _id: b.sessionId }))) throw AppError.badRequest('Session not found');
    if (b.feeHeadId && !(await FeeHead.exists({ _id: b.feeHeadId })))
      throw AppError.badRequest('Fee head not found');
    const doc = await FeeAdjustment.create({ ...b, approvedBy: requireAuth(req).userId });
    await writeAudit({
      action: 'fee_adjustment.create',
      entityType: 'FeeAdjustment',
      entityId: doc._id,
      after: { type: b.type, value: b.value, reason: b.reason },
    });
    created(res, doc);
  }),
);

/** "Deleting" an adjustment ends it today. The row stays so past invoices remain explainable. */
router.delete(
  '/:id',
  validateRequest({ params: idParams }),
  catchAsync(async (req, res) => {
    const doc = await FeeAdjustment.findById(req.params.id);
    if (!doc) throw AppError.notFound('Adjustment not found');
    doc.validTo = todayLocal();
    await doc.save();
    await writeAudit({ action: 'fee_adjustment.end', entityType: 'FeeAdjustment', entityId: doc._id });
    ok(res, doc);
  }),
);

export const feeAdjustmentRoutes = router;
