import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { concurrencyLimit } from '../middleware/concurrency.js';

/** An app whose route holds each request until it is let go */
function holdingApp(max: number) {
  const waiting: Array<() => void> = [];
  const app = express();
  app.post('/work', concurrencyLimit(max, 'Busy'), (_req, res) => {
    waiting.push(() => res.json({ done: true }));
  });
  return { app, waiting };
}

const until = async (check: () => boolean) => {
  while (!check()) await new Promise((resolve) => setTimeout(resolve, 5));
};

describe('concurrencyLimit', () => {
  it('lets max requests through at once, refuses one more, and frees a slot when one ends', async () => {
    const { app, waiting } = holdingApp(2);
    const server = app.listen(0);
    try {
      const first = request(server)
        .post('/work')
        .then((r) => r);
      const second = request(server)
        .post('/work')
        .then((r) => r);
      await until(() => waiting.length === 2);

      const refused = await request(server).post('/work');
      expect(refused.status).toBe(503);
      expect(refused.body).toEqual({ error: 'Busy' });
      expect(refused.headers['retry-after']).toBe('5');

      waiting.shift()!();
      expect((await first).status).toBe(200);
      const third = request(server)
        .post('/work')
        .then((r) => r);
      await until(() => waiting.length === 2);
      for (const done of waiting.splice(0)) done();
      expect((await second).status).toBe(200);
      expect((await third).status).toBe(200);
    } finally {
      server.close();
    }
  });
});
