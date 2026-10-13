import { catchAsync } from '../../lib/catchAsync';
import { buildMeta } from '../../lib/pagination';
import { requireAuth } from '../../lib/requireAuth';
import { created, ok } from '../../lib/sendResponse';
import * as svc from './student.service';

const id = (req: any) => req.params.id as string;

export const list = catchAsync(async (req, res) => {
  const { page, limit, ...f } = req.query as any;
  const { rows, total } = await svc.listStudents(requireAuth(req), { page, limit }, f);
  ok(res, rows, buildMeta({ page, limit }, total));
});
export const create = catchAsync(async (req, res) => created(res, await svc.createStudent(req.body)));
export const get = catchAsync(async (req, res) => ok(res, await svc.getStudent(requireAuth(req), id(req))));
export const update = catchAsync(async (req, res) => ok(res, await svc.updateStudent(id(req), req.body)));
export const setStatus = catchAsync(async (req, res) =>
  ok(res, await svc.setStudentStatus(id(req), req.body.status)),
);
export const remove = catchAsync(async (req, res) => {
  await svc.deleteStudent(id(req), requireAuth(req).userId);
  ok(res, { deleted: true });
});
export const changeEnrolment = catchAsync(async (req, res) =>
  ok(res, await svc.changeEnrolment(id(req), req.body)),
);
export const attachGuardian = catchAsync(async (req, res) =>
  created(res, await svc.attachGuardian(id(req), req.body)),
);
export const createLogin = catchAsync(async (req, res) =>
  created(res, await svc.createLogins(id(req), req.body)),
);
export const mine = catchAsync(async (req, res) => ok(res, await svc.myStudents(requireAuth(req))));
