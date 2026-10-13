import { z } from 'zod';
import { isValidLocalDate } from '../../lib/localDate';
import { objectIdSchema } from '../../lib/objectId';
import { paginationQuery } from '../../lib/pagination';

export const generateBody = z.strictObject({
  sessionId: objectIdSchema,
  classId: objectIdSchema.optional(),
  sectionId: objectIdSchema.optional(),
  studentIds: z.array(objectIdSchema).max(2000).optional(),
  periodLabel: z.string().trim().min(2).max(40),
  cycle: z.enum(['monthly', 'term', 'yearly', 'one_time']),
  feeHeadIds: z.array(objectIdSchema).max(30).optional(),
  dueDate: z.string().refine(isValidLocalDate, 'Use YYYY-MM-DD'),
});
export const generateQuery = z.strictObject({ dryRun: z.enum(['true', 'false']).default('false') });

export const listInvoicesQuery = z.strictObject({
  ...paginationQuery,
  studentId: objectIdSchema.optional(),
  classId: objectIdSchema.optional(),
  status: z.enum(['unpaid', 'partial', 'paid', 'voided']).optional(),
  periodLabel: z.string().trim().max(40).optional(),
});

export const voidBody = z.strictObject({ reason: z.string().trim().min(3).max(300) });
