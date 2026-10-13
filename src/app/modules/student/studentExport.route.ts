import { Router } from 'express';
import { z } from 'zod';
import { catchAsync } from '../../lib/catchAsync';
import { toCsv } from '../../lib/csv';
import { objectIdSchema } from '../../lib/objectId';
import { requireAuth } from '../../lib/requireAuth';
import { todayLocal } from '../../lib/localDate';
import { authenticate, roleGuard } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { ClassModel } from '../class/class.model';
import { Section } from '../section/section.model';
import { listStudents } from './student.service';

const MAX_ROWS = 5000;

const exportQuery = z.strictObject({
  q: z.string().trim().max(60).optional(),
  classId: objectIdSchema.optional(),
  sectionId: objectIdSchema.optional(),
  sessionId: objectIdSchema.optional(),
  status: z.enum(['active', 'transferred', 'passed_out', 'dropped', 'inactive']).optional(),
});

const router = Router();
router.use(authenticate(), roleGuard('admin'));

/** GET /students/export: the same filters as the list, as a spreadsheet-safe CSV. */
router.get(
  '/',
  validateRequest({ query: exportQuery }),
  catchAsync(async (req, res) => {
    const { rows } = await listStudents(requireAuth(req), { page: 1, limit: MAX_ROWS }, req.query as any);
    const [classes, sections] = await Promise.all([
      ClassModel.find({}).select('name').lean(),
      Section.find({}).select('name isDefault').lean(),
    ]);
    const className = new Map(classes.map((c: any) => [String(c._id), c.name]));
    const sectionName = new Map(sections.map((s: any) => [String(s._id), s.isDefault ? '' : s.name]));

    const header = [
      'studentId',
      'admissionNo',
      'name',
      'nameBn',
      'gender',
      'dob',
      'status',
      'className',
      'sectionName',
      'roll',
      'address',
    ];
    const body = rows.map((s: any) => {
      const e = s.currentEnrolmentId && typeof s.currentEnrolmentId === 'object' ? s.currentEnrolmentId : null;
      return [
        s.studentId,
        s.admissionNo,
        s.name,
        s.nameBn,
        s.gender,
        s.dob,
        s.status,
        e ? className.get(String(e.classId)) : '',
        e?.sectionId ? sectionName.get(String(e.sectionId)) : '',
        e?.roll,
        s.address,
      ];
    });
    res.setHeader('content-type', 'text/csv; charset=utf-8');
    res.setHeader('content-disposition', `attachment; filename="students-${todayLocal()}.csv"`);
    res.send('﻿' + toCsv(header, body));
  }),
);

export const studentExportRoutes = router;
