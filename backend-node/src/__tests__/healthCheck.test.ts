import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { healthCheck, type HealthChecks } from '../health.js';

function appWith(checks: HealthChecks) {
  const app = express();
  app.get('/api/health', healthCheck(checks));
  return app;
}

const mode = () => 'postgresql';

describe('healthCheck', () => {
  it('is healthy when the database answers', async () => {
    const res = await request(appWith({ ping: () => Promise.resolve(), mode })).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'healthy', mode: 'postgresql' });
  });

  it('is unhealthy when the database refuses', async () => {
    const ping = () => Promise.reject(new Error('connect ECONNREFUSED'));
    const res = await request(appWith({ ping, mode })).get('/api/health');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'unhealthy', mode: 'postgresql' });
  });

  it('is unhealthy when the database does not answer in time', async () => {
    const ping = () => new Promise<never>(() => {});
    const res = await request(appWith({ ping, mode, timeoutMs: 20 })).get('/api/health');
    expect(res.status).toBe(503);
  });
});
