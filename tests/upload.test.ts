import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { env } from '../src/app/config/env';
import { isAllowedMediaUrl } from '../src/app/lib/mediaUrl';
import { CloudinaryUploadProvider } from '../src/app/lib/uploadProvider';
import { agent, authed, login, registerTenant } from './helpers/api';
import { useTestDb } from './helpers/db';

useTestDb();

const e = env as unknown as Record<string, unknown>;
const saved = {
  p: e.UPLOAD_PROVIDER,
  c: e.CLOUDINARY_CLOUD_NAME,
  k: e.CLOUDINARY_API_KEY,
  s: e.CLOUDINARY_API_SECRET,
};
afterEach(() => {
  e.UPLOAD_PROVIDER = saved.p;
  e.CLOUDINARY_CLOUD_NAME = saved.c;
  e.CLOUDINARY_API_KEY = saved.k;
  e.CLOUDINARY_API_SECRET = saved.s;
});
const useCloudinary = () => {
  e.UPLOAD_PROVIDER = 'cloudinary';
  e.CLOUDINARY_CLOUD_NAME = 'demo-school';
  e.CLOUDINARY_API_KEY = '123456789012345';
  e.CLOUDINARY_API_SECRET = 'super-secret-value';
};

describe('Cloudinary client side uploads', () => {
  it('signs exactly the parameters the browser must send, scoped to the tenant folder', () => {
    useCloudinary();
    const s = new CloudinaryUploadProvider().sign({ tenantId: 'tenant1', kind: 'image', folder: 'photos' });
    expect(s.uploadUrl).toBe('https://api.cloudinary.com/v1_1/demo-school/image/upload');
    expect(s.fields.folder).toBe('tenant1/photos');
    expect(s.fields.allowed_formats).toBe('jpg,jpeg,png,webp');
    expect(s.fields.api_key).toBe('123456789012345');
    const toSign = `allowed_formats=jpg,jpeg,png,webp&folder=tenant1/photos&timestamp=${s.fields.timestamp}`;
    expect(s.fields.signature).toBe(
      createHash('sha1')
        .update(toSign + 'super-secret-value')
        .digest('hex'),
    );
    expect(JSON.stringify(s)).not.toContain('super-secret-value');
    expect(s.cloudName).toBe('demo-school');
    expect(s.maxBytes).toBe(2 * 1024 * 1024);
  });

  it('uses the raw endpoint for notice PDFs', () => {
    useCloudinary();
    const s = new CloudinaryUploadProvider().sign({ tenantId: 't', kind: 'pdf', folder: 'notices' });
    expect(s.uploadUrl).toContain('/raw/upload');
    expect(s.fields.allowed_formats).toBeUndefined();
  });

  it('only accepts links from the configured Cloudinary account', () => {
    useCloudinary();
    expect(isAllowedMediaUrl('https://res.cloudinary.com/demo-school/image/upload/v1/t/photos/a.jpg')).toBe(
      true,
    );
    expect(isAllowedMediaUrl('https://res.cloudinary.com/other-account/image/upload/a.jpg')).toBe(false);
    expect(isAllowedMediaUrl('https://evil.example/a.jpg')).toBe(false);
    expect(isAllowedMediaUrl('http://res.cloudinary.com/demo-school/a.jpg')).toBe(false);
    expect(isAllowedMediaUrl('javascript:alert(1)')).toBe(false);
  });

  it('rejects a foreign photo link on the API and accepts a Cloudinary one', async () => {
    const t = await registerTenant();
    useCloudinary();
    const h = authed(t.token);
    const bad = await agent()
      .patch('/api/v1/school/profile')
      .set(h)
      .send({ logoUrl: 'https://evil.example/logo.png' });
    expect(bad.status).toBe(400);
    const good = await agent()
      .patch('/api/v1/school/profile')
      .set(h)
      .send({ logoUrl: 'https://res.cloudinary.com/demo-school/image/upload/v1/x/logo.png' });
    expect(good.status).toBe(200);
  });

  it('the sign endpoint is limited to admins and teacher notice attachments', async () => {
    const t = await registerTenant();
    const h = authed(t.token);
    const ok = await agent().post('/api/v1/uploads/sign').set(h).send({ kind: 'image', folder: 'photos' });
    expect(ok.status).toBe(200);
    expect(ok.body.data.fields.key ?? ok.body.data.fields.folder).toContain(t.tenantId);
    expect(
      (await agent().post('/api/v1/uploads/sign').set(h).send({ kind: 'pdf', folder: 'photos' })).status,
    ).toBe(400);
    await agent()
      .post('/api/v1/users')
      .set(h)
      .send({ role: 'teacher', name: 'Up Loader', email: 'up@example.com', password: 'Teacher#12345' });
    const tTok = authed((await login(t.slug, 'up@example.com', 'Teacher#12345')).body.data.accessToken);
    expect(
      (await agent().post('/api/v1/uploads/sign').set(tTok).send({ kind: 'image', folder: 'photos' })).status,
    ).toBe(403);
    expect(
      (await agent().post('/api/v1/uploads/sign').set(tTok).send({ kind: 'pdf', folder: 'notices' })).status,
    ).toBe(200);
  });
});
