import { z } from 'zod';
import { objectIdSchema } from '../../lib/objectId';
import { paginationQuery } from '../../lib/pagination';

export const tenantIdParams = z.strictObject({ id: objectIdSchema });

export const listTenantsQuery = z.strictObject({
  ...paginationQuery,
  status: z.enum(['trial', 'active', 'suspended', 'cancelled']).optional(),
  type: z.enum(['school', 'madrasa', 'coaching']).optional(),
  q: z.string().trim().max(60).optional(),
});

export const tenantStatusBody = z.strictObject({
  status: z.enum(['active', 'suspended', 'cancelled']),
  reason: z.string().trim().min(3).max(300),
});

export const tenantPlanBody = z.strictObject({
  planId: objectIdSchema.optional(),
  studentCap: z.number().int().min(1).max(100000).optional(),
  extendTrialDays: z.number().int().min(1).max(365).optional(),
});

export const tenantSlugBody = z.strictObject({
  slug: z.string().min(1).max(60),
  reason: z.string().trim().min(3).max(300),
});

export const subscriptionPaymentBody = z.strictObject({
  planId: objectIdSchema,
  amount: z.number().int().min(0),
  method: z.enum(['bkash_manual', 'nagad_manual', 'bank', 'cash']),
  reference: z.string().trim().min(1).max(100),
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
});

const planFeatures = z.strictObject({
  customDomain: z.boolean(),
  csvImport: z.boolean(),
  marksheetPdf: z.boolean(),
});

export const createPlanBody = z.strictObject({
  code: z.string().trim().toLowerCase().min(2).max(30),
  name: z.string().trim().min(2).max(60),
  priceMonthly: z.number().int().min(0),
  studentCap: z.number().int().min(1),
  features: planFeatures,
  isActive: z.boolean().optional(),
});
export const updatePlanBody = createPlanBody.partial().omit({ code: true });
