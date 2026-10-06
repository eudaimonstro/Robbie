import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';

describe('app', () => {
  it('answers the health check', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
  });

  it('trusts no proxy by default, so clients cannot forge X-Forwarded-For', () => {
    expect(app.get('trust proxy')).toBe(0);
    expect(app.get('trust proxy fn')('203.0.113.9', 0)).toBe(false);
  });
});
