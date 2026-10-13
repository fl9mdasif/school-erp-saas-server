import { Router } from 'express';
import multer from 'multer';
import { AppError } from '../../errors/AppError';
import { catchAsync } from '../../lib/catchAsync';
import { idParams, objectIdSchema } from '../../lib/objectId';
import { ok } from '../../lib/sendResponse';
import { authenticate, roleGuard } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { z } from 'zod';
import * as svc from './studentImport.service';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });

const router = Router();
router.use(authenticate(), roleGuard('admin'));

router.get('/template', (_req, res) => {
  res.setHeader('content-type', 'text/csv; charset=utf-8');
  res.setHeader('content-disposition', 'attachment; filename="students-template.csv"');
  res.send(svc.csvTemplate());
});

router.post(
  '/dry-run',
  upload.single('file'),
  catchAsync(async (req, res) => {
    if (!req.file) throw AppError.badRequest('Attach a CSV file in the "file" field');
    if (!/\.csv$/i.test(req.file.originalname)) throw AppError.badRequest('Only .csv files are accepted');
    ok(res, await svc.dryRun(req.file.originalname, req.file.buffer));
  }),
);

router.post(
  '/:jobId/commit',
  validateRequest({ params: z.strictObject({ jobId: objectIdSchema }) }),
  catchAsync(async (req, res) => ok(res, await svc.commitJob(req.params.jobId as string))),
);

void idParams;
export const studentImportRoutes = router;
