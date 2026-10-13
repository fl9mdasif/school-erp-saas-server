import { z } from 'zod';
import { objectIdSchema } from '../../lib/objectId';
import { paginationQuery } from '../../lib/pagination';
import { isValidLocalDate } from '../../lib/localDate';

export const createPaymentBody = z.strictObject({
  studentId: objectIdSchema,
  amount: z.number().int().min(1).max(100_000_000), // poisha
  method: z.enum(['cash', 'bank', 'cheque', 'bkash_manual', 'nagad_manual', 'rocket_manual']),
  allocations: z
    .array(z.strictObject({ invoiceId: objectIdSchema, amount: z.number().int().min(1) }))
    .max(24)
    .optional(),
  providerRef: z.string().trim().max(60).optional(),
  note: z.string().trim().max(300).optional(),
  receivedAt: z.coerce.date().optional(),
});

export const reverseBody = z.strictObject({ reason: z.string().trim().min(3).max(300) });

const date = z.string().refine(isValidLocalDate, 'Use YYYY-MM-DD');
export const listPaymentsQuery = z.strictObject({
  ...paginationQuery,
  studentId: objectIdSchema.optional(),
  method: z.enum(['cash', 'bank', 'cheque', 'bkash_manual', 'nagad_manual', 'rocket_manual']).optional(),
  status: z.enum(['succeeded', 'reversed']).optional(),
  receiptNo: z.string().trim().max(30).optional(),
  from: date.optional(),
  to: date.optional(),
});
