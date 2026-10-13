import { Router } from 'express';
import { z } from 'zod';
import { catchAsync } from '../../lib/catchAsync';
import { objectIdSchema } from '../../lib/objectId';
import { buildMeta, escapeRegex, paginationQuery, toSkip } from '../../lib/pagination';
import { ok } from '../../lib/sendResponse';
import { authenticate, roleGuard } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { AuditLog } from './auditLog.model';

const query = z.strictObject({
  ...paginationQuery,
  action: z.string().trim().max(60).optional(),
  entityType: z.string().trim().max(40).optional(),
  entityId: objectIdSchema.optional(),
  actorId: objectIdSchema.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

const router = Router();
router.use(authenticate(), roleGuard('admin'));

router.get(
  '/',
  validateRequest({ query }),
  catchAsync(async (req, res) => {
    const { page, limit, action, entityType, entityId, actorId, from, to } = req.query as any;
    const filter: Record<string, any> = {};
    if (action) filter.action = new RegExp(`^${escapeRegex(action)}`);
    if (entityType) filter.entityType = entityType;
    if (entityId) filter.entityId = entityId;
    if (actorId) filter.actorId = actorId;
    if (from || to) filter.createdAt = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
    const [rows, total] = await Promise.all([
      AuditLog.find(filter).sort({ createdAt: -1 }).skip(toSkip({ page, limit })).limit(limit).lean(),
      AuditLog.countDocuments(filter),
    ]);
    ok(res, rows, buildMeta({ page, limit }, total));
  }),
);

export const auditLogRoutes = router;
