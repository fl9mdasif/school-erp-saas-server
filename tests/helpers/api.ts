import request from 'supertest';
import { createApp } from '../../src/app';
import { seedPlans } from '../../src/app/modules/plan/plan.seed';

export const app = createApp();
export const agent = () => request(app);

let counter = 0;
export interface TestTenant {
  slug: string;
  email: string;
  password: string;
  token: string;
  cookie: string[];
  tenantId: string;
}

export const registerTenant = async (over: Record<string, unknown> = {}): Promise<TestTenant> => {
  await seedPlans();
  counter += 1;
  const slug = (over.slug as string) ?? `school-${Date.now().toString(36)}-${counter}`;
  const email = (over.adminEmail as string) ?? `admin${counter}-${Date.now()}@example.com`;
  const password = 'Passw0rd!long';
  const res = await agent()
    .post('/api/v1/auth/register-institution')
    .send({
      institutionName: 'Bright Model School',
      institutionType: 'school',
      slug,
      phone: `0171${String(1000000 + counter).slice(-7)}`,
      adminName: 'Head Teacher',
      adminEmail: email,
      password,
      ...over,
    });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return {
    slug: res.body.data.tenant.slug,
    email,
    password,
    token: res.body.data.accessToken,
    cookie: res.headers['set-cookie'] as unknown as string[],
    tenantId: res.body.data.tenant.id,
  };
};

export const login = (slug: string, identifier: string, password: string) =>
  agent().post('/api/v1/auth/login').send({ tenantSlug: slug, identifier, password });

export const authed = (token: string) => ({ Authorization: `Bearer ${token}` });
