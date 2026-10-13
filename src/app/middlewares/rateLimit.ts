import { rateLimit } from 'express-rate-limit';
import { env } from '../config/env';

const json = (code: string, message: string) => ({ success: false, code, message });

const make = (windowMs: number, limit: number, message = 'Too many requests, slow down') =>
  rateLimit({
    windowMs,
    limit: env.isTest ? 10000 : limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: json('RATE_LIMITED', message),
  });

export const globalLimiter = make(60_000, 300);
export const loginLimiter = make(15 * 60_000, 10, 'Too many login attempts, try again later');
export const registerLimiter = make(60 * 60_000, 10);
export const slugCheckLimiter = make(60_000, 30);
export const inquiryLimiter = make(60 * 60_000, 5, 'Too many submissions, try again later');
export const resultLookupMinuteLimiter = make(60_000, 10, 'Too many requests, try again shortly');
export const resultLookupHourLimiter = make(60 * 60_000, 60, 'Too many requests, try again later');
export const publicLimiter = make(60_000, 120);
