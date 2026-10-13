import { Router } from 'express';
import { authRoutes } from '../modules/auth/auth.route';
import { platformAuthRoutes } from '../modules/platform/platform.auth.route';

/** Versioned API router. Modules mount here as they are built. */
export const apiRouter = Router();

apiRouter.use('/auth', authRoutes);
apiRouter.use('/platform', platformAuthRoutes);
