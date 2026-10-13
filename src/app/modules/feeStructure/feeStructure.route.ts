import { z } from 'zod';
import { AppError } from '../../errors/AppError';
import { crudRouter } from '../../lib/crud';
import { objectIdSchema } from '../../lib/objectId';
import { AcademicSession } from '../academicSession/academicSession.model';
import { ClassModel } from '../class/class.model';
import { FeeHead } from '../feeHead/feeHead.model';
import { FeeStructure } from './feeStructure.model';

const item = z.strictObject({
  feeHeadId: objectIdSchema,
  amount: z.number().int().min(0).max(100_000_000), // poisha
  cycle: z.enum(['monthly', 'term', 'yearly', 'one_time']),
  dueDay: z.number().int().min(1).max(28).optional(),
});

const createBody = z.strictObject({
  sessionId: objectIdSchema,
  classId: objectIdSchema,
  group: z.enum(['science', 'commerce', 'arts']).nullable().default(null),
  items: z.array(item).min(1).max(30),
});

export const feeStructureRoutes = crudRouter({
  name: 'feeStructure',
  model: FeeStructure,
  createBody,
  updateBody: z.strictObject({ items: z.array(item).min(1).max(30) }),
  readRoles: ['admin', 'accountant'],
  writeRoles: ['admin', 'accountant'],
  allowDelete: false,
  filterShape: { sessionId: objectIdSchema.optional(), classId: objectIdSchema.optional() },
  buildFilter: (q) => ({
    ...(q.sessionId ? { sessionId: q.sessionId } : {}),
    ...(q.classId ? { classId: q.classId } : {}),
  }),
  prepare: async (body, existing) => {
    if (!existing) {
      if (!(await AcademicSession.exists({ _id: body.sessionId })))
        throw AppError.badRequest('Session not found');
      if (!(await ClassModel.exists({ _id: body.classId }))) throw AppError.badRequest('Class not found');
    }
    if (body.items) {
      const ids = body.items.map((i: any) => i.feeHeadId);
      if (new Set(ids).size !== ids.length)
        throw AppError.badRequest('A fee head can appear only once per structure');
      if ((await FeeHead.countDocuments({ _id: { $in: ids }, isActive: true })) !== ids.length)
        throw AppError.badRequest('Unknown or inactive fee head');
    }
    return body;
  },
});
