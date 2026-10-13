import { Router } from 'express';
import { z } from 'zod';
import { catchAsync } from '../../lib/catchAsync';
import { objectIdSchema } from '../../lib/objectId';
import { ok } from '../../lib/sendResponse';
import { isValidLocalDate } from '../../lib/localDate';
import { resultLookupHourLimiter, resultLookupMinuteLimiter } from '../../middlewares/rateLimit';
import { buildMarksheet, renderMarksheetPdf } from '../marksheet/marksheet.service';
import * as svc from './publicResult.service';

const dob = z.string().refine(isValidLocalDate, 'Use YYYY-MM-DD');
const schemas: Record<svc.LookupMode, z.ZodType> = {
  roll_dob: z.strictObject({
    examId: objectIdSchema,
    classId: objectIdSchema,
    roll: z.number().int().min(1).max(9999),
    dob,
  }),
  roll_only: z.strictObject({
    examId: objectIdSchema,
    classId: objectIdSchema,
    roll: z.number().int().min(1).max(9999),
  }),
  student_id_dob: z.strictObject({
    examId: objectIdSchema,
    studentId: z.string().trim().min(3).max(20),
    dob,
  }),
};

const noStore = (res: any) => {
  // Results are personal data: no shared cache may keep them.
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
};

const router = Router({ mergeParams: true });
router.use(resultLookupMinuteLimiter, resultLookupHourLimiter);

const parse = async (body: unknown) => {
  const mode = await svc.lookupMode();
  return { mode, input: schemas[mode].parse(body) as svc.LookupInput };
};

router.post(
  '/lookup',
  catchAsync(async (req, res) => {
    noStore(res);
    const { mode, input } = await parse(req.body);
    ok(res, await svc.publicResultPayload(await svc.findPublishedResult(mode, input)));
  }),
);

router.post(
  '/marksheet',
  catchAsync(async (req, res) => {
    noStore(res);
    const { mode, input } = await parse(req.body);
    const result = await svc.findPublishedResult(mode, input);
    const pdf = await renderMarksheetPdf(await buildMarksheet(result));
    res.setHeader('content-type', 'application/pdf');
    res.setHeader('content-disposition', 'inline; filename="marksheet.pdf"');
    res.send(pdf);
  }),
);

export const publicResultRoutes = router;
