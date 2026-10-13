import { z } from 'zod';
import { isValidLocalDate } from '../../lib/localDate';
import { objectIdSchema } from '../../lib/objectId';

const date = z.string().refine(isValidLocalDate, 'Use YYYY-MM-DD');
const status = z.enum(['present', 'absent', 'late', 'leave']);

export const sheetQuery = z.strictObject({ sectionId: objectIdSchema, date });

export const submitBody = z.strictObject({
  sectionId: objectIdSchema,
  date,
  /** Only exceptions are required; everyone not listed is marked present. */
  records: z
    .array(z.strictObject({ studentId: objectIdSchema, status, note: z.string().trim().max(200).optional() }))
    .max(500),
  /** Needed to record attendance on a weekend day (for example a special class). */
  allowWeekend: z.boolean().default(false),
});

export const editBody = z.strictObject({
  records: z
    .array(z.strictObject({ studentId: objectIdSchema, status, note: z.string().trim().max(200).optional() }))
    .min(1)
    .max(500),
});

export const sectionReportQuery = z.strictObject({ sectionId: objectIdSchema, from: date, to: date });
export const studentReportQuery = z.strictObject({ from: date, to: date });
export const studentParams = z.strictObject({ studentId: objectIdSchema });
