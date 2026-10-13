import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import { loginLimiter, registerLimiter, slugCheckLimiter } from '../../middlewares/rateLimit';
import { validateRequest } from '../../middlewares/validateRequest';
import * as c from './auth.controller';
import * as v from './auth.validation';

const router = Router();

router.get(
  '/slug-available',
  slugCheckLimiter,
  validateRequest({ query: v.slugAvailableQuery }),
  c.slugAvailable,
);
router.post(
  '/register-institution',
  registerLimiter,
  validateRequest({ body: v.registerInstitutionBody }),
  c.register,
);
router.post('/login', loginLimiter, validateRequest({ body: v.loginBody }), c.login);
router.post('/refresh', c.refresh);
router.post('/logout', c.logout);
router.get('/me', authenticate('allow'), c.me);
router.post(
  '/change-password',
  authenticate('allow'),
  validateRequest({ body: v.changePasswordBody }),
  c.changePasswordHandler,
);
router.post(
  '/forgot-password',
  loginLimiter,
  validateRequest({ body: v.forgotPasswordBody }),
  c.forgotPassword,
);
router.post(
  '/reset-password',
  loginLimiter,
  validateRequest({ body: v.resetPasswordBody }),
  c.resetPasswordHandler,
);

export const authRoutes = router;
