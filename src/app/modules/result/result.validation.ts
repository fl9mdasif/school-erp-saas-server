import { z } from 'zod';
import { objectIdSchema } from '../../lib/objectId';

export const resultsQuery = z.strictObject({
  classId: objectIdSchema.optional(),
  sectionId: objectIdSchema.optional(),
});
export const meritQuery = z.strictObject({
  classId: objectIdSchema,
  format: z.enum(['json', 'csv']).default('json'),
});
export const publishBody = z.strictObject({ forceMissingAsAbsent: z.boolean().default(false) });
export const correctBody = z.strictObject({
  reason: z.string().trim().min(5).max(500),
  changes: z
    .array(
      z.strictObject({
        subjectId: objectIdSchema,
        components: z
          .array(
            z.strictObject({
              key: z.string().min(1).max(20),
              obtained: z.number().min(0).nullable(),
              absent: z.boolean().default(false),
            }),
          )
          .min(1)
          .max(8),
      }),
    )
    .min(1)
    .max(15),
});
export const examStudentParams = z.strictObject({ id: objectIdSchema, studentId: objectIdSchema });
export const meResultParams = z.strictObject({ examId: objectIdSchema, studentId: objectIdSchema });
