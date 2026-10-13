import { Router } from 'express';
import { idParams } from '../../lib/objectId';
import { authenticate, roleGuard } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { guardianInput } from './student.validation';
import * as c from './student.controller';
import * as v from './student.validation';
import { ROLE } from '../../lib/roles';

const router = Router();
router.use(authenticate());

const readers = roleGuard(ROLE.ADMIN, ROLE.ACCOUNTANT, ROLE.TEACHER, ROLE.STUDENT, ROLE.GUARDIAN);
const admin = roleGuard(ROLE.ADMIN);

router.get(
  '/',
  roleGuard(ROLE.ADMIN, ROLE.ACCOUNTANT, ROLE.TEACHER),
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
me.get('/students', roleGuard(ROLE.STUDENT, ROLE.GUARDIAN), c.mine);
export const meRoutes = me;
