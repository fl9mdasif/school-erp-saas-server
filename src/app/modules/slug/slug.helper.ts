import { env } from '../../config/env';

export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const RESERVED_SLUGS = [
  'admin',
  'api',
  'app',
  'auth',
  'blog',
  'dashboard',
  'docs',
  'help',
  'internal',
  'login',
  'logout',
  'platform',
  'pricing',
  'register',
  'schools',
  'signup',
  'static',
  'support',
  'www',
];

/** trim, split camelCase, lowercase, spaces/underscores to hyphens, collapse repeated hyphens. */
export const normalizeSlug = (input: string): string =>
  input
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

export type SlugProblem = 'SLUG_INVALID' | 'SLUG_RESERVED' | null;

export const checkSlugFormat = (normalized: string): SlugProblem => {
  if (normalized.length < 3 || normalized.length > 40 || !SLUG_RE.test(normalized)) return 'SLUG_INVALID';
  if (RESERVED_SLUGS.includes(normalized) || env.reservedSlugs.includes(normalized)) return 'SLUG_RESERVED';
  return null;
};
