import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { useTestDb } from './helpers/db';

useTestDb();
const app = createApp();

describe('health and error shape', () => {
  it('GET /api/v1/health returns ok with db up', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { status: 'ok', db: 'up' } });
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('unknown route returns the standard error body', async () => {
    const res = await request(app).get('/api/v1/nope');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ success: false, code: 'ROUTE_NOT_FOUND' });
  });

  it('malformed JSON returns VALIDATION_ERROR', async () => {
    const res = await request(app)
      .post('/api/v1/health')
      .set('content-type', 'application/json')
      .send('{bad');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});
