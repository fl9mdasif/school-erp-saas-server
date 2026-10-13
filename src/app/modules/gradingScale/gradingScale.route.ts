import { z } from 'zod';
import { AppError } from '../../errors/AppError';
import { crudRouter } from '../../lib/crud';
import { assertNotInUse } from '../../lib/inUse';
import { Exam } from '../exam/exam.model';
import { GradingScale } from './gradingScale.model';

const band = z
  .strictObject({
    minPercent: z.number().min(0).max(100),
    maxPercent: z.number().min(0).max(100),
    letter: z.string().trim().min(1).max(30),
    point: z.number().min(0).max(10).optional(),
    remark: z.string().trim().max(60).optional(),
  })
  .refine((b) => b.maxPercent >= b.minPercent, {
    message: 'maxPercent must be at least minPercent',
    path: ['maxPercent'],
  });

const createBody = z.strictObject({
  name: z.string().trim().min(2).max(60),
  kind: z.enum(['gpa', 'division', 'percentage']),
  bands: z.array(band).min(2).max(20),
  passPercent: z.number().min(0).max(100).default(33),
  rules: z
    .strictObject({
      failIfAnyCompulsoryFails: z.boolean().default(true),
      fourthSubjectBonus: z.boolean().default(true),
      graceMarksPerSubject: z.number().min(0).max(20).default(0),
      meritTieBreak: z.enum(['total_then_roll', 'total_then_name']).default('total_then_roll'),
    })
    .default({
      failIfAnyCompulsoryFails: true,
      fourthSubjectBonus: true,
      graceMarksPerSubject: 0,
      meritTieBreak: 'total_then_roll',
    }),
  isDefault: z.boolean().optional(),
});

/** Bands must cover 0 to 100 without overlapping so every percent maps to exactly one band. */
export const assertBandsCover = (bands: { minPercent: number; maxPercent: number }[]) => {
  const sorted = [...bands].sort((a, b) => a.minPercent - b.minPercent);
  if (sorted[0].minPercent !== 0)
    throw AppError.badRequest('Bands must start at 0 percent', undefined, 'BANDS_INVALID');
  if (sorted[sorted.length - 1].maxPercent < 100)
    throw AppError.badRequest('Bands must reach 100 percent', undefined, 'BANDS_INVALID');
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].minPercent - sorted[i - 1].maxPercent;
    // whole-percent bands: next band starts right after the previous one ends (79 then 80)
    if (gap < 0 || gap > 1)
      throw AppError.badRequest('Bands overlap or leave a gap', undefined, 'BANDS_INVALID');
  }
};

export const gradingScaleRoutes = crudRouter({
  name: 'gradingScale',
  model: GradingScale,
  createBody,
  updateBody: createBody.partial(),
  readRoles: ['admin', 'teacher'],
  prepare: async (body, existing) => {
    if (body.bands) assertBandsCover(body.bands);
    // exactly one default scale per tenant
    if (body.isDefault)
      await GradingScale.updateMany(
        { isDefault: true, ...(existing ? { _id: { $ne: existing._id } } : {}) },
        { $set: { isDefault: false } },
      );
    return body;
  },
  beforeDelete: async (doc) => {
    if (doc.isDefault)
      throw AppError.conflict('Choose another default scale before deleting this one', 'IN_USE');
    await assertNotInUse(Exam, { gradingScaleId: doc._id }, 'this grading scale is used by an exam');
  },
});
