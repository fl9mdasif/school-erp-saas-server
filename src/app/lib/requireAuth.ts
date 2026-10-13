import type { Request } from 'express';
import { AppError } from '../errors/AppError';

export const requireAuth = (req: Request) => {
  if (!req.auth) throw AppError.unauthorized();
  return req.auth;
};
