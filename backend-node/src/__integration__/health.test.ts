import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';

describe('app', () => {
  it('answers the health check', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
  });

  it('answers a malformed JSON body with 400', async () => {
    const res = await request(app)
      .post('/api/organizations')
      .set('Content-Type', 'application/json')
      .send('{"name": ');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });

  it('answers a JSON body over the limit with 413', async () => {
    const res = await request(app)
      .post('/api/organizations')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ name: 'x'.repeat(200_000) }));
    expect(res.status).toBe(413);
    expect(res.body.error).toMatchObject({
      code: 'PAYLOAD_TOO_LARGE',
      message: 'request entity too large',
    });
  });

  it('trusts no proxy by default, so clients cannot forge X-Forwarded-For', () => {
    expect(app.get('trust proxy')).toBe(0);
    expect(app.get('trust proxy fn')('203.0.113.9', 0)).toBe(false);
  });
});
