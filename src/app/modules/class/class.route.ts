import { z } from 'zod';
import { crudRouter } from '../../lib/crud';
import { assertNotInUse } from '../../lib/inUse';
import { Enrolment } from '../enrolment/enrolment.model';
import { Section } from '../section/section.model';
import { ClassModel } from './class.model';

const group = z.enum(['science', 'commerce', 'arts']).nullable();
const createBody = z.strictObject({
  name: z.string().trim().min(1).max(60),
  nameBn: z.string().trim().max(60).optional(),
  order: z.number().int().min(0).max(100).default(1),
  group: group.optional(),
  isActive: z.boolean().optional(),
});

export const classRoutes = crudRouter({
  name: 'class',
  model: ClassModel,
  createBody,
  updateBody: createBody.partial(),
  filterShape: { isActive: z.enum(['true', 'false']).optional() },
  buildFilter: (q) => (q.isActive ? { isActive: q.isActive === 'true' } : {}),
  sort: { order: 1, name: 1 },
  // Every class gets a hidden default section so attendance and rolls always have a section to attach to.
  afterCreate: async (doc) => {
    await Section.create({ classId: doc._id, name: 'Default', isDefault: true });
  },
  beforeDelete: async (doc) => {
    await assertNotInUse(
      Enrolment,
      { classId: doc._id, status: 'active' },
      'this class has enrolled students',
    );
    await Section.updateMany({ classId: doc._id }, { $set: { isDeleted: true, deletedAt: new Date() } });
  },
});
