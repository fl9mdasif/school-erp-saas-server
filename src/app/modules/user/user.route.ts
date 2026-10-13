import { Router } from 'express';
import { authenticate, roleGuard } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import * as c from './user.controller';
import * as v from './user.validation';
import { ROLE } from '../../lib/roles';

const router = Router();
router.use(authenticate(), roleGuard(ROLE.ADMIN));

router.get('/', validateRequest({ query: v.listUsersQuery }), c.list);
router.post('/', validateRequest({ body: v.createUserBody }), c.create);
router.get('/:id', validateRequest({ params: v.userIdParams }), c.get);
router.patch('/:id', validateRequest({ params: v.userIdParams, body: v.updateUserBody }), c.update);
router.patch('/:id/status', validateRequest({ params: v.userIdParams, body: v.statusBody }), c.setStatus);
router.post('/:id/reset-password', validateRequest({ params: v.userIdParams }), c.resetPassword);

export const userRoutes = router;
