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
    expect(requestOriginAllowed(undefined, allowed)).toBe(true);
    expect(requestOriginAllowed('https://evil.scouch.dev', allowed)).toBe(false);
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
  });
});
