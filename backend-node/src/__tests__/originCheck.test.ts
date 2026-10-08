import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import {
  CROSS_SITE,
  originAllowed,
  originCheck,
  requestOriginAllowed,
} from '../middleware/originCheck.js';

const allowed = ['https://robbie.scouch.dev', /^http:\/\/localhost:\d+$/];

describe('originAllowed', () => {
  it("takes the app's origin and the allowed patterns, nothing else", () => {
    expect(originAllowed('https://robbie.scouch.dev', allowed)).toBe(true);
    expect(originAllowed('http://localhost:5173', allowed)).toBe(true);
    for (const origin of [
      'https://evil.scouch.dev',
      'https://robbie.scouch.dev.evil.example',
      'http://robbie.scouch.dev',
      'null',
    ]) {
      expect(originAllowed(origin, allowed), origin).toBe(false);
    }
  });

  it('lets a request without an Origin through (the mobile app, curl)', () => {
    expect(requestOriginAllowed(undefined, 'robbie.scouch.dev', allowed)).toBe(true);
    expect(requestOriginAllowed('https://evil.scouch.dev', 'robbie.scouch.dev', allowed)).toBe(
      false,
    );
  });

  it('takes a page the server itself served, at whatever address it was reached', () => {
    // The demo laptop: APP_URL says localhost, the phones use its LAN address
    const lanApp = ['http://localhost:3301'];
    expect(requestOriginAllowed('http://192.168.1.20:3301', '192.168.1.20:3301', lanApp)).toBe(
      true,
    );
    expect(requestOriginAllowed('http://127.0.0.1:3301', '127.0.0.1:3301', lanApp)).toBe(true);
    // Another port, or another host, on the same network is another site
    expect(requestOriginAllowed('http://192.168.1.20:8080', '192.168.1.20:3301', lanApp)).toBe(
      false,
    );
    expect(requestOriginAllowed('http://192.168.1.99:3301', '192.168.1.20:3301', lanApp)).toBe(
      false,
    );
  });

  it('still refuses a sibling subdomain, and a request without a Host', () => {
    expect(requestOriginAllowed('https://evil.scouch.dev', 'robbie.scouch.dev', allowed)).toBe(
      false,
    );
    expect(requestOriginAllowed('https://evil.scouch.dev', undefined, [])).toBe(false);
    expect(requestOriginAllowed('null', 'robbie.scouch.dev', allowed)).toBe(false);
  });
});

describe('originCheck', () => {
  const app = express();
  app.use(originCheck(allowed));
  app.all('/x', (_req, res) => {
    res.json({ ok: true });
  });

  it("refuses a change from another site's page, and lets reads and the app through", async () => {
    const evil = await request(app).post('/x').set('Origin', 'https://evil.scouch.dev');
    expect(evil.status).toBe(403);
    expect(evil.body).toEqual({ error: CROSS_SITE });
    for (const method of ['put', 'patch', 'delete'] as const) {
      expect((await request(app)[method]('/x').set('Origin', 'null')).status).toBe(403);
    }
    expect((await request(app).get('/x').set('Origin', 'https://evil.scouch.dev')).status).toBe(
      200,
    );
    expect((await request(app).post('/x').set('Origin', 'https://robbie.scouch.dev')).status).toBe(
      200,
    );
    expect((await request(app).post('/x')).status).toBe(200);
    // Same origin: the page came from the host the request went to (supertest's own address)
    const server = app.listen(0);
    try {
      const { port } = server.address() as { port: number };
      const own = await request(server)
        .post('/x')
        .set('Origin', `http://127.0.0.1:${port}`)
        .set('Host', `127.0.0.1:${port}`);
      expect(own.status).toBe(200);
    } finally {
      server.close();
    }
  });
});
