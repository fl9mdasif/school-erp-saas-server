import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import '../src/app/models';
import { runAsTenant } from '../src/app/lib/tenantContext';
import { User } from '../src/app/modules/user/user.model';
import { Tenant } from '../src/app/modules/tenant/tenant.model';
import { invalidateTenantStatus } from '../src/app/modules/tenant/tenant.cache';
import { agent, authed, login, registerTenant } from './helpers/api';
import { useTestDb } from './helpers/db';
import { addUser } from './helpers/users';

useTestDb();

const setStatus = async (tenantId: string, status: string) => {
  await Tenant.updateOne({ _id: tenantId }, { $set: { status } });
  invalidateTenantStatus(new Types.ObjectId(tenantId));
};

describe('tenant status rules', () => {
  it('suspended: teachers cannot sign in, admin can (read only)', async () => {
    const t = await registerTenant();
    await addUser(t.tenantId, { role: 'teacher', email: 'teach@example.com' });
    await setStatus(t.tenantId, 'suspended');

    const teacher = await login(t.slug, 'teach@example.com', 'Passw0rd!long');
    expect(teacher.status).toBe(403);
    expect(teacher.body.code).toBe('TENANT_SUSPENDED');

    const admin = await login(t.slug, t.email, t.password);
    expect(admin.status).toBe(200);
    const me = await agent().get('/api/v1/auth/me').set(authed(admin.body.data.accessToken));
    expect(me.status).toBe(200);
    expect(me.body.data.tenant.status).toBe('suspended');
  });

  it('suspended: an already-issued teacher token stops working', async () => {
    const t = await registerTenant();
    await addUser(t.tenantId, { role: 'teacher', email: 'teach2@example.com' });
    const tok = (await login(t.slug, 'teach2@example.com', 'Passw0rd!long')).body.data.accessToken;
    expect((await agent().get('/api/v1/auth/me').set(authed(tok))).status).toBe(200);
    await setStatus(t.tenantId, 'suspended');
    const res = await agent().get('/api/v1/auth/me').set(authed(tok));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('TENANT_SUSPENDED');
  });

  it('cancelled: nobody can sign in', async () => {
    const t = await registerTenant();
    await setStatus(t.tenantId, 'cancelled');
    const r = await login(t.slug, t.email, t.password);
    expect(r.status).toBe(403);
  });

  it('an expired trial past the 7 day grace counts as suspended without anyone flipping the flag', async () => {
    const t = await registerTenant();
    await addUser(t.tenantId, { role: 'accountant', email: 'acc@example.com' });
    await Tenant.updateOne(
      { _id: t.tenantId },
      { $set: { trialEndsAt: new Date(Date.now() - 8 * 86_400_000) } },
    );
    invalidateTenantStatus(new Types.ObjectId(t.tenantId));
    expect((await login(t.slug, 'acc@example.com', 'Passw0rd!long')).status).toBe(403);
    expect((await login(t.slug, t.email, t.password)).status).toBe(200);
  });

  it('a deactivated user loses access immediately, not after the token expires', async () => {
    const t = await registerTenant();
    const u = await addUser(t.tenantId, { role: 'teacher', email: 'gone@example.com' });
    const tok = (await login(t.slug, 'gone@example.com', 'Passw0rd!long')).body.data.accessToken;
    await runAsTenant(new Types.ObjectId(t.tenantId), () =>
      User.updateOne({ _id: u._id }, { $set: { status: 'inactive' } }),
    );
    expect((await agent().get('/api/v1/auth/me').set(authed(tok))).status).toBe(401);
  });
});
