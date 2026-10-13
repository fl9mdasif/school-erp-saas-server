import '../../src/app/models';
import { ensureSuperAdmin } from '../../src/app/modules/platform/platform.seed';
import { agent } from './api';

export const platformToken = async (): Promise<string> => {
  await ensureSuperAdmin('owner@test.local', 'OwnerPass123!');
  const res = await agent()
    .post('/api/v1/platform/auth/login')
    .send({ email: 'owner@test.local', password: 'OwnerPass123!' });
  if (res.status !== 200) throw new Error(`platform login failed ${res.status}`);
  return res.body.data.accessToken;
};
