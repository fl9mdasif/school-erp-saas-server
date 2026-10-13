import { Router } from 'express';
import { authRoutes } from '../modules/auth/auth.route';
import { schoolRoutes } from '../modules/tenant/school.route';
import { sessionRoutes } from '../modules/academicSession/academicSession.route';
import { classRoutes } from '../modules/class/class.route';
import { sectionRoutes } from '../modules/section/section.route';
import { subjectRoutes } from '../modules/subject/subject.route';
import { userRoutes } from '../modules/user/user.route';
import { platformAuthRoutes } from '../modules/platform/platform.auth.route';
import { platformRoutes } from '../modules/platform/platform.route';
import { platformGuard } from '../middlewares/auth';

/** Versioned API router. Modules mount here as they are built. */
export const apiRouter = Router();

apiRouter.use('/auth', authRoutes);
apiRouter.use('/platform', platformAuthRoutes);
apiRouter.use('/platform', ...platformGuard, platformRoutes);
apiRouter.use('/users', userRoutes);
apiRouter.use('/school', schoolRoutes);
apiRouter.use('/sessions', sessionRoutes);
apiRouter.use('/classes', classRoutes);
apiRouter.use('/sections', sectionRoutes);
apiRouter.use('/subjects', subjectRoutes);

