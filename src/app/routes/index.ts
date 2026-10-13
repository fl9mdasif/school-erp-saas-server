import { Router } from 'express';
import { authRoutes } from '../modules/auth/auth.route';
import { schoolRoutes } from '../modules/tenant/school.route';
import { sessionRoutes } from '../modules/academicSession/academicSession.route';
import { classRoutes } from '../modules/class/class.route';
import { sectionRoutes } from '../modules/section/section.route';
import { subjectRoutes } from '../modules/subject/subject.route';
import { classSubjectRoutes } from '../modules/classSubject/classSubject.route';
import '../modules/student/student.hooks';
import { studentImportRoutes } from '../modules/studentImport/studentImport.route';
import { promotionRoutes } from '../modules/promotion/promotion.route';
import { meRoutes, studentRoutes } from '../modules/student/student.route';
import { attendanceRoutes } from '../modules/attendance/attendance.route';
import { noticeRoutes } from '../modules/notice/notice.route';
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

apiRouter.use('/class-subjects', classSubjectRoutes);
apiRouter.use('/students/import', studentImportRoutes);
apiRouter.use('/students/promote', promotionRoutes);
apiRouter.use('/students', studentRoutes);
apiRouter.use('/me', meRoutes);
apiRouter.use('/attendance', attendanceRoutes);
apiRouter.use('/notices', noticeRoutes);
