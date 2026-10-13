import { z } from 'zod';
import { AppError } from '../../errors/AppError';
import { crudRouter } from '../../lib/crud';
import { objectIdSchema } from '../../lib/objectId';
import { AcademicSession } from '../academicSession/academicSession.model';
import { ClassModel } from '../class/class.model';
import { Section } from '../section/section.model';
import { componentBody, uniqueKeys } from '../subject/subject.route';
import { Subject } from '../subject/subject.model';
import { User } from '../user/user.model';
import { ClassSubject } from './classSubject.model';
import { ROLE } from '../../lib/roles';

const createBody = z.strictObject({
  sessionId: objectIdSchema,
  classId: objectIdSchema,
  sectionId: objectIdSchema.optional(),
  subjectId: objectIdSchema,
  teacherId: objectIdSchema.optional(),
  kind: z.enum(['compulsory', 'optional', 'fourth']).default('compulsory'),
  fullMarks: z.number().min(0).max(1000).optional(),
  passMarks: z.number().min(0).max(1000).optional(),
  components: z.array(componentBody).max(8).refine(uniqueKeys, 'Component keys must be unique').optional(),
  order: z.number().int().min(0).optional(),
});
const updateBody = createBody.omit({ sessionId: true, classId: true, subjectId: true }).partial();

export const classSubjectRoutes = crudRouter({
  name: 'classSubject',
  model: ClassSubject,
  createBody,
  updateBody,
  readRoles: [ROLE.ADMIN, ROLE.TEACHER],
  filterShape: {
    sessionId: objectIdSchema.optional(),
    classId: objectIdSchema.optional(),
    teacherId: objectIdSchema.optional(),
  },
  buildFilter: (q) => {
    const f: Record<string, unknown> = {};
    for (const k of ['sessionId', 'classId', 'teacherId']) if (q[k]) f[k] = q[k];
    return f;
  },
  sort: { order: 1, createdAt: 1 },
  prepare: async (body, existing) => {
    const b = { ...body };
    if (!existing) {
      if (!(await AcademicSession.exists({ _id: b.sessionId })))
        throw AppError.badRequest('Session not found');
      if (!(await ClassModel.exists({ _id: b.classId }))) throw AppError.badRequest('Class not found');
      const subject = await Subject.findById(b.subjectId);
      if (!subject) throw AppError.badRequest('Subject not found');
      // Components default to the subject's own definition so marks entry has something to work with.
      if (!b.components)
        b.components = (subject as any).components.map((c: any) => ({
          key: c.key,
          label: c.label,
          fullMarks: c.fullMarks,
          passMarks: c.passMarks,
        }));
    }
    const classId = b.classId ?? existing?.classId;
    if (b.sectionId && !(await Section.exists({ _id: b.sectionId, classId })))
      throw AppError.badRequest('Section does not belong to this class');
    if (b.teacherId && !(await User.exists({ _id: b.teacherId, role: 'teacher', status: 'active' }))) {
      throw AppError.badRequest('Teacher must be an active teacher account');
    }
    const comps = b.components ?? existing?.components ?? [];
    if (comps.length) {
      b.fullMarks = comps.reduce((s: number, c: any) => s + c.fullMarks, 0);
      b.passMarks =
        b.passMarks ?? existing?.passMarks ?? comps.reduce((s: number, c: any) => s + c.passMarks, 0);
    } else if (!existing && (b.fullMarks === undefined || b.passMarks === undefined)) {
      throw AppError.badRequest('fullMarks and passMarks are required when there are no components');
    }
    if ((b.passMarks ?? 0) > (b.fullMarks ?? existing?.fullMarks ?? 0))
      throw AppError.badRequest('passMarks cannot exceed fullMarks');
    return b;
  },
});
