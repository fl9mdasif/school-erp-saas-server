import { z } from 'zod';
import { isValidLocalDate } from '../../lib/localDate';
import { objectIdSchema } from '../../lib/objectId';
import { paginationQuery } from '../../lib/pagination';

const date = z.string().refine(isValidLocalDate, 'Use YYYY-MM-DD');

export const createExamBody = z
  .strictObject({
    name: z.string().trim().min(2).max(100),
    kind: z.enum(['term', 'class_test', 'model_test', 'monthly', 'custom']).default('term'),
    sessionId: objectIdSchema,
    classIds: z.array(objectIdSchema).min(1).max(30),
    gradingScaleId: objectIdSchema.optional(),
    startDate: date.optional(),
    endDate: date.optional(),
  })
  .refine((v) => !v.startDate || !v.endDate || v.endDate >= v.startDate, {
    message: 'endDate must not be before startDate',
    path: ['endDate'],
  });

export const updateExamBody = z.strictObject({
  name: z.string().trim().min(2).max(100).optional(),
  kind: z.enum(['term', 'class_test', 'model_test', 'monthly', 'custom']).optional(),
  classIds: z.array(objectIdSchema).min(1).max(30).optional(),
  gradingScaleId: objectIdSchema.optional(),
  startDate: date.optional(),
  endDate: date.optional(),
});

export const examStatusBody = z.strictObject({ status: z.enum(['draft', 'marks_open', 'marks_closed']) });
export const listExamsQuery = z.strictObject({
  ...paginationQuery,
  status: z.enum(['draft', 'marks_open', 'marks_closed', 'published']).optional(),
  sessionId: objectIdSchema.optional(),
});

export const marksSheetQuery = z.strictObject({
  classId: objectIdSchema,
  sectionId: objectIdSchema.optional(),
  subjectId: objectIdSchema,
});

const markEntry = z.strictObject({
  studentId: objectIdSchema,
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
});
export const saveMarksBody = z.strictObject({
  classId: objectIdSchema,
  sectionId: objectIdSchema.optional(),
  subjectId: objectIdSchema,
  marks: z.array(markEntry).min(1).max(500),
});
export const submitMarksBody = z.strictObject({
  classId: objectIdSchema,
  sectionId: objectIdSchema.optional(),
  subjectId: objectIdSchema,
});
export const examParams = z.strictObject({ id: objectIdSchema });
