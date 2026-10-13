import pino from 'pino';
import { env } from '../config/env';
import { getContext } from './tenantContext';

export const logger = pino({
  level: env.LOG_LEVEL ?? (env.isTest ? 'silent' : env.isProd ? 'info' : 'debug'),
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.password',
      '*.passwordHash',
      '*.token',
      '*.phone',
      '*.birthRegistrationNo',
    ],
    censor: '[redacted]',
  },
  mixin() {
    const c = getContext();
    return c ? { requestId: c.requestId, tenantId: c.tenantId?.toString(), userId: c.userId?.toString() } : {};
  },
  transport: env.isProd || env.isTest ? undefined : { target: 'pino-pretty', options: { colorize: true } },
});
