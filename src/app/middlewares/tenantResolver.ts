import type { RequestHandler } from 'express';
import { AppError } from '../errors/AppError';
import { setContext } from '../lib/tenantContext';
import { findTenantBySlug } from '../modules/auth/auth.service';
import { effectiveStatus } from '../modules/tenant/tenant.cache';
import { normalizeSlug } from '../modules/slug/slug.helper';

/**
 * Public routes: tenant comes from the :slug path segment (a verified custom domain is not part of v1).
 * Suspended tenants stay online (parents must reach results); cancelled tenants disappear.
 */
export const tenantResolver: RequestHandler = async (req, _res, next) => {
  try {
    const raw = String(req.params.slug ?? '');
    const tenant = await findTenantBySlug(raw);
    if (!tenant) throw AppError.notFound('School not found', 'SCHOOL_NOT_FOUND');
    const status = effectiveStatus(tenant);
    if (status === 'cancelled') throw AppError.notFound('School not found', 'SCHOOL_NOT_FOUND');
    req.tenant = {
      id: tenant._id,
      slug: tenant.slug,
      name: tenant.name,
      status,
      redirectedFromAlias: normalizeSlug(raw) !== tenant.slug,
    };
    setContext({ tenantId: tenant._id });
    next();
  } catch (err) {
    next(err);
  }
};
