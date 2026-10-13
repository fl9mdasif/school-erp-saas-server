import { describe, expect, it } from 'vitest';
import { verifyPassword } from '../src/app/lib/password';
import { ensureSuperAdmin } from '../src/app/modules/platform/platform.seed';
import { PlatformAdmin } from '../src/app/modules/platform/platformAdmin.model';
import { useTestDb } from './helpers/db';

useTestDb();

describe('seed super admin', () => {
  it('creates once with an argon2id hash and is idempotent', async () => {
    const first = await ensureSuperAdmin('Owner@Test.local', 'OwnerPass123!');
    const second = await ensureSuperAdmin('owner@test.local', 'DifferentPass999!');
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    const doc = await PlatformAdmin.findOne({ email: 'owner@test.local' }).select('+passwordHash');
    expect(doc?.passwordHash.startsWith('$argon2id$')).toBe(true);
    expect(await verifyPassword(doc!.passwordHash, 'OwnerPass123!')).toBe(true);
    expect(await verifyPassword(doc!.passwordHash, 'DifferentPass999!')).toBe(false);
  });
});
