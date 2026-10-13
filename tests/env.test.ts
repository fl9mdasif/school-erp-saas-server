import { describe, expect, it, vi } from 'vitest';

describe('env loader', () => {
  it('refuses to boot with an invalid environment', async () => {
    vi.resetModules();
    const saved = process.env.JWT_ACCESS_SECRET;
    process.env.JWT_ACCESS_SECRET = 'short';
    await expect(import('../src/app/config/env.js')).rejects.toThrow(/Invalid environment configuration/);
    process.env.JWT_ACCESS_SECRET = saved;
  });
});

