import { z } from 'zod';
import { objectIdSchema } from '../../lib/objectId';

export const promoteBody = z
  .strictObject({
    fromSessionId: objectIdSchema,
    toSessionId: objectIdSchema,
    fromClassId: objectIdSchema,
    /** Omit together with passOut: true to graduate the whole class. */
    toClassId: objectIdSchema.optional(),
    toSectionId: objectIdSchema.optional(),
    studentIds: z.array(objectIdSchema).max(2000).optional(),
    repeatStudentIds: z.array(objectIdSchema).max(2000).default([]),
    rollMode: z.enum(['previous_roll', 'name']).default('previous_roll'),
    passOut: z.boolean().default(false),
  })
  .refine((v) => (v.passOut ? !v.toClassId : !!v.toClassId), {
    message: 'Give toClassId, or set passOut with no toClassId',
    path: ['toClassId'],
  })
  .refine((v) => v.fromSessionId !== v.toSessionId, {
    message: 'Promotion needs a different target session',
    path: ['toSessionId'],
  });

export const promoteQuery = z.strictObject({ dryRun: z.enum(['true', 'false']).default('false') });
