import { Router } from 'express';
import { AppError } from '../../errors/AppError';
import { catchAsync } from '../../lib/catchAsync';
import { requireAuth } from '../../lib/requireAuth';
import { authenticate, roleGuard } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { Result } from '../result/result.model';
import { examStudentParams, meResultParams } from '../result/result.validation';
import { getPublishedResultFor } from '../result/result.service';
import { scopeFor, teacherEnrolmentFilter } from '../student/student.access';
import { buildMarksheet, renderMarksheetPdf } from './marksheet.service';

const send = async (res: any, result: any) => {
  const pdf = await renderMarksheetPdf(await buildMarksheet(result));
  res.setHeader('content-type', 'application/pdf');
  res.setHeader('content-disposition', `inline; filename="marksheet-${result.studentId}.pdf"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(pdf);
};

/** Staff: /exams/:id/results/:studentId/marksheet.pdf */
const staffRouter = Router();
staffRouter.use(authenticate(), roleGuard('admin', 'teacher'));
staffRouter.get(
  '/:id/results/:studentId/marksheet.pdf',
  validateRequest({ params: examStudentParams }),
  catchAsync(async (req, res) => {
    const auth = requireAuth(req);
    const scope = await scopeFor(auth);
    const filter: Record<string, any> = { examId: req.params.id, studentId: req.params.studentId };
    if (scope.kind === 'teacher') Object.assign(filter, teacherEnrolmentFilter(scope.pairs));
    const result = await Result.findOne(filter).lean();
    if (!result) throw AppError.notFound('Result not found');
    await send(res, result);
  }),
);
export const marksheetStaffRoutes = staffRouter;

/** Student and guardian: /me/results/:examId/:studentId/marksheet.pdf, published results of linked students only. */
const me = Router();
me.use(authenticate(), roleGuard('student', 'guardian'));
me.get(
  '/results/:examId/:studentId/marksheet.pdf',
  validateRequest({ params: meResultParams }),
  catchAsync(async (req, res) => {
    const result = await getPublishedResultFor(
      requireAuth(req),
      req.params.examId as string,
      req.params.studentId as string,
    );
    await send(res, result);
  }),
);
export const marksheetMeRoutes = me;
