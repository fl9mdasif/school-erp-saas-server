import { describe, expect, it } from 'vitest';
import { agent, authed, registerTenant } from './helpers/api';
import { useTestDb } from './helpers/db';

useTestDb();

/**
 * Cross-tenant attack suite: tenant A's token against tenant B's data and ids, for every tenant route.
 * Extend ATTACKS whenever a module adds routes; CI blocks merge if any of them leaks.
 */
describe('cross-tenant attacks (phase 1 routes)', () => {
  it('tenant A can never see, edit or reset tenant B users', async () => {
    const a = await registerTenant();
    const b = await registerTenant();
    const bUser = await agent()
      .post('/api/v1/users')
      .set(authed(b.token))
      .send({ role: 'teacher', name: 'B Teacher', email: 'bt@example.com' });
    const bId = bUser.body.data.user.id;

    const ATTACKS: [string, string, object?][] = [
      ['get', `/api/v1/users/${bId}`],
      ['patch', `/api/v1/users/${bId}`, { name: 'Hacked' }],
      ['patch', `/api/v1/users/${bId}/status`, { status: 'inactive' }],
      ['post', `/api/v1/users/${bId}/reset-password`],
    ];
    for (const [method, url, body] of ATTACKS) {
      const res = await (agent() as any)[method](url).set(authed(a.token)).send(body);
      expect([403, 404], `${method} ${url}`).toContain(res.status);
      expect(JSON.stringify(res.body)).not.toContain('B Teacher');
    }

    // B untouched
    const still = await agent().get(`/api/v1/users/${bId}`).set(authed(b.token));
    expect(still.body.data).toMatchObject({ name: 'B Teacher', status: 'active' });
  });

  it('lists only the caller tenant data', async () => {
    const a = await registerTenant();
    const b = await registerTenant();
    await agent()
      .post('/api/v1/users')
      .set(authed(b.token))
      .send({ role: 'teacher', name: 'Only In B', email: 'ob@example.com' });
    const list = await agent().get('/api/v1/users').set(authed(a.token));
    expect(list.body.data.map((u: any) => u.name)).not.toContain('Only In B');
    expect(list.body.meta.total).toBe(1);
  });

  it('a tenantId in the body or query cannot redirect the request to another tenant', async () => {
    const a = await registerTenant();
    const b = await registerTenant();
    const res = await agent()
      .post('/api/v1/users')
      .set(authed(a.token))
      .send({ role: 'teacher', name: 'Spoof', email: 'sp@example.com', tenantId: b.tenantId });
    expect(res.status).toBe(400);
    const q = await agent().get('/api/v1/users').set(authed(a.token)).query({ tenantId: b.tenantId });
    expect(q.status).toBe(400);
  });

  it('a token signed for tenant A with a forged tenant id for B is rejected (user does not exist in B)', async () => {
    const a = await registerTenant();
    const b = await registerTenant();
    const jwt = await import('jsonwebtoken');
    const {
      exp: _e,
      iat: _i,
      ...payload
    } = JSON.parse(Buffer.from(a.token.split('.')[1], 'base64url').toString());
    const forged = jwt.sign({ ...payload, tid: b.tenantId }, 'wrong-secret-0123456789abcdef', {
      expiresIn: '5m',
    });
    expect((await agent().get('/api/v1/users').set(authed(forged))).status).toBe(401);
  });
});
