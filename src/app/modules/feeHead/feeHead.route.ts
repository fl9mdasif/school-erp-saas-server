import { z } from 'zod';
import { crudRouter } from '../../lib/crud';
import { FeeHead } from './feeHead.model';

const createBody = z.strictObject({
  name: z.string().trim().min(2).max(80),
  nameBn: z.string().trim().max(80).optional(),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_]{2,20}$/, 'Use letters, digits and underscore'),
  kind: z.enum(['recurring', 'one_time']),
  isActive: z.boolean().optional(),
});

export const feeHeadRoutes = crudRouter({
  name: 'feeHead',
  model: FeeHead,
  createBody,
  updateBody: createBody.omit({ code: true }).partial(),
  readRoles: ['admin', 'accountant'],
  writeRoles: ['admin', 'accountant'],
  allowDelete: false, // heads referenced by old invoices are deactivated, never removed
  sort: { code: 1 },
});
