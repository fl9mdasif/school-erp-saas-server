import { z } from 'zod';
import { crudRouter } from '../../lib/crud';
import { assertNotInUse } from '../../lib/inUse';
import { ClassSubject } from '../classSubject/classSubject.model';
import { Subject } from './subject.model';

export const componentBody = z
  .strictObject({
    key: z.string().trim().min(1).max(20),
    label: z.string().trim().min(1).max(40),
    fullMarks: z.number().min(0).max(1000),
    passMarks: z.number().min(0).max(1000),
  })
  .refine((c) => c.passMarks <= c.fullMarks, {
    message: 'passMarks cannot exceed fullMarks',
    path: ['passMarks'],
  });

export const uniqueKeys = (cs: { key: string }[]) => new Set(cs.map((c) => c.key)).size === cs.length;

const createBody = z.strictObject({
  name: z.string().trim().min(1).max(80),
  nameBn: z.string().trim().max(80).optional(),
  code: z.string().trim().max(20).optional(),
  components: z.array(componentBody).max(8).refine(uniqueKeys, 'Component keys must be unique').default([]),
});

export const subjectRoutes = crudRouter({
  name: 'subject',
  model: Subject,
  createBody,
  updateBody: createBody.partial(),
  sort: { name: 1 },
  beforeDelete: (doc) =>
    assertNotInUse(ClassSubject, { subjectId: doc._id }, 'this subject is mapped to a class'),
});
