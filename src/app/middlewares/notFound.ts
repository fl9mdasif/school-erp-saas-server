import type { RequestHandler } from 'express';
import { AppError } from '../errors/AppError';

export const notFound: RequestHandler = (req, _res, next) => {
  next(AppError.notFound(`Route not found: ${req.method} ${req.path}`, 'ROUTE_NOT_FOUND'));
};
