import type { RequestHandler } from 'express';
import { AppError } from '../errors/AppError';
import { setContext, type Role } from '../lib/tenantContext';
import { verifyAccessToken } from '../modules/auth/token';
import { PlatformAdmin } from '../modules/platform/platformAdmin.model';
import { getTenantStatus } from '../modules/tenant/tenant.cache';
import { User } from '../modules/user/user.model';

type PlatformMode = 'deny' | 'allow' | 'only';

const READ_ONLY_EXEMPT = ['/api/v1/auth/change-password', '/api/v1/auth/logout', '/api/v1/auth/refresh'];

/**
 * Verifies the access token and sets the request context. The tenant comes ONLY from the token.
 * platform: 'deny' (tenant routes), 'allow' (shared routes such as /auth/me), 'only' (/platform routes).
 */
export const authenticate =
  (platform: PlatformMode = 'deny'): RequestHandler =>
  async (req, _res, next) => {
    try {
      const header = req.header('authorization');
      if (!header?.startsWith('Bearer ')) throw AppError.unauthorized();

      let payload;
      try {
        payload = verifyAccessToken(header.slice(7));
      } catch {
        throw AppError.unauthorized('Session expired', 'TOKEN_INVALID');
      }
      const isPlatform = payload.typ === 'platform';
      if (isPlatform && platform === 'deny') throw AppError.forbidden();
      if (!isPlatform && platform === 'only') throw AppError.forbidden();

      if (isPlatform) {
        const admin = await PlatformAdmin.findById(payload.sub).select('status').lean();
        if (!admin || admin.status !== 'active')
          throw AppError.unauthorized('Session expired', 'TOKEN_INVALID');
        req.auth = { userId: admin._id, role: 'superAdmin', isPlatform: true };
        setContext({ userId: admin._id, role: 'superAdmin' });
        return next();
      }

      if (!payload.tid) throw AppError.unauthorized('Session expired', 'TOKEN_INVALID');
      const tenantId = new (await import('mongoose')).Types.ObjectId(payload.tid);
      const userId = new (await import('mongoose')).Types.ObjectId(payload.sub);
      setContext({ tenantId, userId });

      const user = await User.findById(userId).select('status role').lean();
      if (!user || user.status !== 'active') throw AppError.unauthorized('Session expired', 'TOKEN_INVALID');

      const status = await getTenantStatus(tenantId);
      if (!status || status === 'cancelled')
        throw AppError.forbidden('This institution account is closed', 'TENANT_SUSPENDED');
      if (status === 'suspended') {
        if (user.role !== 'admin')
          throw AppError.forbidden('This institution is suspended', 'TENANT_SUSPENDED');
        const safe = ['GET', 'HEAD', 'OPTIONS'].includes(req.method);
        if (!safe && !READ_ONLY_EXEMPT.includes(req.originalUrl.split('?')[0])) {
          throw AppError.forbidden(
            'Account is in read-only mode until the subscription is renewed',
            'TENANT_SUSPENDED',
          );
        }
      }

      req.auth = { userId, tenantId, role: user.role as Role, isPlatform: false };
      setContext({ role: user.role as Role });
      next();
    } catch (err) {
      next(err);
    }
  };

export const roleGuard =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.auth) return next(AppError.unauthorized());
    if (!roles.includes(req.auth.role)) return next(AppError.forbidden());
    next();
  };

/** Platform console routes: superAdmin only, no tenant scoping (the one place unscoped access is allowed). */
export const platformGuard: RequestHandler[] = [
  authenticate('only'),
  (_req, _res, next) => {
    setContext({ unscoped: true });
    next();
  },
];
