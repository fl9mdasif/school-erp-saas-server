import type { CookieOptions, Request, Response } from 'express';
import { env } from '../../config/env';
import { AppError } from '../../errors/AppError';
import { catchAsync } from '../../lib/catchAsync';
import { created, ok } from '../../lib/sendResponse';
import { requireAuth } from '../../lib/requireAuth';
import { registerInstitution } from './auth.register.service';
import { requestPasswordReset, resetPassword } from './auth.recovery.service';
import { changePassword, getMe, loginPlatformAdmin, loginUser, refreshSession } from './auth.service';
import { revokeByToken, type IssuedSession } from './session.service';
import { checkSlug } from '../slug/slug.service';
import { REFRESH_COOKIE } from './token';

const cookieOptions = (maxAge?: number): CookieOptions => ({
  httpOnly: true,
  secure: env.cookieSecure,
  sameSite: 'lax',
  path: '/api/v1/auth',
  ...(maxAge ? { maxAge } : {}),
});

const sendSession = (res: Response, s: IssuedSession) => {
  res.cookie(REFRESH_COOKIE, s.refreshToken, cookieOptions(s.refreshMaxAgeMs));
  return { accessToken: s.accessToken };
};

const ua = (req: Request) => req.header('user-agent');

export const slugAvailable = catchAsync(async (req, res) => {
  ok(res, await checkSlug(String(req.query.slug)));
});

export const register = catchAsync(async (req, res) => {
  const r = await registerInstitution(req.body, ua(req));
  created(res, { tenant: r.tenant, ...sendSession(res, r.session) });
});

export const login = catchAsync(async (req, res) => {
  const r = await loginUser(req.body, ua(req));
  ok(res, { user: r.user, ...sendSession(res, r.session) });
});

export const platformLogin = catchAsync(async (req, res) => {
  const r = await loginPlatformAdmin(req.body, ua(req));
  ok(res, { user: r.user, ...sendSession(res, r.session) });
});

export const refresh = catchAsync(async (req, res) => {
  // Custom header requirement: a cross-site form post cannot set it, which blocks CSRF on the cookie endpoint.
  if (!req.header('x-requested-with'))
    throw AppError.forbidden('Missing X-Requested-With header', 'CSRF_BLOCKED');
  const token = req.cookies?.[REFRESH_COOKIE];
  if (!token) throw AppError.unauthorized('Session expired, please sign in again', 'SESSION_INVALID');
  try {
    ok(res, sendSession(res, await refreshSession(token, ua(req))));
  } catch (err) {
    res.clearCookie(REFRESH_COOKIE, cookieOptions());
    throw err;
  }
});

export const logout = catchAsync(async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (token) await revokeByToken(token);
  res.clearCookie(REFRESH_COOKIE, cookieOptions());
  ok(res, { loggedOut: true });
});

export const me = catchAsync(async (req, res) => {
  ok(res, await getMe(requireAuth(req)));
});

export const changePasswordHandler = catchAsync(async (req, res) => {
  const s = await changePassword(requireAuth(req), req.body, ua(req));
  ok(res, sendSession(res, s));
});

export const forgotPassword = catchAsync(async (req, res) => {
  await requestPasswordReset(req.body);
  ok(res, { message: 'If that account exists, a reset link has been sent' });
});

export const resetPasswordHandler = catchAsync(async (req, res) => {
  await resetPassword(req.body);
  ok(res, { message: 'Password updated. Please sign in.' });
});
