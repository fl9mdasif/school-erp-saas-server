import { Tenant } from '../tenant/tenant.model';
import { checkSlugFormat, normalizeSlug } from './slug.helper';

export interface SlugCheck {
  normalized: string;
  available: boolean;
  reason?: 'SLUG_INVALID' | 'SLUG_RESERVED' | 'SLUG_TAKEN';
}

export const isSlugTaken = async (slug: string): Promise<boolean> => {
  const hit = await Tenant.exists({ $or: [{ slug }, { 'slugAliases.slug': slug }] });
  return !!hit;
};

export const checkSlug = async (input: string): Promise<SlugCheck> => {
  const normalized = normalizeSlug(input);
  const problem = checkSlugFormat(normalized);
  if (problem) return { normalized, available: false, reason: problem };
  if (await isSlugTaken(normalized)) return { normalized, available: false, reason: 'SLUG_TAKEN' };
  return { normalized, available: true };
};
