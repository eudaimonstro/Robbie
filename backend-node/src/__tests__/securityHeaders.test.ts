import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { securityHeaders, webSocketOrigin } from '../middleware/securityHeaders.js';

async function policy(appUrl: string) {
  const app = express();
  app.use(securityHeaders(appUrl));
  app.get('/', (_req, res) => {
    res.send('ok');
  });
  return request(app).get('/');
}

/** One directive of the policy, such as "connect-src 'self'" */
function directive(csp: string, name: string): string | undefined {
  return csp.split(';').find((d) => d.startsWith(`${name} `));
}

describe('securityHeaders', () => {
  it("keeps Helmet's policy, without upgrading requests to HTTPS", async () => {
    const res = await policy('https://robbie.scouch.dev');
    const csp = res.headers['content-security-policy'];
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("img-src 'self' data:");
    expect(csp).toContain("object-src 'none'");
    // Caddy redirects HTTP to HTTPS and HSTS keeps browsers there
    expect(csp).not.toContain('upgrade-insecure-requests');
    expect(res.headers['strict-transport-security']).toMatch(/max-age=/);
  });

  it('lets the page open the meeting socket to its own host, and only there', async () => {
    const res = await policy('https://robbie.scouch.dev');
    expect(directive(res.headers['content-security-policy'], 'connect-src')).toBe(
      "connect-src 'self' wss://robbie.scouch.dev",
    );
  });

  it('uses ws: for an app served over http, as in the smoke test', async () => {
    const res = await policy('http://127.0.0.1:3201');
    expect(directive(res.headers['content-security-policy'], 'connect-src')).toBe(
      "connect-src 'self' ws://127.0.0.1:3201",
    );
  });

  it("falls back to 'self' alone for an address that isn't a URL", async () => {
    const res = await policy('robbie.scouch.dev');
    expect(directive(res.headers['content-security-policy'], 'connect-src')).toBe(
      "connect-src 'self'",
    );
  });
});

describe('webSocketOrigin', () => {
  it('keeps the host and port, and drops any path', () => {
    expect(webSocketOrigin('https://robbie.scouch.dev/')).toBe('wss://robbie.scouch.dev');
    expect(webSocketOrigin('http://localhost:5173/meetings')).toBe('ws://localhost:5173');
    expect(webSocketOrigin('ftp://example.org')).toBeNull();
  });
});
