import { AppError } from '../../errors/AppError';
import { writeAudit } from '../auditLog/auditLog.model';
import { Tenant } from '../tenant/tenant.model';
import { requireTenantId } from '../../lib/tenantContext';
import { PRESETS } from '../tenant/tenant.presets';
import { PublicSite } from './publicSite.model';

/** The site document is created on first access with defaults from the institution type. */
export const getOrCreateSite = async () => {
  const existing = await PublicSite.findOne({});
  if (existing) return existing;
  const tenant = await Tenant.findById(requireTenantId()).lean();
  if (!tenant) throw AppError.notFound('Institution not found');
  try {
    return await PublicSite.create({
      theme: { template: PRESETS[tenant.institutionType].publicTemplate },
      hero: { title: tenant.name },
      contact: { phone: tenant.contact.phone, email: tenant.contact.email, address: tenant.contact.address },
    });
  } catch (err: any) {
    if (err?.code === 11000) return (await PublicSite.findOne({}))!;
    throw err;
  }
};

export const updateSite = async (patch: Record<string, any>) => {
  const site = await getOrCreateSite();
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    // Objects are merged one level deep so a partial update does not wipe sibling fields.
    if (v && typeof v === 'object' && !Array.isArray(v))
      site.set(k, { ...(site.get(k)?.toObject?.() ?? site.get(k) ?? {}), ...v });
    else site.set(k, v);
  }
  await site.save();
  await writeAudit({
    action: 'site.update',
    entityType: 'PublicSite',
    entityId: site._id,
    after: { fields: Object.keys(patch) },
  });
  return site;
};

export const setPublished = async (published: boolean) => {
  const site = await getOrCreateSite();
  site.isPublished = published;
  await site.save();
  await writeAudit({
    action: published ? 'site.publish' : 'site.unpublish',
    entityType: 'PublicSite',
    entityId: site._id,
  });
  return site;
};
