import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serveWebApp } from '../webApp.js';

let dist: string;
let app: express.Express;

beforeAll(() => {
  // A build as Vite writes it: index.html, hashed bundles under assets/, files at the root
  dist = fs.mkdtempSync(path.join(os.tmpdir(), 'robbie-web-'));
  fs.mkdirSync(path.join(dist, 'assets'));
  fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><div id="root"></div>');
  fs.writeFileSync(path.join(dist, 'assets', 'index-abc123.js'), 'console.log("app")');
  fs.writeFileSync(path.join(dist, 'robots.txt'), 'User-agent: *');

  app = express();
  // As in app.ts: unknown API paths are answered before the web app
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });
  serveWebApp(app, dist);
});

afterAll(() => fs.rmSync(dist, { recursive: true, force: true }));

describe('serveWebApp', () => {
  it('serves the app at the root, never cached', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.headers['cache-control']).toBe('no-cache');
    expect(res.text).toContain('<div id="root">');
  });

  it("serves the app for its routes, so a link or a QR code's deep link works", async () => {
    for (const route of ['/meetings/ABC123', '/meetings/ABC123/display', '/share/token123']) {
      const res = await request(app).get(route);
      expect(res.status, route).toBe(200);
      expect(res.headers['cache-control'], route).toBe('no-cache');
      expect(res.text, route).toContain('<div id="root">');
    }
  });

  it('caches the hashed bundles for a year', async () => {
    const res = await request(app).get('/assets/index-abc123.js');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/javascript/);
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  it('answers a missing bundle or file with 404, not the app', async () => {
    for (const missing of ['/assets/index-old999.js', '/vite.svg']) {
      const res = await request(app).get(missing);
      expect(res.status, missing).toBe(404);
      expect(res.text, missing).not.toContain('<div id="root">');
    }
  });

  it('serves the other files at the root', async () => {
    const res = await request(app).get('/robots.txt');
    expect(res.status).toBe(200);
    expect(res.text).toBe('User-agent: *');
  });

  it('leaves the API alone', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not found' });
  });
});
