import { catchAsync } from '../../lib/catchAsync';
import { buildMeta } from '../../lib/pagination';
import { requireAuth } from '../../lib/requireAuth';
import { created, ok } from '../../lib/sendResponse';
import * as svc from './platform.service';

const id = (req: any) => req.params.id as string;

export const listTenants = catchAsync(async (req, res) => {
  const { page, limit, ...f } = req.query as any;
  const { rows, total } = await svc.listTenants({ page, limit }, f);
  ok(res, rows, buildMeta({ page, limit }, total));
});
export const tenantDetail = catchAsync(async (req, res) => ok(res, await svc.getTenantDetail(id(req))));
export const tenantStatus = catchAsync(async (req, res) =>
  ok(res, await svc.setTenantStatus(id(req), requireAuth(req).userId, req.body)),
);
export const tenantPlan = catchAsync(async (req, res) =>
  ok(res, await svc.setTenantPlan(id(req), requireAuth(req).userId, req.body)),
);
export const tenantSlug = catchAsync(async (req, res) =>
  ok(res, await svc.changeSlug(id(req), requireAuth(req).userId, req.body)),
);
export const subscriptionPayment = catchAsync(async (req, res) =>
  created(res, await svc.recordSubscriptionPayment(id(req), requireAuth(req).userId, req.body)),
);
export const plans = catchAsync(async (_req, res) => ok(res, await svc.listPlans()));
export const createPlan = catchAsync(async (req, res) => created(res, await svc.createPlan(req.body)));
export const updatePlan = catchAsync(async (req, res) => ok(res, await svc.updatePlan(id(req), req.body)));
export const stats = catchAsync(async (_req, res) => ok(res, await svc.getStats()));
