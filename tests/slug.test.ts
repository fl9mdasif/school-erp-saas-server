import { describe, expect, it } from 'vitest';
import { checkSlugFormat, normalizeSlug } from '../src/app/modules/slug/slug.helper';

describe('slug', () => {
  it('normalizes camelCase, spaces, underscores and repeated hyphens', () => {
    expect(normalizeSlug('brightModel')).toBe('bright-model');
    expect(normalizeSlug('  Bright   Model  ')).toBe('bright-model');
    expect(normalizeSlug('bright__model--school')).toBe('bright-model-school');
    expect(normalizeSlug('BrightModelSchool')).toBe('bright-model-school');
  });
  it('rejects bad formats and reserved words', () => {
    expect(checkSlugFormat('ab')).toBe('SLUG_INVALID');
    expect(checkSlugFormat('bright model!')).toBe('SLUG_INVALID');
    expect(checkSlugFormat('admin')).toBe('SLUG_RESERVED');
    expect(checkSlugFormat('login')).toBe('SLUG_RESERVED');
    expect(checkSlugFormat('a'.repeat(41))).toBe('SLUG_INVALID');
    expect(checkSlugFormat('bright-model')).toBeNull();
  });
});
