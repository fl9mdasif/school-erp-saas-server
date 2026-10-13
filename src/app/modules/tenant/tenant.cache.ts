import { Types } from 'mongoose';
import { Tenant } from './tenant.model';
import type { TenantStatus } from './tenant.interface';

const TTL_MS = 15_000;
const GRACE_DAYS = 7;
const cache = new Map<string, { status: TenantStatus; at: number }>();

/** A trial that ended more than 7 days ago counts as suspended even if nobody has flipped the flag yet. */
export const effectiveStatus = (
  t: { status: TenantStatus; trialEndsAt: Date },
  now = new Date(),
): TenantStatus => {
  if (t.status === 'trial' && now.getTime() > t.trialEndsAt.getTime() + GRACE_DAYS * 86_400_000)
    return 'suspended';
  return t.status;
};

export const getTenantStatus = async (tenantId: Types.ObjectId): Promise<TenantStatus | null> => {
  const key = tenantId.toString();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.status;
  const t = await Tenant.findById(tenantId).select('status trialEndsAt').lean();
  if (!t) return null;
  const status = effectiveStatus(t);
  cache.set(key, { status, at: Date.now() });
  return status;
};

export const invalidateTenantStatus = (tenantId?: Types.ObjectId) => {
  if (tenantId) cache.delete(tenantId.toString());
  else cache.clear();
};
