import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { securityHeaders } from '../middleware/securityHeaders.js';

describe('securityHeaders', () => {
  it("keeps Helmet's policy, without upgrading requests to HTTPS", async () => {
    const app = express();
    app.use(securityHeaders());
    app.get('/', (_req, res) => {
      res.send('ok');
    });

    const res = await request(app).get('/');
    const csp = res.headers['content-security-policy'];
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("img-src 'self' data:");
    expect(csp).toContain("object-src 'none'");
    // Caddy redirects HTTP to HTTPS and HSTS keeps browsers there
    expect(csp).not.toContain('upgrade-insecure-requests');
    expect(res.headers['strict-transport-security']).toMatch(/max-age=/);
  });
});
