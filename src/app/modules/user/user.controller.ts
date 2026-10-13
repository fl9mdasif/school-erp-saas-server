import { catchAsync } from '../../lib/catchAsync';
import { buildMeta } from '../../lib/pagination';
import { requireAuth } from '../../lib/requireAuth';
import { created, ok } from '../../lib/sendResponse';
import * as svc from './user.service';

export const list = catchAsync(async (req, res) => {
  const { page, limit, ...filters } = req.query as any;
  const { rows, total } = await svc.listUsers({ page, limit }, filters);
  ok(res, rows, buildMeta({ page, limit }, total));
});

export const create = catchAsync(async (req, res) => {
  created(res, await svc.createUser(req.body));
});

export const get = catchAsync(async (req, res) => {
  ok(res, await svc.getUser(req.params.id as string));
});

export const update = catchAsync(async (req, res) => {
  ok(res, await svc.updateUser(req.params.id as string, req.body, requireAuth(req).userId));
});

export const setStatus = catchAsync(async (req, res) => {
  ok(res, await svc.setUserStatus(req.params.id as string, req.body.status, requireAuth(req).userId));
});

export const resetPassword = catchAsync(async (req, res) => {
  const { temporaryPassword } = await svc.resetUserPassword(req.params.id as string);
  ok(res, { temporaryPassword });
});
