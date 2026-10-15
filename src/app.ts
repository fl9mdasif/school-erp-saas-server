import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { env } from './app/config/env';
import { logger } from './app/lib/logger';
import { getContext } from './app/lib/tenantContext';
import { globalErrorHandler } from './app/middlewares/globalErrorHandler';
import { notFound } from './app/middlewares/notFound';
import { globalLimiter } from './app/middlewares/rateLimit';
import { requestId } from './app/middlewares/requestId';
import { sanitize } from './app/middlewares/sanitize';
import { healthRoutes } from './app/modules/health/health.route';
import { apiRouter } from './app/routes';

export const createApp = () => {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      genReqId: () => getContext()?.requestId ?? '',
      customProps: () => {
        const c = getContext();
        return { tenantId: c?.tenantId?.toString(), userId: c?.userId?.toString() };
      },
      serializers: {
        req: (r) => ({ id: r.id, method: r.method, url: String(r.url).split('?')[0] }),
        res: (r) => ({ statusCode: r.statusCode }),
      },
    }),
  );
  app.use(helmet());
  app.use(globalLimiter);

  const allowed = new Set(env.corsOrigins);
  const publicCors = cors({ origin: true, credentials: false });
  const privateCors = cors({
    origin: (origin, cb) => cb(null, !origin || allowed.has(origin)),
    credentials: true,
  });
  app.use('/api/v1/public', publicCors);
  app.use((req, res, next) => (req.path.startsWith('/api/v1/public') ? next() : privateCors(req, res, next)));

  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(sanitize);

  app.use('/api/v1', healthRoutes);
  app.use('/api/v1', apiRouter);

  app.get('/', (req, res) => {
    res.json({ message: 'School Management API Running' });
  })

  app.use(notFound);
  app.use(globalErrorHandler);
  return app;
};
