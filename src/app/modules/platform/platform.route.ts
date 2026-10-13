import { Router } from 'express';
import { validateRequest } from '../../middlewares/validateRequest';
import * as c from './platform.controller';
import * as v from './platform.validation';

const router = Router();

router.get('/tenants', validateRequest({ query: v.listTenantsQuery }), c.listTenants);
router.get('/tenants/:id', validateRequest({ params: v.tenantIdParams }), c.tenantDetail);
router.patch(
  '/tenants/:id/status',
  validateRequest({ params: v.tenantIdParams, body: v.tenantStatusBody }),
  c.tenantStatus,
);
router.patch(
  '/tenants/:id/plan',
  validateRequest({ params: v.tenantIdParams, body: v.tenantPlanBody }),
  c.tenantPlan,
);
router.patch(
  '/tenants/:id/slug',
  validateRequest({ params: v.tenantIdParams, body: v.tenantSlugBody }),
  c.tenantSlug,
);
router.post(
  '/tenants/:id/subscription-payments',
  validateRequest({ params: v.tenantIdParams, body: v.subscriptionPaymentBody }),
  c.subscriptionPayment,
);

router.get('/plans', c.plans);
router.post('/plans', validateRequest({ body: v.createPlanBody }), c.createPlan);
router.patch(
  '/plans/:id',
  validateRequest({ params: v.tenantIdParams, body: v.updatePlanBody }),
  c.updatePlan,
);

router.get('/stats', c.stats);

export const platformRoutes = router;
