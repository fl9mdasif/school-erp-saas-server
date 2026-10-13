import { Router } from 'express';
import { idParams } from '../../lib/objectId';
import { authenticate, roleGuard } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { guardianInput } from './student.validation';
import * as c from './student.controller';
import * as v from './student.validation';

const router = Router();
router.use(authenticate());

const readers = roleGuard('admin', 'accountant', 'teacher', 'student', 'guardian');
const admin = roleGuard('admin');

router.get(
  '/',
  roleGuard('admin', 'accountant', 'teacher'),
  validateRequest({ query: v.listStudentsQuery }),
  c.list,
);
router.post('/', admin, validateRequest({ body: v.createStudentBody }), c.create);
router.get('/:id', readers, validateRequest({ params: idParams }), c.get);
router.patch('/:id', admin, validateRequest({ params: idParams, body: v.updateStudentBody }), c.update);
router.patch(
  '/:id/status',
  admin,
  validateRequest({ params: idParams, body: v.studentStatusBody }),
  c.setStatus,
);
router.patch(
  '/:id/enrolment',
  admin,
  validateRequest({ params: idParams, body: v.enrolmentChangeBody }),
  c.changeEnrolment,
);
router.delete('/:id', admin, validateRequest({ params: idParams }), c.remove);
router.post(
  '/:id/guardians',
  admin,
  validateRequest({ params: idParams, body: guardianInput }),
  c.attachGuardian,
);
router.post(
  '/:id/create-login',
  admin,
  validateRequest({ params: idParams, body: v.createLoginBody }),
  c.createLogin,
);

export const studentRoutes = router;

/** Student and guardian self-service. */
const me = Router();
me.use(authenticate());
me.get('/students', roleGuard('student', 'guardian'), c.mine);
export const meRoutes = me;
