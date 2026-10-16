import { AppError } from '../../errors/AppError';
import { escapeRegex, toSkip, type PageParams } from '../../lib/pagination';
import { requireTenantId } from '../../lib/tenantContext';
import { Inquiry } from '../inquiry/inquiry.model';
import { Notice } from '../notice/notice.model';
import { Plan } from '../plan/plan.model';
import { PublicSite } from '../publicSite/publicSite.model';
import { StaffProfile } from '../staffProfile/staffProfile.model';
import { Tenant } from '../tenant/tenant.model';

/** An unpublished site does not exist as far as the public is concerned. */
const publishedSite = async () => {
  const site = await PublicSite.findOne({ isPublished: true }).lean();
  if (!site) throw AppError.notFound('School website not found', 'SCHOOL_NOT_FOUND');
  return site;
};

export const getSite = async () => {
  const site = await publishedSite();
  const tenant = await Tenant.findById(requireTenantId())
    .select('name nameBn slug institutionType logoUrl contact.district contact.upazila settings.resultLookupMode')
    .lean();
  const v = site.sectionsVisible ?? {};
  return {
    school: {
      name: tenant?.name,
      nameBn: tenant?.nameBn,
      slug: tenant?.slug,
      type: tenant?.institutionType,
      logoUrl: tenant?.logoUrl,
      district: tenant?.contact?.district,
      upazila: tenant?.contact?.upazila,
    },
    theme: site.theme,
    hero: site.hero,
    about: v.about === false ? undefined : site.about,
    mission: v.about === false ? undefined : site.mission,
    headMessage: site.headMessage,
    admissionInfo: v.admission === false ? undefined : site.admissionInfo,
    contact: site.contact,
    gallery: v.gallery === false ? [] : site.gallery,
    social: site.social,
    seo: site.seo,
    sectionsVisible: site.sectionsVisible,
    resultLookupMode: (tenant as any)?.settings?.resultLookupMode ?? 'roll_dob',
  };
};

export const listPublicNotices = async (page: PageParams) => {
  await publishedSite();
  const now = new Date();
  const filter = {
    isPublic: true,
    status: 'published',
    publishAt: { $lte: now },
    $or: [{ expiresAt: { $exists: false } }, { expiresAt: null }, { expiresAt: { $gt: now } }],
  };
  const [rows, total] = await Promise.all([
    Notice.find(filter)
      .select('title body attachments publishAt')
      .sort({ publishAt: -1 })
      .skip(toSkip(page))
      .limit(page.limit)
      .lean(),
    Notice.countDocuments(filter),
  ]);
  return { rows, total };
};

export const listPublicStaff = async () => {
  await publishedSite();
  return StaffProfile.find({ showOnPublicSite: true })
    .select('name designation photoUrl bio order')
    .sort({ order: 1, name: 1 })
    .lean();
};

export const submitInquiry = async (input: {
  name: string;
  phone: string;
  message?: string;
  classInterest?: string;
  website?: string;
}) => {
  await publishedSite();
  // Honeypot: real visitors never see this field. Bots that fill it get a normal-looking reply and nothing is stored.
  if (input.website) return { received: true };
  await Inquiry.create({
    name: input.name,
    phone: input.phone,
    message: input.message,
    classInterest: input.classInterest,
  });
  return { received: true };
};

export const publicPlans = () =>
  Plan.find({ isActive: true })
    .select('slug name monthlyPrice yearlyPrice yearlyDiscount trialDays isPopular features notIncluded')
    .sort({ monthlyPrice: 1 })
    .lean();

export const findSchools = async (q: string) => {
  const re = new RegExp(escapeRegex(q), 'i');
  const rows = await Tenant.find({ status: { $in: ['trial', 'active'] }, $or: [{ name: re }, { slug: re }] })
    .select('name slug contact.district')
    .limit(10)
    .lean();
  return rows.map((t: any) => ({ name: t.name, slug: t.slug, district: t.contact?.district }));
};
