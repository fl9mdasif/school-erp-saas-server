import { z } from 'zod';
import { objectIdSchema } from '../../lib/objectId';
import { paginationQuery } from '../../lib/pagination';

const audience = z
  .strictObject({
    type: z.enum(['all', 'staff', 'students_guardians', 'class', 'section']),
    classIds: z.array(objectIdSchema).max(50).default([]),
    sectionIds: z.array(objectIdSchema).max(100).default([]),
  })
  .refine((a) => a.type !== 'class' || a.classIds.length > 0, {
    message: 'Choose at least one class',
    path: ['classIds'],
  })
  .refine((a) => a.type !== 'section' || a.sectionIds.length > 0, {
    message: 'Choose at least one section',
    path: ['sectionIds'],
  });

const attachment = z.strictObject({
  url: z.string().url().max(500),
  name: z.string().trim().min(1).max(120),
});

const fields = {
  title: z.string().trim().min(2).max(200),
  body: z.string().trim().min(1).max(10000),
  audience,
  isPublic: z.boolean().default(false),
  attachments: z.array(attachment).max(5).default([]),
  status: z.enum(['draft', 'published']).default('published'),
  publishAt: z.coerce.date().optional(),
  expiresAt: z.coerce.date().optional(),
};

export const createNoticeBody = z.strictObject(fields);
export const updateNoticeBody = z.strictObject(fields).partial();
export const listNoticesQuery = z.strictObject({
  ...paginationQuery,
  status: z.enum(['draft', 'published']).optional(),
});
