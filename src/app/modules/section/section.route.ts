import { z } from 'zod';
import { AppError } from '../../errors/AppError';
import { crudRouter } from '../../lib/crud';
import { assertNotInUse } from '../../lib/inUse';
import { objectIdSchema } from '../../lib/objectId';
import { ClassModel } from '../class/class.model';
import { Enrolment } from '../enrolment/enrolment.model';
import { User } from '../user/user.model';
import { Section } from './section.model';

const createBody = z.strictObject({
  classId: objectIdSchema,
  name: z.string().trim().min(1).max(40),
  capacity: z.number().int().min(1).max(500).optional(),
  classTeacherId: objectIdSchema.optional(),
});
const updateBody = createBody.omit({ classId: true }).partial();

export const sectionRoutes = crudRouter({
  name: 'section',
  model: Section,
  createBody,
  updateBody,
  filterShape: { classId: objectIdSchema.optional() },
  buildFilter: (q) => (q.classId ? { classId: q.classId } : {}),
  baseFilter: { isDefault: { $ne: true } },
  sort: { name: 1 },
  prepare: async (body) => {
    if (body.classId && !(await ClassModel.exists({ _id: body.classId })))
      throw AppError.badRequest('Class not found');
    if (
      body.classTeacherId &&
      !(await User.exists({ _id: body.classTeacherId, role: 'teacher', status: 'active' }))
    ) {
      throw AppError.badRequest('Class teacher must be an active teacher');
    }
    return body;
  },
  beforeDelete: (doc) =>
    assertNotInUse(Enrolment, { sectionId: doc._id, status: 'active' }, 'this section has enrolled students'),
});
