import { Router } from 'express';
import { z } from 'zod';
import { catchAsync } from '../../lib/catchAsync';
import { requireTenantId } from '../../lib/tenantContext';
import { ok } from '../../lib/sendResponse';
import { getUploadProvider } from '../../lib/uploadProvider';
import { authenticate, roleGuard } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { ROLE } from '../../lib/roles';

const router = Router();
router.use(authenticate(), roleGuard(ROLE.ADMIN, ROLE.TEACHER));

const body = z.strictObject({
  kind: z.enum(['image', 'pdf']),
  folder: z.enum(['photos', 'gallery', 'notices', 'logo', 'staff']),
});

/** Signed upload parameters. Teachers may only upload notice attachments. */
router.post(
  '/sign',
  validateRequest({ body }),
  catchAsync(async (req, res) => {
    const { kind, folder } = req.body;
    if (req.auth!.role === 'teacher' && folder !== 'notices') {
      res
        .status(403)
        .json({ success: false, code: 'FORBIDDEN', message: 'You do not have access to this resource' });
      return;
    }
    if (kind === 'pdf' && folder !== 'notices') {
      res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'PDF uploads are only for notice attachments',
      });
      return;
    }
    ok(res, getUploadProvider().sign({ tenantId: String(requireTenantId()), kind, folder }));
  }),
);

export const uploadRoutes = router;
