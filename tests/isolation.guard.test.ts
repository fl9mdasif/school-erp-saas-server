import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import '../src/app/models';
import { PLATFORM_MODELS } from '../src/app/plugins/createTenantSchema';
import { glob } from './helpers/files';

const files = glob(join(process.cwd(), 'src'), '.ts');
const text = (f: string) => readFileSync(f, 'utf8');

describe('isolation guard: static rules', () => {
  it('unscoped access appears only in platform code, jobs, scripts, auth/tenant bootstrap and the plugin layer', () => {
    const allowed = [
      /[\\/]modules[\\/](platform|auth|tenant|auditLog|publicApi|publicResult|publicSite)[\\/]/,
      /[\\/](jobs|scripts|plugins|middlewares)[\\/]/,
      /tenantContext\.ts$/,
    ];
    const offenders = files.filter(
      (f) => /\.unscoped\(\)|runUnscoped\(/.test(text(f)) && !allowed.some((re) => re.test(f)),
    );
    expect(offenders).toEqual([]);
  });

  it('the tenant key is always tenantId, never schoolId', () => {
    expect(files.filter((f) => /\bschoolId\b/.test(text(f)))).toEqual([]);
  });
});

describe('isolation guard: registered models', () => {
  it('every model is tenant scoped unless it is a listed platform model', () => {
    for (const [name, model] of Object.entries(mongoose.models)) {
      if (PLATFORM_MODELS.includes(name)) continue;
      expect(model.schema.path('tenantId'), `${name} must be tenant scoped`).toBeTruthy();
    }
  });

  it('an unscoped query throws on every tenant model', async () => {
    for (const [name, model] of Object.entries(mongoose.models)) {
      if (PLATFORM_MODELS.includes(name) || !model.schema.path('tenantId')) continue;
      await expect(model.find({}), `${name}`).rejects.toThrow(/TENANT_CONTEXT_MISSING/);
    }
  });
});
