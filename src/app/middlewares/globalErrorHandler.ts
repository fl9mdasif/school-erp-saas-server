import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors/AppError';
import { logger } from '../lib/logger';
import { env } from '../config/env';

export const globalErrorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Something went wrong';
  let details: unknown;

  if (err instanceof AppError) {
    status = err.statusCode;
    code = err.code;
    message = err.message;
    details = err.details;
  } else if (err instanceof ZodError) {
    status = 400;
    code = 'VALIDATION_ERROR';
    message = 'Request validation failed';
    details = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
  } else if (err?.code === 11000) {
    status = 409;
    code = 'DUPLICATE';
    message = 'A record with the same unique value already exists';
    details = err.keyPattern ? { fields: Object.keys(err.keyPattern) } : undefined;
  } else if (err?.name === 'CastError') {
    status = 400;
    code = 'VALIDATION_ERROR';
    message = 'Invalid identifier or value';
  } else if (err?.type === 'entity.parse.failed') {
    status = 400;
    code = 'VALIDATION_ERROR';
    message = 'Malformed JSON body';
  } else if (err?.type === 'entity.too.large') {
    status = 413;
    code = 'PAYLOAD_TOO_LARGE';
    message = 'Request body too large';
  } else if (typeof err?.message === 'string' && err.message.startsWith('TENANT_CONTEXT_MISSING')) {
    status = 500;
    code = 'TENANT_CONTEXT_MISSING';
  }

  if (status >= 500) logger.error({ err }, 'unhandled error');

  res.status(status).json({
    success: false,
    code,
    message,
    ...(details ? { details } : {}),
    ...(!env.isProd && status >= 500 ? { stack: err?.stack } : {}),
  });
};
