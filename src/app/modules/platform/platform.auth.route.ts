import { Router } from 'express';
import { loginLimiter } from '../../middlewares/rateLimit';
import { validateRequest } from '../../middlewares/validateRequest';
import { platformLogin } from '../auth/auth.controller';
import { platformLoginBody } from '../auth/auth.validation';

const router = Router();
router.post('/auth/login', loginLimiter, validateRequest({ body: platformLoginBody }), platformLogin);

export const platformAuthRoutes = router;
