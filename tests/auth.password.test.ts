import { afterEach, describe, expect, it } from 'vitest';
import '../src/app/models';
import { getEmailProvider, setEmailProvider, type EmailProvider } from '../src/app/lib/emailProvider';
import { agent, authed, login, registerTenant } from './helpers/api';
import { useTestDb } from './helpers/db';

useTestDb();

const original = getEmailProvider();
afterEach(() => setEmailProvider(original));

const capture = () => {
  const sent: { to: string; body: string }[] = [];
  const p: EmailProvider = { send: async (to, _s, body) => void sent.push({ to, body }) };
  setEmailProvider(p);
  return sent;
};

describe('change password', () => {
  it('requires the old password, then revokes old sessions and issues a new one', async () => {
    const t = await registerTenant();
    const bad = await agent()
      .post('/api/v1/auth/change-password')
      .set(authed(t.token))
      .send({ oldPassword: 'nope-nope-1', newPassword: 'NewPassw0rd!x' });
    expect(bad.status).toBe(400);

    const ok = await agent()
      .post('/api/v1/auth/change-password')
      .set(authed(t.token))
      .send({ oldPassword: t.password, newPassword: 'NewPassw0rd!x' });
    expect(ok.status).toBe(200);
    expect(ok.body.data.accessToken).toBeTruthy();
    expect((await login(t.slug, t.email, t.password)).status).toBe(401);
    expect((await login(t.slug, t.email, 'NewPassw0rd!x')).status).toBe(200);
  });
});

describe('forgot and reset password (admin email flow)', () => {
  it('sends a one-time link and the new password works once', async () => {
    const sent = capture();
    const t = await registerTenant();
    const r = await agent().post('/api/v1/auth/forgot-password').send({ tenantSlug: t.slug, email: t.email });
    expect(r.status).toBe(200);
    expect(sent).toHaveLength(1);
    const token = sent[0].body.match(/token=([\w-]+)/)![1];

    const reset = await agent()
      .post('/api/v1/auth/reset-password')
      .send({ tenantSlug: t.slug, token, newPassword: 'ResetPassw0rd!x' });
    expect(reset.status).toBe(200);
    expect((await login(t.slug, t.email, 'ResetPassw0rd!x')).status).toBe(200);

    const again = await agent()
      .post('/api/v1/auth/reset-password')
      .send({ tenantSlug: t.slug, token, newPassword: 'AnotherPassw0rd!x' });
    expect(again.status).toBe(400);
    expect(again.body.code).toBe('RESET_TOKEN_INVALID');
  });

  it('answers the same way for unknown emails and sends nothing', async () => {
    const sent = capture();
    const t = await registerTenant();
    const known = await agent()
      .post('/api/v1/auth/forgot-password')
      .send({ tenantSlug: t.slug, email: t.email });
    const unknown = await agent()
      .post('/api/v1/auth/forgot-password')
      .send({ tenantSlug: t.slug, email: 'who@example.com' });
    const noSchool = await agent()
      .post('/api/v1/auth/forgot-password')
      .send({ tenantSlug: 'missing-school', email: t.email });
    expect(unknown.body).toEqual(known.body);
    expect(noSchool.body).toEqual(known.body);
    expect(sent).toHaveLength(1);
  });

  it('rejects a token used against another school', async () => {
    const sent = capture();
    const a = await registerTenant();
    const b = await registerTenant();
    await agent().post('/api/v1/auth/forgot-password').send({ tenantSlug: a.slug, email: a.email });
    const token = sent[0].body.match(/token=([\w-]+)/)![1];
    const r = await agent()
      .post('/api/v1/auth/reset-password')
      .send({ tenantSlug: b.slug, token, newPassword: 'ResetPassw0rd!x' });
    expect(r.status).toBe(400);
  });
});
