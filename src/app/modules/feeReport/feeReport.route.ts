import { Router } from 'express';
import { z } from 'zod';
import { catchAsync } from '../../lib/catchAsync';
import { toCsv } from '../../lib/csv';
import { isValidLocalDate } from '../../lib/localDate';
import { objectIdSchema } from '../../lib/objectId';
import { buildMeta, paginationQuery } from '../../lib/pagination';
import { ok } from '../../lib/sendResponse';
import { authenticate, roleGuard } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { collectionReport, duesReport } from './feeReport.service';

const date = z.string().refine(isValidLocalDate, 'Use YYYY-MM-DD');
const duesQuery = z.strictObject({
  ...paginationQuery,
  classId: objectIdSchema.optional(),
  sectionId: objectIdSchema.optional(),
  periodLabel: z.string().trim().max(40).optional(),
  minAmount: z.coerce.number().int().min(1).optional(),
  overdueOnly: z.enum(['true', 'false']).optional(),
  format: z.enum(['json', 'csv']).default('json'),
});
const collectionQuery = z.strictObject({
  from: date,
  to: date,
  groupBy: z.enum(['day', 'method', 'class', 'feeHead']).default('day'),
  format: z.enum(['json', 'csv']).default('json'),
});

const tk = (p: number) => (p / 100).toFixed(2);

const router = Router();
router.use(authenticate(), roleGuard('admin', 'accountant'));

router.get(
  '/dues',
  validateRequest({ query: duesQuery }),
  catchAsync(async (req, res) => {
    const { page, limit, format, overdueOnly, ...rest } = req.query as any;
    const filter = { ...rest, overdueOnly: overdueOnly === 'true' };
    if (format === 'csv') {
      const { rows } = await duesReport(filter);
      res.setHeader('content-type', 'text/csv; charset=utf-8');
      res.setHeader('content-disposition', 'attachment; filename="dues.csv"');
      return void res.send(
        toCsv(
          ['studentId', 'name', 'class', 'section', 'roll', 'dueTk', 'openInvoices', 'oldestDueDate'],
          rows.map((r) => [
            r.studentCode,
            r.name,
            r.className,
            r.section,
            r.roll,
            tk(r.due),
            r.openInvoices,
            r.oldestDueDate,
          ]),
        ),
      );
    }
    const { rows, total, totalDue } = await duesReport(filter, { page, limit });
    ok(res, { totalDue, rows }, buildMeta({ page, limit }, total));
  }),
);

router.get(
  '/reports/collection',
  validateRequest({ query: collectionQuery }),
  catchAsync(async (req, res) => {
    const { from, to, groupBy, format } = req.query as any;
    const data = await collectionReport(from, to, groupBy);
    if (format === 'csv') {
      res.setHeader('content-type', 'text/csv; charset=utf-8');
      res.setHeader('content-disposition', 'attachment; filename="collection.csv"');
      return void res.send(
        toCsv(
          [groupBy, 'label', 'collectedTk', 'payments'],
          data.rows.map((r) => [r.key, r.label, tk(r.collected), r.payments]),
        ),
      );
    }
    ok(res, data);
  }),
);

export const feeReportRoutes = router;
